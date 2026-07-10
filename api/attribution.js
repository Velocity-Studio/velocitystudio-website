// attribution.js — called from the browser on calendly.event_scheduled.
// Receives the Calendly invitee URI + browser cookies (fbp, fbc) + UTMs,
// looks up the invitee's email via the Calendly API, then upserts the
// Pipedrive Person so CAPI has full match signal when deals advance stages.
//
// Required env vars: PIPEDRIVE_TOKEN, CALENDLY_PAT

'use strict';

const https = require('https');

const PD_TOKEN     = process.env.PIPEDRIVE_TOKEN;
const CALENDLY_PAT = process.env.CALENDLY_PAT;

const F = {
  fbp:          '7841c7e4a2dfe015f9a5c35aa445c5784b6ef3b1',
  fbc:          '347b74dcafbf6b1ec7a359039dd240839665e701',
  external_id:  '8d6edd1c496274be496787770edf5dba6709d62a',
  utm_source:   'a8dc7ad5648960c4fa8c3349867cd001ed113be1',
  utm_medium:   '98ed85e6f2e8528df76b2bf9aa444ef032e71bf9',
  utm_campaign: '502aef7a43210b4cd80ab6401d9a40961ac77b4e',
  utm_content:  '902f42c528ba6e12fe58cafb978bd0fede40ed90',
};

function get(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname + u.search, headers: { Authorization: 'Bearer ' + token } }, (r) => {
      let d = ''; r.on('data', c => (d += c)); r.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function pd(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const sep  = path.includes('?') ? '&' : '?';
    const req  = https.request('https://api.pipedrive.com' + path + sep + 'api_token=' + PD_TOKEN,
      { method, headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } },
      (r) => { let d = ''; r.on('data', c => (d += c)); r.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } }); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise(resolve => {
    let d = ''; req.on('data', c => (d += c)); req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST')    { res.statusCode = 405; return res.end('Method Not Allowed'); }

  const b = await readBody(req);
  const { invitee_uri, fbp, fbc, utm_source, utm_medium, utm_campaign, utm_content } = b;

  if (!invitee_uri) { res.statusCode = 400; return res.end(JSON.stringify({ ok: false, error: 'invitee_uri required' })); }

  const diag = { invitee_uri, hasFbp: !!fbp, hasFbc: !!fbc };

  try {
    // 1. Resolve email from Calendly API
    if (!CALENDLY_PAT) throw new Error('CALENDLY_PAT not set');
    const invitee = await get(invitee_uri, CALENDLY_PAT);
    const email   = invitee?.resource?.email;
    if (!email) throw new Error('no email in Calendly invitee response');
    diag.email = email;

    // 2. Find or create Pipedrive Person
    const search  = await pd('GET', '/v1/persons/search?term=' + encodeURIComponent(email) + '&fields=email&exact_match=true');
    const items   = search?.data?.items || [];
    let personId  = items.length ? items[0].item.id : null;
    diag.personFound = !!personId;

    const patch = {};
    if (fbp)          patch[F.fbp]          = fbp;
    if (fbc)          patch[F.fbc]          = fbc;
    if (utm_source)   patch[F.utm_source]   = utm_source;
    if (utm_medium)   patch[F.utm_medium]   = utm_medium;
    if (utm_campaign) patch[F.utm_campaign] = utm_campaign;
    if (utm_content)  patch[F.utm_content]  = utm_content;

    if (personId) {
      await pd('PUT', '/v1/persons/' + personId, patch);
      diag.action = 'updated';
    } else {
      // Person doesn't exist yet — secretary webhook may be in flight. Create it now;
      // secretary will find it by email and skip creation on its side.
      const created = await pd('POST', '/v1/persons', {
        name:  invitee?.resource?.name || email,
        email: [{ value: email, primary: true }],
        ...patch,
      });
      personId = created?.data?.id;
      if (personId) await pd('PUT', '/v1/persons/' + personId, { [F.external_id]: String(personId) });
      diag.action = 'created';
    }

    diag.personId = personId;
    console.log('attribution', JSON.stringify(diag));
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, ...diag }));
  } catch (e) {
    console.error('attribution error', String(e), JSON.stringify(diag));
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: String(e), diag }));
  }
};
