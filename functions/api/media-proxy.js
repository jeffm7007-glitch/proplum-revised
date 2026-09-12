/**
 * GET /api/media-proxy?key=raw/job_xxx/before.jpg
 * Proxies R2 objects for public access
 */

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get('key');

  if (!key) {
    return new Response('Missing key parameter', { status: 400 });
  }

  try {
    const object = await env.PROPLUM_R2.get(key);

    if (!object) {
      return new Response('Not found', { status: 404 });
    }

    const headers = new Headers();
    headers.set('etag', object.httpEtag);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=86400');
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');

    // Read full object into memory to avoid streaming issues
    const data = await object.arrayBuffer();
    return new Response(data, { headers });

  } catch (err) {
    console.error('Media proxy error:', err);
    return new Response('Internal server error', { status: 500 });
  }
}
