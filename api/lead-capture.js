// Form-submit capture: upsert a Pipedrive Person (keyed by email) with the
// Meta click identifiers (_fbp/_fbc) + lead metadata, at the one moment the
// browser cookies exist. The post-call process-lead skill later reuses this
// Person, so fbp/fbc are already attached when the deal reaches Active SQL.
//
// Two callers:
//   - /start (legacy): sends email + attribution + a client-computed lead_quality.
//   - home CTA form: sends the full intake (name/phone/role/size/urgency/address/
//     scope). When those raw fields are present we recompute the score
//     AUTHORITATIVELY here, write a Pipedrive Note, and email Richman.
//
// Dependency-free: Node built-ins only. Email via Resend REST (no SDK).

const https = require('https');

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

// Rough well-formedness gate (a proper LLM judge comes later, server-side).
function wellFormed(b) {
  const scope = (b.scope || '').trim();
  const addr = (b.address || '').trim();
  return scope.length >= 12 && /\d|,/.test(addr) && addr.length >= 6;
}

const ROLE_LABEL = { pure_developer: 'Developer', developer_gc: 'Developer + GC', pure_gc: 'General contractor', architect_engineer: 'Architect / Engineer', homeowner: 'Homeowner', other: 'Other' };
const SIZE_LABEL = { res_addition_adu: 'Addition / alteration / ADU', res_new_1u: 'New construction (1 unit)', res_2_4u: '2 - 4 units', res_5_9u: '5 - 9 units', res_10_plus_u: '10+ units', com_lt_10k: 'Commercial < 10k sf', com_gt_10k: 'Commercial > 10k sf' };
const URG_LABEL  = { behind_0_1: 'ASAP - already behind', fast_1_3: 'Fast (1-3 mo)', regular_3_6: 'Regular (3-6 mo)', slow_6_12: 'Slower (6-12 mo)', brainstorm: 'Just exploring' };

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

  // Rich intake (home form) vs legacy (/start sends only a precomputed lead_quality).
  const hasRaw = !!(b.role && b.size);
  const scored = hasRaw ? scoreLead(b) : { score: b.lead_score || '', tier: b.lead_quality || '' };
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

  try {
    const search = await pd('GET', '/v1/persons/search?term=' + encodeURIComponent(email) + '&fields=email&exact_match=true');
    const items = (search.json && search.json.data && search.json.data.items) || [];
    let personId = items.length ? items[0].item.id : null;

    if (personId) {
      const upd = Object.assign({}, custom);
      if (b.phone) upd.phone = [{ value: b.phone, primary: true }];
      await pd('PUT', '/v1/persons/' + personId, upd);
    } else {
      const create = await pd('POST', '/v1/persons', Object.assign({
        name: b.name || email,
        email: [{ value: email, primary: true }],
      }, b.phone ? { phone: [{ value: b.phone, primary: true }] } : {}, custom));
      personId = create.json && create.json.data ? create.json.data.id : null;
    }

    if (personId) {
      await pd('PUT', '/v1/persons/' + personId, { [F.external_id]: String(personId) });
    }

    // Rich intake -> Pipedrive Note + email to Richman.
    if (hasRaw && personId) {
      const wf = wellFormed(b);
      const rows = [
        ['Lead tier', (tier || '').toUpperCase() + ' (score ' + scored.score + ')' + (wf ? '' : ' - NEEDS MORE INFO')],
        ['Name', b.name], ['Email', email], ['Phone', b.phone || '-'],
        ['Role', ROLE_LABEL[b.role] || b.role], ['Size', SIZE_LABEL[b.size] || b.size], ['Timeline', URG_LABEL[b.urgency] || b.urgency],
        ['Address', b.address], ['Scope', b.scope],
        ['Source', [b.utm_source, b.utm_medium, b.utm_campaign, b.utm_content].filter(Boolean).join(' / ') || 'direct'],
      ];
      const noteHtml = '<b>Website lead form</b><br>' + rows.map((r) => '<b>' + esc(r[0]) + ':</b> ' + esc(r[1])).join('<br>');
      await pd('POST', '/v1/notes', { person_id: personId, content: noteHtml });

      const subj = 'New lead [' + (tier || '?').toUpperCase() + ']: ' + (b.name || email) + ' - ' + (b.address || '');
      await sendEmail(subj,
        '<h2 style="margin:0 0 8px">New website lead - ' + esc((tier || '').toUpperCase()) + ' (score ' + scored.score + ')' + (wf ? '' : ' &middot; needs more info') + '</h2>'
        + '<table cellpadding="4" style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse">'
        + rows.slice(1).map((r) => '<tr><td style="color:#6B6560">' + esc(r[0]) + '</td><td><b>' + esc(r[1]) + '</b></td></tr>').join('')
        + '</table><p style="font-family:Arial,sans-serif;font-size:13px;color:#6B6560">Pipedrive person #' + personId + '. Reply within one business day.</p>');
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, person_id: personId, tier: tier, score: scored.score }));
  } catch (e) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: String(e) }));
  }
};
