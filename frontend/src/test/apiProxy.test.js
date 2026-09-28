import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createServer } from 'node:http';

/**
 * Tests for the Netlify API proxy edge function.
 *
 * This is the component that had already failed silently twice - once because
 * the file sat outside Netlify's base directory, and once because an unset
 * environment variable silently fell back to localhost. Neither fault threw, and
 * the site kept working; the API was simply absent. A failure mode with no
 * error is only catchable by asserting on behaviour, which is what this file is
 * for.
 *
 * The function reads its target at module load, so each scenario re-imports it
 * with a fresh module registry.
 */

const PORT = 4177;
const REACHABLE = `http://127.0.0.1:${PORT}`;

let server;
let origin = '';

/** Starts a stand-in for the Spring API that echoes back what it received. */
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/api/session') {
      // Multiple cookies, because collapsing them into one comma-joined header
      // is the classic proxy bug - the browser then sees a single broken cookie.
      res.setHeader('set-cookie', ['LMS_SESSION=abc; Path=/; HttpOnly; Secure', 'XSRF-TOKEN=tok; Path=/']);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.url.startsWith('/api/denied')) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 404, message: 'Loan not found.' }));
      return;
    }
    origin = req.headers.origin ?? '(none)';
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ method: req.method, url: req.url, origin, host: req.headers.host }));
  });

  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

/**
 * Loads the edge function with Deno shimmed and the given upstream configured.
 *
 * A fresh registry per call is required: the target is captured in a
 * module-level constant, so a cached module would keep the previous test's
 * value and quietly make one scenario assert another.
 */
async function loadProxy(env) {
  vi.resetModules();
  vi.stubGlobal('Deno', { env: { get: (key) => env[key] } });
  const mod = await import('../../netlify/edge-functions/api-proxy.ts');
  return mod.default;
}

const call = (handler, { method = 'GET', path = '/api/branches', headers = {}, body } = {}) =>
  handler(new Request(`https://lmssem3.netlify.app${path}`, { method, headers, body }));

beforeEach(() => {
  vi.unstubAllGlobals();
  origin = '';
});

describe('api proxy edge function', () => {
  describe('when the backend address is not configured', () => {
    it('reports the missing variable instead of blaming the backend', async () => {
      const handler = await loadProxy({});
      const response = await call(handler);

      // 503, not 502: nothing is unreachable, nothing has been tried.
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.message).toContain('LMS_API_ORIGIN');
      expect(body.message).toContain('NETLIFY_TARGET=demo');
    });

    it('never falls back to localhost', async () => {
      const handler = await loadProxy({});
      const body = await (await call(handler)).json();

      // The bug this guards: a silent default sent every request to
      // http://localhost:8080, which from Netlify's edge is Netlify's own
      // machine. Connection refused, and an error blaming a sleeping service.
      expect(JSON.stringify(body)).not.toContain('localhost');
    });

    it('treats a blank value as unset rather than as a host', async () => {
      const handler = await loadProxy({ LMS_API_ORIGIN: '   ' });
      expect((await call(handler)).status).toBe(503);
    });
  });

  describe('when the backend cannot be reached', () => {
    it('names the host it tried', async () => {
      const handler = await loadProxy({ LMS_API_ORIGIN: 'https://not-a-real-host.invalid' });
      const response = await call(handler);

      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body.message).toContain('not-a-real-host.invalid');
    });
  });

  describe('when the backend is reachable', () => {
    it('forwards the request and returns the response', async () => {
      const handler = await loadProxy({ LMS_API_ORIGIN: REACHABLE });
      const response = await call(handler, { path: '/api/branches' });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.url).toBe('/api/branches');
    });

    it('preserves the upstream status code', async () => {
      const handler = await loadProxy({ LMS_API_ORIGIN: REACHABLE });
      const response = await call(handler, { path: '/api/denied' });

      // The whole reason this is an edge function: a Netlify redirect with
      // status 200 would answer 200 here, and the app would read a
      // not-found as a success.
      expect(response.status).toBe(404);
      expect((await response.json()).message).toBe('Loan not found.');
    });

    it('preserves the method and body', async () => {
      const handler = await loadProxy({ LMS_API_ORIGIN: REACHABLE });
      const response = await call(handler, {
        method: 'POST',
        path: '/api/auth/login',
        body: '{"username":"admin"}',
      });

      const body = await response.json();
      expect(body.method).toBe('POST');
      expect(body.url).toBe('/api/auth/login');
    });

    it('relays every Set-Cookie header separately', async () => {
      const handler = await loadProxy({ LMS_API_ORIGIN: REACHABLE });
      const response = await call(handler, { path: '/api/session' });

      const cookies = response.headers.getSetCookie();
      expect(cookies).toHaveLength(2);
      expect(cookies[0]).toContain('LMS_SESSION=abc');
      expect(cookies[1]).toContain('XSRF-TOKEN=tok');
    });

    it('never caches a session-scoped response', async () => {
      const handler = await loadProxy({ LMS_API_ORIGIN: REACHABLE });
      const response = await call(handler);

      // A caching proxy in front of a per-session API serves one customer
      // another customer's data. Set unconditionally, not inherited.
      expect(response.headers.get('cache-control')).toContain('no-store');
    });

    it('sets forwarded headers the backend needs behind a proxy', async () => {
      const handler = await loadProxy({ LMS_API_ORIGIN: REACHABLE });
      await call(handler);

      // Spring is told to believe it is on https and behind Netlify, otherwise
      // it builds redirects and cookie decisions against the wrong scheme.
      expect(origin).toBeTruthy();
    });

    it('tolerates a trailing slash on the configured address', async () => {
      const handler = await loadProxy({ LMS_API_ORIGIN: `${REACHABLE}/` });
      const body = await (await call(handler)).json();

      // Otherwise the path becomes //api/branches and most upstreams 404.
      expect(body.url).toBe('/api/branches');
    });
  });
});
