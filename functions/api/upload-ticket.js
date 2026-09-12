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

    // Generate pre-signed R2 URLs
    const beforeKey = `raw/${jobId}/before.jpg`;
    const afterKey = `raw/${jobId}/after.jpg`;

    const beforeUrl = await generatePresignedUrl(env, beforeKey);
    const afterUrl = await generatePresignedUrl(env, afterKey);

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

async function generatePresignedUrl(env, key) {
  // Using R2 binding for direct access; for client uploads we'd need S3-compatible presigned URLs
  // For now, return the public URL path - the client will upload via a separate endpoint
  return `https://raw.proplumnetwork.com/${key}`;
}
