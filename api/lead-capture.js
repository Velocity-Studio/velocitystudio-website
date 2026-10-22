// Form-submit capture: upsert a Pipedrive Person (keyed by email) with the
// Meta click identifiers (_fbp/_fbc) + lead metadata, at the one moment the
// browser cookies exist. The post-call process-lead skill later reuses this
// Person, so fbp/fbc are already attached when the deal reaches Active SQL.
//
// Three callers:
//   - /start (legacy): sends email + attribution + a client-computed lead_quality.
//   - developer form (/developers, role/size/urgency/scope): developer scoring below.
//   - homepage homeowner form (/, page: 'fast-track', owns/project_type/start/
//     blocker/help): tier rule below. California leads are then forwarded to the
//     secretary server, which researches them and drafts Richman's reply.
// When raw fields are present we recompute the score AUTHORITATIVELY here,
// write a Pipedrive Note, and email Richman.
//
// Dependency-free: Node built-ins only. Email via Resend REST (no SDK).

const https = require('https');
const crypto = require('crypto');

const PD_TOKEN = process.env.PIPEDRIVE_TOKEN;
const RESEND_KEY = process.env.RESEND_API_KEY;                       // optional; email no-ops until set
const LEAD_TO = process.env.LEAD_TO_EMAIL || 'richman.neumann@velocitystud.io';
const LEAD_FROM = process.env.LEAD_FROM_EMAIL || 'Velocity Studio Leads <onboarding@resend.dev>';

// Pipedrive Person custom-field keys (created via API).
const F = {
  fbp:             '7841c7e4a2dfe015f9a5c35aa445c5784b6ef3b1',
  fbc:             '347b74dcafbf6b1ec7a359039dd240839665e701',
  external_id:     '8d6edd1c496274be496787770edf5dba6709d62a',
  lead_created_at: 'e99516949bfdfec88ee84d5a4a8c6202a67ef619',
  lead_quality:    'ba9963674d8028438d398d6bc3e87271cdd1b40d',
  utm_source:      'a8dc7ad5648960c4fa8c3349867cd001ed113be1',
  utm_medium:      '98ed85e6f2e8528df76b2bf9aa444ef032e71bf9',
  utm_campaign:    '502aef7a43210b4cd80ab6401d9a40961ac77b4e',
  utm_content:     '902f42c528ba6e12fe58cafb978bd0fede40ed90',
};

// ─── Lead scoring (mirror of the client weights in index.html) ──────────────
// High is reserved for well-formed ICP fits: developer / developer+GC / design
// partner at real scale (new home or 2+ units). ADU/addition and "other" are
// capped below "high" no matter what, so garage conversions and one-offs don't
// get sent to Meta as strong signal.
const W_ROLE = { pure_developer: 30, developer_gc: 30, pure_gc: 22, architect_engineer: 28, homeowner: 10, other: 5 };
const W_SIZE = { res_addition_adu: 4, res_new_1u: 20, res_2_4u: 32, res_5_9u: 34, res_10_plus_u: 30, com_lt_10k: 20, com_gt_10k: 24 };
const W_URG  = { behind_0_1: 12, fast_1_3: 10, regular_3_6: 6, slow_6_12: 2, brainstorm: 0 };

function scoreLead(b) {
  const s = (W_ROLE[b.role] || 0) + (W_SIZE[b.size] || 0) + (W_URG[b.urgency] || 0);
  let tier;
  if (b.size === 'res_addition_adu' || b.role === 'other') tier = s >= 34 ? 'mid' : 'low';
  else if (s >= 58) tier = 'high';
  else if (s >= 34) tier = 'mid';
  else tier = 'low';
  return { score: s, tier };
}

// ─── Homepage (homeowner) scoring, mirror of the client weights in index.html ─
// High = in California, owns or in contract, a listed building type, wants to
// start within 3 months, and nothing has to happen first. Anything else in
// California is "mid"; out of state is "low". The Oct 20 form's fields (timing /
// reason) are mapped onto start / blocker so a cached old page still scores.
const FT_OWNS    = { yes: 30, in_contract: 25, no: 0 };
const FT_TYPE    = { detached_adu: 25, attached_adu: 25, garage_conversion: 25, renovation_addition: 25, new_home_duplex: 25, other: 0 };
const FT_START   = { asap: 30, '1_3_months': 20, '3_6_months': 10, later_or_unsure: 0 };
const FT_BLOCKER = { ready_contractor: 15, ready: 12, closing: 8, financing: 5, other: 3, deciding: 0 };
const OLD_TIMING = { within_2_weeks: 'asap', within_month: 'asap', '1_3_months': '1_3_months', not_sure: 'later_or_unsure' };
const OLD_REASON = { contractor_waiting: 'ready_contractor', moving_in: 'ready', loan_sale_deadline: 'ready', fire_rebuild: 'ready', no_deadline: 'deciding' };

function outsideCalifornia(b) { return !!b.state && String(b.state).trim().toUpperCase() !== 'CA'; }
function ftStart(b) { return b.start || OLD_TIMING[b.timing] || ''; }
function ftBlocker(b) { return b.blocker || OLD_REASON[b.reason] || ''; }
function fastTrackHigh(b) {
  return !outsideCalifornia(b)
    && (b.owns === 'yes' || b.owns === 'in_contract')
    && !!b.project_type && b.project_type !== 'other'
    && (ftStart(b) === 'asap' || ftStart(b) === '1_3_months')
    && (ftBlocker(b) === 'ready' || ftBlocker(b) === 'ready_contractor');
}
function scoreFastTrack(b) {
  const s = (FT_OWNS[b.owns] || 0) + (FT_TYPE[b.project_type] || 0) + (FT_START[ftStart(b)] || 0) + (FT_BLOCKER[ftBlocker(b)] || 0);
  const pass = fastTrackHigh(b);
  return { score: s, tier: outsideCalifornia(b) ? 'low' : pass ? 'high' : 'mid', pass };
}
function isFastTrack(b) {
  return b.page === 'fast-track' || b.source === 'fast-track' || (!!b.owns && !!b.project_type && !!(b.start || b.timing));
}

// ─── Forward to the secretary server, which researches the lead and drafts
// Richman's reply (Gmail draft + review email; nothing is sent to the lead).
// Awaited with a short timeout so the serverless function does not exit first;
// the secretary answers 202 immediately and does the work in the background.
const SECRETARY_URL    = process.env.SECRETARY_URL;              // e.g. https://<service>.up.railway.app
const SECRETARY_SECRET = process.env.SECRETARY_SITE_LEAD_SECRET; // matches SITE_LEAD_SECRET on Railway

function forwardToSecretary(payload) {
  return new Promise((resolve) => {
    if (!SECRETARY_URL || !SECRETARY_SECRET) { resolve({ skipped: 'not configured' }); return; }
    // Never throws: a forwarding problem must not fail the lead capture itself.
    try {
      const data = JSON.stringify(payload);
      const url = new URL('/webhook/site-lead', SECRETARY_URL);
      const mod = url.protocol === 'http:' ? require('http') : https; // http only for local testing
      const req = mod.request(url, {
        method: 'POST', timeout: 6000,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'x-vs-secret': SECRETARY_SECRET },
      }, (r) => { r.resume(); r.on('end', () => resolve({ status: r.statusCode })); });
      req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
      req.on('error', (e) => resolve({ error: String(e.message || e) }));
      req.write(data); req.end();
    } catch (e) {
      resolve({ error: String(e.message || e) });
    }
  });
}

// Rough well-formedness gate (a proper LLM judge comes later, server-side).
function wellFormed(b) {
  const scope = (b.scope || '').trim();
  const addr = (b.address || '').trim();
  return scope.length >= 12 && /\d|,/.test(addr) && addr.length >= 6;
}

const ROLE_LABEL = { pure_developer: 'Developer', developer_gc: 'Developer + GC', pure_gc: 'General contractor', architect_engineer: 'Architect / Engineer', homeowner: 'Homeowner', other: 'Other' };
const SIZE_LABEL = { res_addition_adu: 'Addition / alteration / ADU', res_new_1u: 'New construction (1 unit)', res_2_4u: '2 - 4 units', res_5_9u: '5 - 9 units', res_10_plus_u: '10+ units', com_lt_10k: 'Commercial < 10k sf', com_gt_10k: 'Commercial > 10k sf' };
const URG_LABEL  = { behind_0_1: 'ASAP - already behind', fast_1_3: 'Fast (1-3 mo)', regular_3_6: 'Regular (3-6 mo)', slow_6_12: 'Slower (6-12 mo)', brainstorm: 'Just exploring' };
const FT_OWNS_LABEL   = { yes: 'Owns', in_contract: 'In contract', no: 'Does not own' };
const FT_TYPE_LABEL   = { detached_adu: 'Detached ADU or JADU', attached_adu: 'Attached ADU', garage_conversion: 'Garage conversion', renovation_addition: 'Interior renovation or addition', new_home_duplex: 'New home or duplex', other: 'Something else' };
const FT_DETAIL_LABEL = { flat: 'Backyard flat', gentle: 'Backyard gently sloped', steep: 'Backyard steep', shares_yes: 'Shares stairs, a door, or heating with the house', shares_no: 'Does not share stairs, doors, or heating', new_space: 'New space', attached_yes: 'Garage attached', attached_no: 'Garage detached', adding: 'Adding square footage', inside_only: 'Inside changes only', vacant: 'Vacant lot', teardown: 'Replacing a house', fire_rebuild: 'Fire rebuild' };
const FT_START_LABEL   = { asap: 'Right away', '1_3_months': 'In 1 to 3 months', '3_6_months': 'In 3 to 6 months', later_or_unsure: 'Later, or not sure' };
const FT_BLOCKER_LABEL = { ready: 'Nothing, ready', ready_contractor: 'Nothing, contractor ready', financing: 'Financing', closing: 'Closing on the property', deciding: 'Deciding if it is worth it', other: 'Something else' };
const FT_HELP_LABEL    = { cost: 'Cost ballpark', plan: 'Step-by-step plan', economics: 'Rent vs sell math', hire: 'Ready to start a permit set' };
const FT_TIMING_LABEL = { within_2_weeks: 'Within 2 weeks', within_month: 'Within a month', '1_3_months': '1 to 3 months', not_sure: 'Not sure' };
const FT_REASON_LABEL = { contractor_waiting: 'Contractor is waiting', moving_in: 'Someone is moving in', loan_sale_deadline: 'Loan or sale deadline', fire_rebuild: 'Fire rebuild', no_deadline: 'No deadline yet' };
const FT_CONTR_LABEL  = { chosen: 'Chosen', getting_bids: 'Getting bids', not_yet: 'Not yet' };
const FT_REVIEW_LABEL = { no: 'No', hoa: 'HOA', planning_review: 'Planning review', not_sure: 'Not sure' };
const FT_DOC_LABEL    = { have_it: 'Has it', need_help: 'Needs help getting it', not_needed: 'Says not needed' };

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function pd(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const sep = path.includes('?') ? '&' : '?';
    const req = https.request(
      'https://api.pipedrive.com' + path + sep + 'api_token=' + PD_TOKEN,
      { method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} },
      (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => {
          try { resolve({ status: r.statusCode, json: JSON.parse(d || '{}') }); }
          catch (e) { resolve({ status: r.statusCode, json: null, raw: d }); }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function sendEmail(subject, html) {
  return new Promise((resolve) => {
    if (!RESEND_KEY) { resolve({ skipped: true }); return; }
    const payload = JSON.stringify({ from: LEAD_FROM, to: [LEAD_TO], subject, html });
    const req = https.request('https://api.resend.com/emails',
      { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + RESEND_KEY, 'Content-Length': Buffer.byteLength(payload) } },
      (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => resolve({ status: r.statusCode, body: d })); });
    req.on('error', () => resolve({ error: true }));
    req.write(payload); req.end();
  });
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.statusCode = 405; return res.end('Method Not Allowed'); }

  const b = await readBody(req);
  const email = (b.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) { res.statusCode = 400; return res.end(JSON.stringify({ ok: false, error: 'email required' })); }

  // Which caller: fast-track homeowner form, developer form, or legacy /start
  // (which sends only a precomputed lead_quality).
  const fast = isFastTrack(b);
  const outside = fast && outsideCalifornia(b);
  const hasDev = !fast && !!(b.role && b.size);
  const hasRaw = fast || hasDev;
  const scored = fast ? scoreFastTrack(b) : hasDev ? scoreLead(b) : { score: b.lead_score || '', tier: b.lead_quality || '' };
  const tier = scored.tier || '';

  const custom = {
    [F.lead_created_at]: b.lead_created_at || String(Math.floor(Date.now() / 1000)),
    [F.lead_quality]:    tier,
  };
  if (b.fbp) custom[F.fbp] = b.fbp;
  if (b.fbc) custom[F.fbc] = b.fbc;
  if (b.utm_source) custom[F.utm_source] = b.utm_source;
  if (b.utm_medium) custom[F.utm_medium] = b.utm_medium;
  if (b.utm_campaign) custom[F.utm_campaign] = b.utm_campaign;
  if (b.utm_content) custom[F.utm_content] = b.utm_content;

  const diag = { tokenPresent: !!PD_TOKEN, resendConfigured: !!RESEND_KEY, hasRaw, fast, tier, pass: fast ? scored.pass : undefined };
  try {
    const search = await pd('GET', '/v1/persons/search?term=' + encodeURIComponent(email) + '&fields=email&exact_match=true');
    diag.searchStatus = search.status;
    const items = (search.json && search.json.data && search.json.data.items) || [];
    let personId = items.length ? items[0].item.id : null;

    if (personId) {
      const upd = Object.assign({}, custom);
      if (b.phone) upd.phone = [{ value: b.phone, primary: true }];
      const u = await pd('PUT', '/v1/persons/' + personId, upd);
      diag.updateStatus = u.status;
    } else {
      const create = await pd('POST', '/v1/persons', Object.assign({
        name: b.name || email,
        email: [{ value: email, primary: true }],
      }, b.phone ? { phone: [{ value: b.phone, primary: true }] } : {}, custom));
      diag.createStatus = create.status;
      personId = create.json && create.json.data ? create.json.data.id : null;
    }
    diag.personId = personId;

    if (personId) {
      await pd('PUT', '/v1/persons/' + personId, { [F.external_id]: String(personId) });
    }

    // Rich intake (home form): write a Pipedrive Note if the person write succeeded,
    // and email Richman REGARDLESS of Pipedrive so a lead is never silently lost.
    if (hasRaw) {
      const wf = fast ? true : wellFormed(b);
      const srcRow = ['Source', [b.utm_source, b.utm_medium, b.utm_campaign, b.utm_content].filter(Boolean).join(' / ') || 'direct'];
      const help = Array.isArray(b.help) ? b.help : (b.help ? String(b.help).split(',') : []);
      const rows = fast
        ? [
            ['Lead tier', (tier || '').toUpperCase() + ' (score ' + scored.score + ')' + (scored.pass ? ' - ready now' : '')],
            ['Name', b.name], ['Email', email], ['Phone', b.phone || '-'],
            ['Address', b.address],
            ['Service area', outside ? 'OUTSIDE CALIFORNIA - declined on the page, no research' : 'California - reply draft is being researched'],
            ['Owns', FT_OWNS_LABEL[b.owns] || b.owns],
            ['Building', FT_TYPE_LABEL[b.project_type] || b.project_type],
            ['Detail', FT_DETAIL_LABEL[b.detail] || b.detail || '-'],
            ['Size', b.size_text || '-'],
            ['Wants help with', help.map((h) => FT_HELP_LABEL[h] || h).join(', ') || '-'],
            ['Start building', FT_START_LABEL[b.start] || b.start || '-'],
            ['Has to happen first', FT_BLOCKER_LABEL[b.blocker] || b.blocker || '-'],
            ['Notes', b.notes || '-'],
          ].concat(b.timing ? [ // Oct 20 form fields, if a cached old page sent them
            ['Submit by (old form)', FT_TIMING_LABEL[b.timing] || b.timing],
            ['Timing reason (old form)', FT_REASON_LABEL[b.reason] || b.reason || '-'],
            ['Contractor (old form)', FT_CONTR_LABEL[b.contractor] || b.contractor || '-'],
            ['HOA / review (old form)', FT_REVIEW_LABEL[b.review] || b.review || '-'],
            ['Topographic survey (old form)', FT_DOC_LABEL[b.topo_survey] || b.topo_survey || '-'],
            ['Soils report (old form)', FT_DOC_LABEL[b.soils_report] || b.soils_report || '-'],
          ] : []).concat([srcRow])
        : [
            ['Lead tier', (tier || '').toUpperCase() + ' (score ' + scored.score + ')' + (wf ? '' : ' - NEEDS MORE INFO')],
            ['Name', b.name], ['Email', email], ['Phone', b.phone || '-'],
            ['Role', ROLE_LABEL[b.role] || b.role], ['Size', SIZE_LABEL[b.size] || b.size], ['Timeline', URG_LABEL[b.urgency] || b.urgency],
            ['Address', b.address], ['Scope', b.scope],
            srcRow,
          ];
      const formName = fast ? 'Fast-track qualify form (homepage)' : 'Website lead form (developers)';
      if (personId) {
        const noteHtml = '<b>' + formName + '</b><br>' + rows.map((r) => '<b>' + esc(r[0]) + ':</b> ' + esc(r[1])).join('<br>');
        const nt = await pd('POST', '/v1/notes', { person_id: personId, content: noteHtml, pinned_to_person_flag: 1 });
        diag.noteStatus = nt.status;
      }
      const crmLine = personId
        ? 'Pipedrive person #' + personId + '.'
        : 'WARNING: the Pipedrive write FAILED (search ' + diag.searchStatus + ' / create ' + diag.createStatus + ') - PIPEDRIVE_TOKEN is probably not set for this environment. The lead is captured in this email only.';
      const subj = (fast ? 'Homepage lead [' : 'New lead [') + (tier || '?').toUpperCase() + (fast && outside ? ' OUT OF STATE' : '') + ']: ' + (b.name || email) + ' - ' + (b.address || '');
      const emailRes = await sendEmail(subj,
        '<h2 style="margin:0 0 8px">' + esc(formName) + ' - ' + esc((tier || '').toUpperCase()) + ' (score ' + scored.score + ')' + (fast ? (scored.pass ? ' &middot; ready now' : '') : (wf ? '' : ' &middot; needs more info')) + '</h2>'
        + '<table cellpadding="4" style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse">'
        + rows.slice(1).map((r) => '<tr><td style="color:#6B6560">' + esc(r[0]) + '</td><td><b>' + esc(r[1]) + '</b></td></tr>').join('')
        + '</table><p style="font-family:Arial,sans-serif;font-size:13px;color:#6B6560">' + esc(crmLine)
        + (fast && !outside ? ' A researched reply draft will land in your Gmail drafts in a few minutes, with a separate review email.' : '')
        + ' Reply within one business day.</p>');
      diag.email = emailRes.skipped ? 'skipped(no RESEND_API_KEY)' : (emailRes.error ? 'error' : (emailRes.status || 'sent'));

      // California homepage leads: hand off to the secretary for the researched reply.
      if (fast && !outside) {
        const fwd = await forwardToSecretary({
          submission_id: crypto.createHash('sha256').update(email + '|' + (b.lead_created_at || '')).digest('hex').slice(0, 32),
          received_at: new Date().toISOString(),
          tier, score: scored.score, pipedrive_person_id: personId,
          utm: { utm_source: b.utm_source || '', utm_medium: b.utm_medium || '', utm_campaign: b.utm_campaign || '', utm_content: b.utm_content || '' },
          lead: { name: b.name || '', email, phone: b.phone || '' },
          project: {
            street: b.street || '', city: b.city || '', state: b.state || '', address: b.address || '',
            owns: b.owns || '', project_type: b.project_type || '', detail: b.detail || '', size_text: b.size_text || '',
            start: b.start || '', blocker: b.blocker || '', help, notes: b.notes || '',
            // Oct 20 form fields, if a cached old page sent them
            timing: b.timing || '', reason: b.reason || '', contractor: b.contractor || '', review: b.review || '',
            topo_survey: b.topo_survey || '', soils_report: b.soils_report || '', other_quotes: b.other_quotes || '',
          },
        });
        diag.forward = fwd.status || fwd.error || fwd.skipped;
      }
    }

    console.log('lead-capture', JSON.stringify(diag));
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, person_id: personId, tier, score: scored.score, diag }));
  } catch (e) {
    console.error('lead-capture error', String(e), JSON.stringify(diag));
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: String(e), diag }));
  }
};
