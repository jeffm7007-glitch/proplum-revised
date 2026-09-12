/**
 * GET /api/job-status/:id
 * Poll processing status for a job
 */

export async function onRequestGet(context) {
  const { env, params } = context;
  const jobId = params.id;

  try {
    const job = await env.PROPLUM_D1.prepare(`
      SELECT
        c.job_id, c.contractor_id, c.market_id, c.service_id,
        c.completed_at, c.final_cost_usd, c.raw_technician_notes,
        c.published_case_study, c.editorial_status,
        c.created_at, c.updated_at,
        m.city, m.state_code, m.suburb_neighborhood, m.canonical_url_path
      FROM completed_jobs c
      LEFT JOIN geo_markets m ON c.market_id = m.market_id
      WHERE c.job_id = ?
    `).bind(jobId).first();

    if (!job) {
      return jsonResponse({ error: 'Job not found' }, 404);
    }

    // Get media
    const mediaResult = await env.PROPLUM_D1.prepare(`
      SELECT media_role, r2_storage_key, optimized_webp_url, optimized_avif_url, caption, width, height
      FROM job_media WHERE job_id = ?
    `).bind(jobId).all();

    // Get audit signals
    const audit = await env.PROPLUM_D1.prepare(`
      SELECT verified_by_supervisor, permit_number, code_compliance_notes, exif_stripped, pii_masked
      FROM job_audit_signals WHERE job_id = ?
    `).bind(jobId).first();

    return jsonResponse({
      job_id: job.job_id,
      status: job.editorial_status,
      contractor_id: job.contractor_id,
      market: {
        city: job.city,
        state: job.state_code,
        neighborhood: job.suburb_neighborhood,
        canonical_path: job.canonical_url_path
      },
      service: job.service_id,
      cost_usd: job.final_cost_usd,
      completed_at: job.completed_at,
      created_at: job.created_at,
      updated_at: job.updated_at,
      media: mediaResult.results || [],
      audit: audit || {},
      case_study: job.published_case_study ? JSON.parse(job.published_case_study) : null,
      published_url: job.editorial_status === 'published'
        ? `https://proplumnetwork.com${job.canonical_url_path}/projects/${job.job_id}`
        : null
    });

  } catch (err) {
    console.error('Job status error:', err);
    return jsonResponse({ error: 'Internal server error', message: err.message }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
