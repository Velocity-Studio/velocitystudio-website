// Pipedrive change webhook -> Meta Conversions API.
//
//   Person: initial_quality_score set/changed  -> LeadQualityScored (computed value)
//   Deal:   enters Active SQL (stage 4)        -> QualifiedLead     (computed value, falls back to flat)
//   Deal:   enters Terms Agreed (stage 10)      -> TermsAgreed       (computed value, falls back to flat)
//   Deal:   resolved_outcome set to a DISQUALIFYING reason -> LeadDisqualified (value corrected to $0)
//   Deal:   resolved_outcome set to a FROZEN reason        -> nothing sent (see below)
//   Deal:   status changes to "won"             -> Purchase          (actual deal value)
//
// resolved_outcome splits into two kinds, and only one of them should ever
// correct Meta's estimate down to $0:
//   DISQUALIFIED (the lead is confirmed dead — sending $0 is honest, new
//     information): price_too_high, flaked_no_response, poor_fit,
//     project_died_unrelated, went_competitor.
//   FROZEN (the lead just isn't being pursued RIGHT NOW, but nothing about
//     its true value is actually known to have changed — sending $0 here
//     would be false information, not a correction): timeline_mismatch,
//     not_ready_yet. These fire no CAPI event at all; Meta keeps whichever
//     value it was last given until the deal genuinely resolves one way or
//     the other (including possibly reopening later and eventually winning
//     or being disqualified for real).
//
// "Computed value" = lookup(initial_quality_score) via SCORE_VALUE_TABLE below.
// Falls back to the old flat QL_VALUE/AGREED_VALUE constants only when a lead
// has never been scored, so already-in-flight deals keep working during rollout.
//
// Matching data (email, fbp, fbc, external_id, name) is read from the Person.
// Per the spec, send even when fbp/fbc are absent — CAPI falls back to
// email/phone matching. Idempotent via the deal's meta_event_sent field
// (deal-triggered events) or by diffing current vs previous (person-triggered).
//
// Dependency-free: Node built-ins only.

const https = require('https');
const crypto = require('crypto');

const PD_TOKEN     = process.env.PIPEDRIVE_TOKEN;
const META_TOKEN   = process.env.META_CAPI_TOKEN;
const PIXEL_ID     = process.env.META_PIXEL_ID || '778078978037243';
const WH_SECRET    = process.env.PD_WEBHOOK_SECRET;          // shared secret in Pipedrive basic-auth
const TEST_CODE    = process.env.META_TEST_EVENT_CODE || ''; // set during QA, unset for production
const QL_VALUE     = Number(process.env.QUALIFIED_LEAD_VALUE || 500);
const AGREED_VALUE = Number(process.env.AGREED_TERMS_VALUE || 5000);
const QUALIFIED_STAGE_ID = 4;   // "Qualified"     -> QualifiedLead
const TERMS_STAGE_ID     = 10;  // "Terms Agreed"  -> TermsAgreed
const GRAPH_VER    = 'v21.0';

// Person custom-field keys.
const P = {
  fbp:          '7841c7e4a2dfe015f9a5c35aa445c5784b6ef3b1',
  fbc:          '347b74dcafbf6b1ec7a359039dd240839665e701',
  external_id:  '8d6edd1c496274be496787770edf5dba6709d62a',
  utm_source:   'a8dc7ad5648960c4fa8c3349867cd001ed113be1',
  utm_medium:   '98ed85e6f2e8528df76b2bf9aa444ef032e71bf9',
  utm_campaign: '502aef7a43210b4cd80ab6401d9a40961ac77b4e',
  utm_content:  '902f42c528ba6e12fe58cafb978bd0fede40ed90',
  // Lead-scoring fields — see src/utils/pipedrive.js SCORING_FIELDS in the
  // secretary repo (kept in sync manually since this is a separate deploy).
  initial_quality_score: '68ff1c1b8c0625001376b6208be2cd59bf96445f',
  lead_value_score:      'f8a7f35786ffa4c51c6d5b488129dcfd6e8e188d',
};
// Deal custom-field keys.
const D = {
  meta_event_sent:    '1089106fb5b00013626baad5c3a4dfafc4846bef',
  meta_event_sent_at: '5c056b945a5d5c235b0e6c9be4bc52cad235b1be',
  utm_source:   'eab661079a707656d787d8dacb3ba4c378a45cd7',
  utm_medium:   '9d73b4d3f363783ac293fb07d8565581dff9bbe8',
  utm_campaign: '4c3ed4f23bda7bcf3fc6d64fa1a1b699d87f6f96',
  utm_content:  'b36f49b59395ce423975d33fc9e75d1f16ad5d36',
  resolved_outcome: 'b8d4eca216e7dd51d1110a9c2ff3c9ef63666bc4',
};
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];

// Resolved Outcome enum option ids (Pipedrive stores enum values by numeric id).
// See the file-header comment for the reasoning behind this split.
const RESOLVED_OUTCOME = {
  SIGNED_WON: 39,
  // price_too_high, flaked_no_response, poor_fit, project_died_unrelated, went_competitor
  DISQUALIFIED: new Set([40, 41, 43, 44, 45]),
  // timeline_mismatch, not_ready_yet — deliberately NOT in DISQUALIFIED: these
  // pause the deal without telling Meta anything new about its true value.
  FROZEN: new Set([42, 46]),
};

// Score -> $ value, calibrated against confirmed real outcomes (Aug 2026).
// Convex on purpose: each point above 7 is worth several times the last one,
// because real outcomes are power-law shaped, not linear. Revisit quarterly,
// not more often — a constantly-retuned curve is noise to Meta, not signal.
function scoreToValue(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return null;
  if (s <= 2) return 0;
  if (s <= 4) return 250;
  if (s <= 6) return 1500;
  if (s <= 8) return 7500;
  if (s <= 9) return 20000;
  return 40000; // 10 — provisional ceiling; no confirmed score-10 outcome yet
}

const sha = (v) => crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');

function pd(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const sep = path.includes('?') ? '&' : '?';
    const req = https.request(
      'https://api.pipedrive.com' + path + sep + 'api_token=' + PD_TOKEN,
      { method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} },
      (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } }); },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function metaSend(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request(
      { hostname: 'graph.facebook.com', path: '/' + GRAPH_VER + '/' + PIXEL_ID + '/events?access_token=' + encodeURIComponent(META_TOKEN), method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => resolve({ status: r.statusCode, body: d })); },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } }); });
}

function checkAuth(req) {
  if (!WH_SECRET) return true; // no secret configured -> skip (not recommended)
  const h = req.headers['authorization'] || '';
  if (!h.startsWith('Basic ')) return false;
  const decoded = Buffer.from(h.slice(6), 'base64').toString('utf8'); // "user:pass"
  return decoded.split(':')[1] === WH_SECRET;
}

function buildUserData(person) {
  const fbp = person[P.fbp] || '';
  const fbc = person[P.fbc] || '';
  const extId = person[P.external_id] || String(person.id || '');
  const email = (person.email && person.email[0] && person.email[0].value) || '';
  const phone = (person.phone && person.phone[0] && person.phone[0].value) || '';

  const user_data = {};
  if (email) user_data.em = [sha(email)];
  if (phone) user_data.ph = [sha(phone.replace(/[^0-9]/g, ''))];
  if (fbp) user_data.fbp = fbp; // NOT hashed
  if (fbc) user_data.fbc = fbc; // NOT hashed
  user_data.external_id = [sha(extId)];
  if (person.first_name) user_data.fn = [sha(person.first_name)];
  if (person.last_name) user_data.ln = [sha(person.last_name)];
  return user_data;
}

async function sendCapiEvent(eventName, value, person) {
  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'system_generated',
      event_source_url: 'https://velocitystud.io/start',
      user_data: buildUserData(person),
      custom_data: { currency: 'USD', value },
    }],
  };
  if (TEST_CODE) payload.test_event_code = TEST_CODE;

  console.log('[pd-meta-webhook] sending to PIXEL_ID=%s test_event_code=%s payload=%s',
    PIXEL_ID, JSON.stringify(TEST_CODE), JSON.stringify(payload));

  const sent = await metaSend(payload);
  let metaJson = {}; try { metaJson = JSON.parse(sent.body); } catch {}
  console.log('[pd-meta-webhook] raw meta response status=%s body=%s', sent.status, sent.body);
  return { ok: sent.status === 200 && metaJson.events_received >= 1, status: sent.status, meta: metaJson };
}

// ── Person-triggered: initial_quality_score set or changed ───────────────────
async function handlePersonEvent(current, previous, res) {
  const currScore = current[P.initial_quality_score];
  const prevScore = previous[P.initial_quality_score];
  console.log('[pd-meta-webhook] person event. id=%s currScore=%o prevScore=%o keys=%s',
    current.id, currScore, prevScore, Object.keys(current).slice(0, 40).join(','));

  if (currScore == null || String(currScore) === String(prevScore)) {
    console.log('[pd-meta-webhook] skip: no quality-score change');
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, skipped: 'no quality-score change' }));
  }

  const value = scoreToValue(currScore);
  if (value == null) {
    console.log('[pd-meta-webhook] skip: unparseable score', currScore);
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, skipped: 'unparseable score: ' + currScore }));
  }
  console.log('[pd-meta-webhook] computed value=%d for score=%s, sending LeadQualityScored', value, currScore);

  // Write lead_value_score first — this PUT will itself trigger another
  // person.updated webhook call, but that call won't touch
  // initial_quality_score, so the guard above makes it a no-op. No loop.
  const putResult = await pd('PUT', '/v1/persons/' + current.id, { [P.lead_value_score]: value });
  console.log('[pd-meta-webhook] lead_value_score PUT result:', JSON.stringify(putResult).slice(0, 300));

  const result = await sendCapiEvent('LeadQualityScored', value, current);
  console.log('[pd-meta-webhook] CAPI send result:', JSON.stringify(result).slice(0, 500));
  res.statusCode = result.ok ? 200 : 502;
  return res.end(JSON.stringify({ ok: result.ok, event: 'LeadQualityScored', value, meta: result.meta }));
}

// ── Deal-triggered: stage change, won, or resolved_outcome correction ────────
async function handleDealEvent(current, previous, res) {
  const enteredQualified = current.stage_id === QUALIFIED_STAGE_ID && previous.stage_id !== QUALIFIED_STAGE_ID;
  const enteredTerms     = current.stage_id === TERMS_STAGE_ID && previous.stage_id !== TERMS_STAGE_ID;
  const becameWon        = current.status === 'won' && previous.status !== 'won';
  const outcomeChanged   = String(current[D.resolved_outcome]) !== String(previous[D.resolved_outcome]);
  const becameDisqualified = outcomeChanged && RESOLVED_OUTCOME.DISQUALIFIED.has(Number(current[D.resolved_outcome]));
  const becameFrozen       = outcomeChanged && RESOLVED_OUTCOME.FROZEN.has(Number(current[D.resolved_outcome]));

  let eventName = null;
  let needsPersonValue = false; // true when value should come from lead_value_score
  if (becameWon)               { eventName = 'Purchase'; }
  else if (becameDisqualified) { eventName = 'LeadDisqualified'; } // value forced to 0 below
  else if (becameFrozen)       { /* frozen: paused, not disproven — send nothing */ }
  else if (enteredTerms)       { eventName = 'TermsAgreed';   needsPersonValue = true; }
  else if (enteredQualified)   { eventName = 'QualifiedLead'; needsPersonValue = true; }

  console.log('[pd-meta-webhook] deal event. id=%s stage %s->%s status %s->%s outcome %s->%s decided=%s frozen=%s',
    current.id, previous.stage_id, current.stage_id, previous.status, current.status,
    previous[D.resolved_outcome], current[D.resolved_outcome], eventName, becameFrozen);

  if (!eventName) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, skipped: becameFrozen ? 'frozen outcome — no Meta correction sent' : 'no trigger' }));
  }

  // Idempotency: skip if this event already sent for this deal.
  const alreadySent = String(current[D.meta_event_sent] || '');
  if (alreadySent.split(',').includes(eventName)) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, skipped: 'already sent ' + eventName }));
  }

  const pid = current.person_id && typeof current.person_id === 'object' ? current.person_id.value : current.person_id;
  if (!pid) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, skipped: 'no person' }));
  }
  const personResp = await pd('GET', '/v1/persons/' + pid);
  const person = (personResp && personResp.data) || {};

  // Self-healing campaign attribution: copy the lead's UTMs onto the deal if
  // the deal doesn't have them yet. Independent of Meta-attributability.
  const utmPatch = {};
  UTM_KEYS.forEach((k) => { if (!current[D[k]] && person[P[k]]) utmPatch[D[k]] = person[P[k]]; });
  if (Object.keys(utmPatch).length) { await pd('PUT', '/v1/deals/' + current.id, utmPatch); }

  let value;
  if (eventName === 'Purchase') {
    value = Number(current.value || 0);
  } else if (eventName === 'LeadDisqualified') {
    value = 0; // confirmed dead — correct the estimate down to its known final value
    await pd('PUT', '/v1/persons/' + pid, { [P.lead_value_score]: value });
  } else if (needsPersonValue) {
    const scored = person[P.lead_value_score];
    value = scored != null ? Number(scored) : (eventName === 'TermsAgreed' ? AGREED_VALUE : QL_VALUE);
  }

  const result = await sendCapiEvent(eventName, value, person);

  if (result.ok) {
    const sentList = alreadySent ? alreadySent + ',' + eventName : eventName;
    await pd('PUT', '/v1/deals/' + current.id, {
      [D.meta_event_sent]: sentList,
      [D.meta_event_sent_at]: new Date().toISOString(),
    });
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, event: eventName, value, meta: result.meta }));
  }

  res.statusCode = 502;
  return res.end(JSON.stringify({ ok: false, event: eventName, meta_status: result.status, meta: result.meta }));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.statusCode = 405; return res.end('Method Not Allowed'); }
  if (!checkAuth(req)) { res.statusCode = 401; return res.end('Unauthorized'); }

  const b = await readBody(req);
  const current = b.current || b.data || {};
  const previous = b.previous || {};
  const object = (b.meta && b.meta.object) || (typeof b.event === 'string' ? b.event.split('.')[1] : null);

  console.log('[pd-meta-webhook] received. object=%s event=%s test_code_set=%s meta=%o',
    object, b.event, !!TEST_CODE, b.meta);

  try {
    if (object === 'person') return await handlePersonEvent(current, previous, res);
    if (object === 'deal') return await handleDealEvent(current, previous, res);
    // Fallback for older payload shapes with no explicit object type: deals
    // carry stage_id, persons don't.
    if ('stage_id' in current) return await handleDealEvent(current, previous, res);
    if ('email' in current || P.initial_quality_score in current) return await handlePersonEvent(current, previous, res);
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, skipped: 'unrecognized object type' }));
  } catch (e) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: String(e) }));
  }
};
