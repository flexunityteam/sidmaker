/**
 * Cloudflare Pages Function: a tiny shared visit counter backed by KV.
 *
 *   GET /count        -> increment, return { count }
 *   GET /count?peek   -> return { count } without incrementing
 *
 * Same-origin, so the page fetches it with no CORS and no third-party host.
 */
export async function onRequestGet({ request, env }) {
  const key = 'visits';
  const peek = new URL(request.url).searchParams.has('peek');

  let count = parseInt((await env.COUNTER.get(key)) || '0', 10);
  if (!peek) {
    count += 1;
    await env.COUNTER.put(key, String(count));
  }

  return new Response(JSON.stringify({ count }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
