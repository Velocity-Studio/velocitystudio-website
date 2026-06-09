// Form-submit capture: upsert a Pipedrive Person (keyed by email) with the
// Meta click identifiers (_fbp/_fbc) and lead metadata, at the one moment the
// browser cookies exist. The post-call process-lead skill later reuses this
// Person, so fbp/fbc are already attached when the deal reaches Active SQL.
//
// Dependency-free: Node built-ins only.

const https = require('https');

const PD_TOKEN = process.env.PIPEDRIVE_TOKEN;

// Pipedrive Person custom-field keys (created via API).
const F = {
  fbp:             '7841c7e4a2dfe015f9a5c35aa445c5784b6ef3b1',
  fbc:             '347b74dcafbf6b1ec7a359039dd240839665e701',
  external_id:     '8d6edd1c496274be496787770edf5dba6709d62a',
  lead_created_at: 'e99516949bfdfec88ee84d5a4a8c6202a67ef619',
  lead_quality:    'ba9963674d8028438d398d6bc3e87271cdd1b40d',
};

function pd(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const sep = path.includes('?') ? '&' : '?';
    const req = https.request(
      'https://api.pipedrive.com' + path + sep + 'api_token=' + PD_TOKEN,
      {
        method,
        headers: data
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
          : {},
      },
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

  const custom = {
    [F.lead_created_at]: b.lead_created_at || String(Math.floor(Date.now() / 1000)),
    [F.lead_quality]:    b.lead_quality || '',
  };
  if (b.fbp) custom[F.fbp] = b.fbp;
  if (b.fbc) custom[F.fbc] = b.fbc;

  try {
    // Find existing person by exact email.
    const search = await pd('GET', '/v1/persons/search?term=' + encodeURIComponent(email) + '&fields=email&exact_match=true');
    const items = (search.json && search.json.data && search.json.data.items) || [];
    let personId = items.length ? items[0].item.id : null;

    if (personId) {
      await pd('PUT', '/v1/persons/' + personId, custom);
    } else {
      const create = await pd('POST', '/v1/persons', Object.assign({
        name: b.name || email,
        email: [{ value: email, primary: true }],
      }, custom));
      personId = create.json && create.json.data ? create.json.data.id : null;
    }

    // external_id = the Pipedrive Person id (stable, ours). Stamp it.
    if (personId) {
      await pd('PUT', '/v1/persons/' + personId, { [F.external_id]: String(personId) });
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, person_id: personId }));
  } catch (e) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: String(e) }));
  }
};
