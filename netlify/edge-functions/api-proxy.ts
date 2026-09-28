/**
 * Netlify Edge Function: reverse proxy for the LMS-OC API.
 *
 * WHY THIS EXISTS INSTEAD OF A REDIRECT RULE
 * -----------------------------------------
 * The obvious way to point a Netlify site at an API on another host is
 *
 *     [[redirects]]
 *     from = "/api/*"
 *     to   = "https://backend.onrender.com/api/:splat"
 *     status = 200
 *
 * That does not work for this application. A `status = 200` proxy rule makes
 * Netlify answer 200 regardless of what the API returned, and this app decides
 * almost everything from the status code: 401 drives sign-out, 403 and 404
 * decide between "not allowed" and "does not exist", and 409 signals a
 * duplicate. Flattening them all to 200 would make every failure look like a
 * success.
 *
 * An edge function is used instead because it forwards the upstream status,
 * body and headers verbatim, so the real API contract survives.
 *
 * THE POINT OF THE PROXY
 * ----------------------
 * The browser only ever speaks to the Netlify origin. It never calls the API
 * host directly, so the two are same-site and the `SameSite=Strict` session
 * cookie is still sent. Calling the API cross-origin from the browser would
 * require weakening the cookie to `SameSite=None; Secure`, and no CORS
 * configuration at all. The session cookie carries no `Domain` attribute, so
 * the browser attributes it to the Netlify origin and it is sent with every
 * request below.
 */

/** Deployment target, e.g. `https://lms-oc-api.onrender.com`. */
const UPSTREAM = Deno.env.get('LMS_API_ORIGIN') ?? 'http://localhost:8080';

/**
 * Headers that describe a single hop and must not be relayed.
 *
 * `content-encoding` and `content-length` are the important ones: `fetch`
 * transparently decompresses the upstream body, so relaying the original
 * encoding header would have the client try to inflate plain bytes.
 */
const HOP_BY_HOP = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-encoding',
  'content-length',
];

const BODYLESS = new Set(['GET', 'HEAD']);

export default async (request: Request): Promise<Response> => {
  const incoming = new URL(request.url);
  const target = `${UPSTREAM.replace(/\/$/, '')}${incoming.pathname}${incoming.search}`;

  const headers = new Headers(request.headers);
  // The upstream must see its own host, not the Netlify one, or it generates
  // redirects and links aimed at the wrong place.
  headers.delete('host');
  headers.set('x-forwarded-host', incoming.host);
  headers.set('x-forwarded-proto', 'https');
  headers.set('x-forwarded-for', incoming.host);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: BODYLESS.has(request.method) ? undefined : await request.text(),
      // The API never redirects. Following one would let a misconfigured host
      // send the browser somewhere else while still appearing to succeed.
      redirect: 'manual',
    });
  } catch (cause) {
    // Distinguish "the API is down" from "the API answered". Collapsing these
    // makes a dead backend look like an application error, which sends people
    // looking in the wrong place.
    return json(502, {
      error: 'Bad Gateway',
      message: 'The LMS API is unreachable. It may be starting up or asleep.',
      detail: cause instanceof Error ? cause.message : String(cause),
    }, request);
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.includes(key.toLowerCase())) out.set(key, value);
  });

  // Headers.append() collapses repeated Set-Cookie headers into one
  // comma-joined string, which browsers then parse as a single malformed
  // cookie. The standard getSetCookie() is the only correct way to relay them.
  out.delete('set-cookie');
  for (const cookie of upstream.headers.getSetCookie?.() ?? []) {
    out.append('set-cookie', cookie);
  }

  // A proxy that caches turns a session-scoped API into a shared one, where one
  // customer can be served another's data. This is set unconditionally rather
  // than relying on the upstream, because the response is assembled here.
  out.set('cache-control', 'no-store, no-cache, must-revalidate, private');
  out.set('x-lms-proxy', 'netlify-edge');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
};

/** A well-formed error in the same envelope the Spring API uses. */
function json(status: number, body: Record<string, unknown>, request: Request): Response {
  return new Response(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      status,
      error: status === 502 ? 'Bad Gateway' : 'Error',
      message: body.message,
      path: new URL(request.url).pathname,
      detail: body.detail,
    }),
    {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    },
  );
}

export const config = { path: ['/api/*'] };
