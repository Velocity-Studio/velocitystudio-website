// Pipedrive deal-change webhook -> Meta Conversions API.
//   deal enters Active SQL (stage 4)  -> QualifiedLead
//   deal status changes to "won"      -> Purchase
//
// Matching data (email, fbp, fbc, external_id, name) is read from the deal's
// linked Person. Per the spec, send ONLY when the lead is Meta-attributable
// (fbp or fbc present). Idempotent via the deal's meta_event_sent field.
//
// Dependency-free: Node built-ins only.

const https = require('https');
const crypto = require('crypto');

const PD_TOKEN    = process.env.PIPEDRIVE_TOKEN;
const META_TOKEN  = process.env.META_CAPI_TOKEN;
const PIXEL_ID    = process.env.META_PIXEL_ID || '778078978037243';
const WH_SECRET   = process.env.PD_WEBHOOK_SECRET;        // shared secret in Pipedrive basic-auth
const TEST_CODE   = process.env.META_TEST_EVENT_CODE || ''; // set during QA, unset for production
const QL_VALUE    = Number(process.env.QUALIFIED_LEAD_VALUE || 500);
const AGREED_VALUE = Number(process.env.AGREED_TERMS_VALUE || 5000);
const QUALIFIED_STAGE_ID = 4;   // "Qualified"     -> QualifiedLead
const TERMS_STAGE_ID     = 10;  // "Terms Agreed"  -> TermsAgreed
const GRAPH_VER   = 'v21.0';

// Person custom-field keys.
const P = {
  fbp:         '7841c7e4a2dfe015f9a5c35aa445c5784b6ef3b1',
  fbc:         '347b74dcafbf6b1ec7a359039dd240839665e701',
  external_id: '8d6edd1c496274be496787770edf5dba6709d62a',
};
// Deal custom-field keys.
const D = {
  meta_event_sent:    '1089106fb5b00013626baad5c3a4dfafc4846bef',
  meta_event_sent_at: '5c056b945a5d5c235b0e6c9be4bc52cad235b1be',
};

const sha = (v) => crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');

function pd(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const sep = path.includes('?') ? '&' : '?';
    const req = https.request(
      'https://api.pipedrive.com' + path + sep + 'api_token=' + PD_TOKEN,
      { method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} },
      (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } }); }
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
      (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => resolve({ status: r.statusCode, body: d })); }
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

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.statusCode = 405; return res.end('Method Not Allowed'); }
  if (!checkAuth(req)) { res.statusCode = 401; return res.end('Unauthorized'); }

  const b = await readBody(req);
  const current = b.current || b.data || {};
  const previous = b.previous || {};

  // Decide which event (if any) this change fires.
  const enteredQualified = current.stage_id === QUALIFIED_STAGE_ID && previous.stage_id !== QUALIFIED_STAGE_ID;
  const enteredTerms     = current.stage_id === TERMS_STAGE_ID && previous.stage_id !== TERMS_STAGE_ID;
  const becameWon        = current.status === 'won' && previous.status !== 'won';
  let eventName = null, value = 0;
  if (becameWon)            { eventName = 'Purchase';      value = Number(current.value || 0); }
  else if (enteredTerms)    { eventName = 'TermsAgreed';   value = AGREED_VALUE; }
  else if (enteredQualified){ eventName = 'QualifiedLead'; value = QL_VALUE; }
  if (!eventName) { res.statusCode = 200; return res.end(JSON.stringify({ ok: true, skipped: 'no trigger' })); }

  // Idempotency: skip if this event already sent for this deal.
  const alreadySent = String(current[D.meta_event_sent] || '');
  if (alreadySent.split(',').includes(eventName)) { res.statusCode = 200; return res.end(JSON.stringify({ ok: true, skipped: 'already sent ' + eventName })); }

  // Resolve the linked Person for matching data.
  const pid = current.person_id && typeof current.person_id === 'object' ? current.person_id.value : current.person_id;
  if (!pid) { res.statusCode = 200; return res.end(JSON.stringify({ ok: true, skipped: 'no person' })); }
  const personResp = await pd('GET', '/v1/persons/' + pid);
  const person = (personResp && personResp.data) || {};

  const fbp = person[P.fbp] || '';
  const fbc = person[P.fbc] || '';
  const extId = person[P.external_id] || String(pid);
  const email = (person.email && person.email[0] && person.email[0].value) || '';
  const phone = (person.phone && person.phone[0] && person.phone[0].value) || '';

  // Spec filtering: only send Meta-attributable leads (fbp or fbc present).
  if (!fbp && !fbc) { res.statusCode = 200; return res.end(JSON.stringify({ ok: true, skipped: 'not meta-attributable' })); }

  // Build user_data.
  const user_data = {};
  if (email) user_data.em = [sha(email)];
  if (phone) user_data.ph = [sha(phone.replace(/[^0-9]/g, ''))];
  if (fbp) user_data.fbp = fbp; // NOT hashed
  if (fbc) user_data.fbc = fbc; // NOT hashed
  user_data.external_id = [sha(extId)];
  if (person.first_name) user_data.fn = [sha(person.first_name)];
  if (person.last_name)  user_data.ln = [sha(person.last_name)];

  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'system_generated',
      event_source_url: 'https://velocitystud.io/start',
      user_data,
      custom_data: { currency: 'USD', value },
    }],
  };
  if (TEST_CODE) payload.test_event_code = TEST_CODE;

  const sent = await metaSend(payload);
  let metaJson = {}; try { metaJson = JSON.parse(sent.body); } catch {}

  if (sent.status === 200 && metaJson.events_received >= 1) {
    const sentList = alreadySent ? alreadySent + ',' + eventName : eventName;
    await pd('PUT', '/v1/deals/' + current.id, {
      [D.meta_event_sent]: sentList,
      [D.meta_event_sent_at]: new Date().toISOString(),
    });
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, event: eventName, value, meta: metaJson }));
  }

  res.statusCode = 502;
  return res.end(JSON.stringify({ ok: false, event: eventName, meta_status: sent.status, meta: metaJson }));
};
