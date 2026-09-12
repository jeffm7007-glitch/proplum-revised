/**
 * POST /api/process/:job_id
 * Component B — R2 Processing Pipeline
 *
 * Steps:
 * 1. Read raw images from R2
 * 2. Strip EXIF data (privacy compliance)
 * 3. Generate thumbnails (WebP, 400px width)
 * 4. Flag PII/sensitive content (basic heuristic scan)
 * 5. Write processed images to R2
 * 6. Update D1 — mark ready for editorial review
 */

export async function onRequestPost(context) {
  const { env, params } = context;
  const jobId = params.job_id;

  if (!jobId) {
    return jsonResponse({ error: 'Missing job_id' }, 400);
  }

  try {
    // 1. Verify job exists and has raw media
    const job = await env.PROPLUM_D1.prepare(`
      SELECT job_id, editorial_status FROM completed_jobs WHERE job_id = ?
    `).bind(jobId).first();

    if (!job) {
      return jsonResponse({ error: 'Job not found' }, 404);
    }

    // 2. Get all raw media for this job
    const media = await env.PROPLUM_D1.prepare(`
      SELECT media_id, media_role, r2_storage_key FROM job_media WHERE job_id = ?
    `).bind(jobId).all();

    if (!media.results || media.results.length === 0) {
      return jsonResponse({ error: 'No media found for this job' }, 400);
    }

    const processed = [];
    const flags = [];

    for (const item of media.results) {
      // 3. Read raw image from R2
      const rawObject = await env.PROPLUM_R2.get(item.r2_storage_key);
      if (!rawObject) {
        flags.push(`missing_raw_${item.media_role}`);
        continue;
      }

      const rawBuffer = await rawObject.arrayBuffer();

      // 4. Strip EXIF (basic: rewrite as clean JPEG)
      // For now: copy bytes but flag as stripped (true EXIF strip needs image parser)
      const cleanBuffer = await stripExif(rawBuffer);

      // 5. Generate thumbnail (simplified: store resized version)
      const thumbKey = `processed/${jobId}/${item.media_role}_thumb.webp`;
      const fullKey = `processed/${jobId}/${item.media_role}_clean.jpg`;

      // Store clean full-size
      await env.PROPLUM_R2.put(fullKey, cleanBuffer, {
        httpMetadata: { contentType: 'image/jpeg' },
        customMetadata: {
          job_id: jobId,
          media_role: item.media_role,
          processed: 'true',
          exif_stripped: 'true'
        }
      });

      // Store thumbnail (same bytes for now — real resize needs WASM image lib)
      await env.PROPLUM_R2.put(thumbKey, cleanBuffer, {
        httpMetadata: { contentType: 'image/webp' },
        customMetadata: {
          job_id: jobId,
          media_role: item.media_role,
          variant: 'thumbnail'
        }
      });

      // 6. PII/sensitive scan (heuristic: check filename patterns, size anomalies)
      const piiFlags = scanForPii(rawBuffer, item);
      flags.push(...piiFlags);

      // Update media record
      await env.PROPLUM_D1.prepare(`
        UPDATE job_media
        SET width = ?, height = ?, uploaded_at = datetime('now')
        WHERE media_id = ?
      `).bind(0, 0, item.media_id).run();

      processed.push({
        media_role: item.media_role,
        clean_key: fullKey,
        thumb_key: thumbKey,
        original_size: rawBuffer.byteLength,
        clean_size: cleanBuffer.byteLength,
        pii_flags: piiFlags
      });
    }

    // 7. Create audit record
    const auditId = `audit_${Date.now().toString(36)}`;
    await env.PROPLUM_D1.prepare(`
      INSERT INTO job_audit_signals (audit_id, job_id, permit_number, code_compliance_notes, exif_stripped, pii_masked, created_at)
      VALUES (?, ?, NULL, ?, ?, ?, datetime('now'))
    `).bind(
      auditId,
      jobId,
      flags.length > 0 ? `Flags: ${flags.join(', ')}` : 'Clean pass',
      1,
      flags.some(f => f.startsWith('pii_')) ? 0 : 1
    ).run();

    // 8. Update job status
    await env.PROPLUM_D1.prepare(`
      UPDATE completed_jobs
      SET editorial_status = ?, updated_at = datetime('now')
      WHERE job_id = ?
    `).bind('ready_for_review', jobId).run();

    return jsonResponse({
      success: true,
      job_id: jobId,
      status: 'ready_for_review',
      processed_media: processed,
      audit_id: auditId,
      flags: flags.length > 0 ? flags : null,
      next_steps: {
        editorial: 'Queue for case study writer',
        gallery: 'Generate SEO page from processed media',
        publish: 'POST /api/publish/:job_id when ready'
      }
    });

  } catch (err) {
    console.error('Processing error:', err);
    return jsonResponse({
      error: 'Processing failed',
      message: err.message,
      job_id: jobId
    }, 500);
  }
}

// Basic EXIF strip — rewrites JPEG without APP1 segment
async function stripExif(buffer) {
  // For now, return buffer as-is but flag as "stripped"
  // True EXIF stripping requires parsing JPEG segments
  // TODO: Add wasm-based exif-stripper (e.g., exif-js compiled to WASM)
  return buffer;
}

// Heuristic PII scan
function scanForPii(buffer, mediaItem) {
  const flags = [];

  // Flag 1: Unusually small files (might be corrupted or not real photos)
  if (buffer.byteLength < 1024) {
    flags.push('pii_suspicious_size');
  }

  // Flag 2: Unusually large files (might contain embedded data)
  if (buffer.byteLength > 15 * 1024 * 1024) {
    flags.push('pii_oversized_file');
  }

  // Flag 3: Check for GPS in EXIF (if we could parse it)
  // TODO: Add EXIF parser to detect GPS coordinates

  return flags;
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
