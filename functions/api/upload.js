/**
 * POST /api/upload
 * Accepts multipart form-data with photo upload, writes to R2
 *
 * Form fields:
 *   - file: the image file (jpeg/png/webp)
 *   - job_id: the job ID from upload-ticket
 *   - media_role: "before" or "after"
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const jobId = formData.get('job_id');
    const mediaRole = formData.get('media_role');

    // Validation
    if (!file || !jobId || !mediaRole) {
      return jsonResponse({
        error: 'Missing required fields',
        required: ['file', 'job_id', 'media_role']
      }, 400);
    }

    if (!['before', 'after'].includes(mediaRole)) {
      return jsonResponse({
        error: 'Invalid media_role',
        valid: ['before', 'after']
      }, 400);
    }

    // Verify job exists
    const job = await env.PROPLUM_D1.prepare(
      'SELECT job_id FROM completed_jobs WHERE job_id = ?'
    ).bind(jobId).first();

    if (!job) {
      return jsonResponse({ error: 'Job not found' }, 404);
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      return jsonResponse({
        error: 'Invalid file type',
        valid: validTypes
      }, 400);
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return jsonResponse({
        error: 'File too large',
        max_size_mb: 10,
        your_size_mb: (file.size / 1024 / 1024).toFixed(2)
      }, 400);
    }

    // Generate R2 key
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const r2Key = `raw/${jobId}/${mediaRole}.${ext}`;

    // Upload to R2
    const arrayBuffer = await file.arrayBuffer();
    await env.PROPLUM_R2.put(r2Key, arrayBuffer, {
      httpMetadata: {
        contentType: file.type,
        contentDisposition: `inline; filename="${mediaRole}.${ext}"`
      },
      customMetadata: {
        job_id: jobId,
        media_role: mediaRole,
        uploaded_by: 'field-tech-pwa',
        original_size: String(file.size)
      }
    });

    // Generate public URL via Worker proxy (R2 bucket is private)
    const publicUrl = `https://proplum-network.pages.dev/api/media/${r2Key}`;

    // Insert media record into D1
    const mediaId = `med_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`;
    await env.PROPLUM_D1.prepare(`
      INSERT INTO job_media (media_id, job_id, media_role, r2_storage_key, width, height, uploaded_at)
      VALUES (?, ?, ?, ?, NULL, NULL, datetime('now'))
    `).bind(mediaId, jobId, mediaRole, r2Key).run();

    return jsonResponse({
      success: true,
      job_id: jobId,
      media_role: mediaRole,
      media_id: mediaId,
      r2_key: r2Key,
      public_url: publicUrl,
      size_bytes: file.size,
      content_type: file.type
    });

  } catch (err) {
    console.error('Upload error:', err);
    return jsonResponse({
      error: 'Internal server error',
      message: err.message
    }, 500);
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
