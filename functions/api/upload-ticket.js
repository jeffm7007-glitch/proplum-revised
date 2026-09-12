/**
 * POST /api/upload-ticket
 * Validate auth, create job stub, return pre-signed R2 URLs
 */

const TRADE_SERVICES = [
  'water-heater-replacement', 'drain-cleaning', 'pipe-burst-repair',
  'sewer-line-replacement', 'toilet-repair', 'ac-repair',
  'furnace-repair', 'emergency-plumbing'
];

const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

// R2 S3-compatible credentials
const R2_ACCOUNT_ID = 'fff5e95cbea3dc79f3003b50f0b8bae1';
const R2_ACCESS_KEY = '08aa02bc19b7556bd51346fffb53354e';
const R2_SECRET_KEY = 'b148716b5c2542be77b36cba61871cd9fcd869370283c13e139b0bb8f83dadfb';
const R2_BUCKET = 'proplum-cache';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json().catch(() => ({}));

    // Validate required fields
    const required = ['contractor_id', 'trade_service_code', 'city', 'state'];
    const missing = required.filter(f => !body[f]);
    if (missing.length > 0) {
      return jsonResponse({ error: 'Missing required fields', missing }, 400);
    }

    if (!TRADE_SERVICES.includes(body.trade_service_code)) {
      return jsonResponse({ error: 'Invalid trade_service_code', valid: TRADE_SERVICES }, 400);
    }

    if (!STATES.includes(body.state.toUpperCase())) {
      return jsonResponse({ error: 'Invalid state code' }, 400);
    }

    const jobId = generateJobId();
    const marketId = await getOrCreateMarket(env.PROPLUM_D1, body);

    // Create job stub
    await env.PROPLUM_D1.prepare(`
      INSERT INTO completed_jobs (
        job_id, contractor_id, market_id, service_id,
        completed_at, final_cost_usd, raw_technician_notes,
        editorial_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      jobId, body.contractor_id, marketId, body.trade_service_code,
      body.job_timestamp || new Date().toISOString(),
      body.final_cost_homeowner || 0,
      body.work_performed_shorthand || '',
      'pending_enrichment'
    ).run();

    // Generate presigned R2 URLs using S3-compatible API
    const beforeKey = `raw/${jobId}/before.jpg`;
    const afterKey = `raw/${jobId}/after.jpg`;

    const beforeUrl = await generatePresignedUrl(beforeKey, 'PUT', 15 * 60);
    const afterUrl = await generatePresignedUrl(afterKey, 'PUT', 15 * 60);

    return jsonResponse({
      job_id: jobId,
      status: 'pending_upload',
      upload_urls: {
        before: { url: beforeUrl, key: beforeKey, method: 'PUT', content_type: 'image/jpeg', max_size_mb: 10 },
        after:  { url: afterUrl,  key: afterKey,  method: 'PUT', content_type: 'image/jpeg', max_size_mb: 10 }
      },
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      instructions: {
        before: 'Upload BEFORE photo (leak, damage, old equipment)',
        after: 'Upload AFTER photo (new install, completed work)'
      }
    });

  } catch (err) {
    console.error('Upload ticket error:', err);
    return jsonResponse({ error: 'Internal server error', message: err.message }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

function generateJobId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `job_${ts}${rand}`;
}

async function getOrCreateMarket(db, body) {
  const city = body.city.toLowerCase().replace(/\s+/g, '-');
  const state = body.state.toLowerCase();
  const neighborhood = body.address_components?.neighborhood
    ? body.address_components.neighborhood.toLowerCase().replace(/\s+/g, '-')
    : null;

  const marketId = neighborhood ? `${state}-${city}-${neighborhood}` : `${state}-${city}`;
  const canonicalPath = neighborhood ? `/${state}/${city}/${neighborhood}` : `/${state}/${city}`;

  const existing = await db.prepare('SELECT market_id FROM geo_markets WHERE market_id = ?').bind(marketId).first();
  if (existing) return marketId;

  await db.prepare(`
    INSERT INTO geo_markets (market_id, city, suburb_neighborhood, state_code, postal_code, latitude, longitude, canonical_url_path)
    VALUES (?, ?, ?, ?, ?, 0.0, 0.0, ?)
  `).bind(marketId, body.city, body.address_components?.neighborhood || null,
    body.state.toUpperCase(), body.address_components?.postal_code || '00000', canonicalPath).run();

  return marketId;
}

async function generatePresignedUrl(key, method, expiresInSeconds) {
  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const date = new Date();
  const dateStamp = date.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate = date.toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z';
  
  const credential = `${R2_ACCESS_KEY}/${dateStamp}/auto/s3/aws4_request`;
  
  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': 'host'
  });
  
  const canonicalRequest = [
    method,
    `/${R2_BUCKET}/${encodeURIComponent(key).replace(/%20/g, '+')}`,
    params.toString(),
    'host:' + host,
    '',
    'host',
    'UNSIGNED-PAYLOAD'
  ].join('\n');
  
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    `${dateStamp}/auto/s3/aws4_request`,
    await sha256(canonicalRequest)
  ].join('\n');
  
  const signingKey = await getSignatureKey(R2_SECRET_KEY, dateStamp, 'auto', 's3');
  const signature = await hmacHex(signingKey, stringToSign);
  
  params.set('X-Amz-Signature', signature);
  
  return `https://${host}/${R2_BUCKET}/${key}?${params.toString()}`;
}

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = await hmac(await encode('AWS4' + key), await encode(dateStamp));
  const kRegion = await hmac(kDate, await encode(regionName));
  const kService = await hmac(kRegion, await encode(serviceName));
  const kSigning = await hmac(kService, await encode('aws4_request'));
  return kSigning;
}

async function hmac(key, data) {
  return crypto.subtle.sign('HMAC', await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  ), data);
}

async function hmacHex(key, data) {
  const signature = await hmac(key, await encode(data));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function encode(str) {
  return new TextEncoder().encode(str);
}
