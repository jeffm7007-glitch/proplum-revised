/**
 * POST /api/jobs
 * Full job submission with payload validation
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

    // Validate full payload
    const validation = validateJobPayload(body);
    if (!validation.valid) {
      return jsonResponse({ error: 'Invalid payload', details: validation.errors }, 400);
    }

    // Check if job exists
    const existing = await env.PROPLUM_D1.prepare(
      'SELECT job_id, editorial_status FROM completed_jobs WHERE job_id = ?'
    ).bind(body.job_id).first();

    if (!existing) {
      return jsonResponse({ error: 'Job not found. Call /api/upload-ticket first.' }, 404);
    }

    // Update job with full payload
    await env.PROPLUM_D1.prepare(`
      UPDATE completed_jobs SET
        final_cost_usd = ?,
        raw_technician_notes = ?,
        updated_at = datetime('now')
      WHERE job_id = ?
    `).bind(body.final_cost_homeowner, body.work_performed_shorthand, body.job_id).run();

    // Insert media records
    if (body.images) {
      const beforeId = generateId();
      await env.PROPLUM_D1.prepare(`
        INSERT INTO job_media (media_id, job_id, media_role, r2_storage_key, optimized_webp_url, optimized_avif_url, width, height)
        VALUES (?, ?, 'before', ?, '', '', 0, 0)
      `).bind(beforeId, body.job_id, body.images.before_key).run();

      const afterId = generateId();
      await env.PROPLUM_D1.prepare(`
        INSERT INTO job_media (media_id, job_id, media_role, r2_storage_key, optimized_webp_url, optimized_avif_url, width, height)
        VALUES (?, ?, 'after', ?, '', '', 0, 0)
      `).bind(afterId, body.job_id, body.images.after_key).run();
    }

    // Insert audit signals
    await env.PROPLUM_D1.prepare(`
      INSERT INTO job_audit_signals (audit_id, job_id, verified_by_supervisor, homeowner_anonymized_hash, gps_coarse_zone)
      VALUES (?, ?, 0, ?, ?)
    `).bind(
      generateId(),
      body.job_id,
      hashString(body.address_components?.street_address_redacted || ''),
      `${body.address_components?.city}-${body.address_components?.state}`
    ).run();

    return jsonResponse({
      job_id: body.job_id,
      status: 'submitted',
      next_steps: [
        'Media processing (EXIF strip + PII mask + transcoding)',
        'LLM case study enrichment',
        'SME approval gate',
        'Publication to edge'
      ],
      poll_url: `/api/job-status/${body.job_id}`
    });

  } catch (err) {
    console.error('Job submission error:', err);
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

function generateId() {
  return 'job_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function validateJobPayload(body) {
  const errors = [];
  if (!body.job_id) errors.push('job_id is required');
  if (!body.contractor_id) errors.push('contractor_id is required');
  if (!body.trade_service_code) errors.push('trade_service_code is required');
  if (!TRADE_SERVICES.includes(body.trade_service_code)) {
    errors.push(`Invalid trade_service_code. Valid: ${TRADE_SERVICES.join(', ')}`);
  }
  if (!body.address_components?.city) errors.push('address_components.city is required');
  if (!body.address_components?.state) errors.push('address_components.state is required');
  if (!STATES.includes(body.address_components?.state?.toUpperCase())) errors.push('Invalid state code');
  if (typeof body.final_cost_homeowner !== 'number' || body.final_cost_homeowner <= 0) {
    errors.push('final_cost_homeowner must be a positive number');
  }
  if (!body.work_performed_shorthand || body.work_performed_shorthand.length < 20) {
    errors.push('work_performed_shorthand must be at least 20 characters');
  }
  return { valid: errors.length === 0, errors };
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}
