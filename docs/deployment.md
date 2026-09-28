# Deploying LMS-OC

Frontend on **Netlify** (site `lmssem3`), API on **Render**, database on **Aiven**.

## How the three fit together

```
Browser ──► Netlify  (lmssem3.netlify.app)  ── static React assets
                    │
                    └─► /api/*  ──► Netlify Edge Function ──► Render  (Spring Boot)
                                                          └─► Aiven MySQL
```

The browser **only ever talks to Netlify**. Netlify proxies `/api/*` to Render
server-side. This is the whole trick, and it is deliberate:

Render sits on a different registrable domain (`*.onrender.com`) than Netlify
(`*.netlify.app`). If the browser called Render directly, the two would be
**cross-site**, and the `SameSite=Strict` session cookie would be withheld by
the browser — login would appear to succeed and then *every* subsequent request
would 401. Routing through the proxy keeps the request same-origin, so the
existing cookie policy holds, no `SameSite=None` downgrade is needed, and there
is **no CORS configuration at all**.

The session cookie carries no `Domain` attribute, so the browser attributes it
to `lmssem3.netlify.app` and sends it with every proxied request.

## Why an edge function and not a Netlify redirect

The obvious approach is a redirect rule:

```toml
[[redirects]]
from = "/api/*"
to   = "https://<render-host>/api/:splat"
status = 200
```

**This does not work for this app.** A `status = 200` proxy rule makes Netlify
answer `200` regardless of what the API returned, and this application decides
nearly everything from the status code — `401` drives sign-out, `403`/`404`
distinguish "not allowed" from "does not exist", `409` signals a duplicate.
Flattening them to `200` makes every failure look like a success.

`netlify/edge-functions/api-proxy.ts` forwards the upstream status, body and
headers verbatim, so the real API contract survives the hop. It also sets
`Cache-Control: no-store` on everything: a caching proxy in front of a
session-scoped API serves one customer another customer's data.

## Order of work

Aiven → Render → Netlify. Each step needs the previous one's output.

### 1. Aiven — the database

1. **Create project** → **Create service** → MySQL.
2. Note from the service's **Connection** tab:
   - `Host`
   - `Port`
   - `Username`
   - `Password`
   - `Database name`
   - **SSL certificate** (download the CA cert if offered)
3. Build `DB_URL` from those values:

```
jdbc:mysql://<host>:<port>/<database>?useSSL=true&requireSSL=true&verifyServerCertificate=true&serverTimezone=UTC
```

`useSSL=true` is **required** — Aiven rejects plaintext connections, and the app
will not start without it.

> Aiven's own "Service URI" string is `mysql://user:pass@host:port/db`, which is
> **not** a JDBC URL. It cannot be pasted into `DB_URL` directly.

### 2. Render — the API

1. **New → Blueprint** → select this repository. Render reads `render.yaml`.
2. Fill in the three values marked `TODO` in `render.yaml`:
   `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, plus `BOOTSTRAP_ADMIN_PASSWORD`.
3. Deploy. Build is `./mvnw -B -DskipTests package`, start is
   `java -jar target/lms-oc.jar`.
4. Note the resulting host, e.g. `lms-oc-api.onrender.com`.

Check it before going further:

```
https://<render-host>/api/branches
```

Must return a JSON array of branches. If it 404s, the jar is not the app or the
context failed to start — read the Render logs.

### 3. Netlify — the frontend (site `lmssem3`)

1. **Add new site → Import an existing project** → this repository.
   Netlify reads `netlify.toml`; `base = "frontend"` is what points it at the
   right directory.
2. Set one environment variable under **Site configuration → Environment
   variables**:

   ```
   LMS_API_ORIGIN = https://<render-host>
   ```

3. Deploy. Confirm `NETLIFY_TARGET` is `live` (the committed default) and that
   `NODE_VERSION` resolved to `24`.
4. The site is live at `https://lmssem3.netlify.app`.

### 4. Verify the whole thing

This is the check that matters, because it is the failure mode that does not
announce itself:

1. Open `https://lmssem3.netlify.app`
2. Log in as `admin` with the `BOOTSTRAP_ADMIN_PASSWORD` set in step 2.
3. Open DevTools → **Network** → filter `Fetch/XHR**.

| What you see | What it means |
|---|---|
| Requests to `lmssem3.netlify.app/api/...`, all `200` | Working. |
| Requests to `lmssem3.netlify.app/api/...`, `401` after login | Session cookie not surviving the proxy. Check `LMS_API_ORIGIN` and that the `LMS_SESSION` cookie is present. |
| Login `200`, then later calls `401` | The cookie was set but not sent — `SameSite`/scheme problem. Confirm `SESSION_COOKIE_SECURE=true` and `FORWARD_HEADERS_STRATEGY=framework` on Render. |
| `502` from `/api/*` | Render is asleep or unreachable. Free-tier services sleep after inactivity; the first request after a pause can time out. |
| Refresh on `/loans` gives 404 | The SPA rewrite is missing from `netlify.toml`. |

## Seminar shortcut: no backend at all

For a presentation, the frontend can be deployed with **no Render and no
Aiven** — it answers its own API calls from in-memory fixtures.

In Netlify, set:

```
NETLIFY_TARGET = demo
```

Redeploy. The build switches to `vite build --mode demo`, and the site is fully
functional on its own: log in with **`admin`** and the password
**`DemoCustomer!2026`** (the same password for every demo account and the
admin), then browse 100 customers and their loans, apply for a loan, and
approve one as the admin.

Switch `NETLIFY_TARGET` back to `live` to return to the real API. The
`live` build **fails the build** if any fixture data is found in the bundle, so
demo mode cannot silently reach a real deployment.

`frontend/.env.demo` holds only `VITE_DEMO_MODE=true` and no secrets, which is
why it is committed while `.env` is not.

## Local equivalents

```bash
cd frontend
npm run demo          # standalone, no backend - same as NETLIFY_TARGET=demo
npm run dev           # against a real backend on :8080 via the Vite proxy
```

## Configuration reference

| Variable | Where | Purpose |
|---|---|---|
| `LMS_API_ORIGIN` | Netlify | Render host that `/api/*` proxies to. |
| `NETLIFY_TARGET` | Netlify | `live` or `demo`. Anything else fails the build. |
| `DB_URL` / `DB_USERNAME` / `DB_PASSWORD` | Render | Aiven credentials. |
| `BOOTSTRAP_ADMIN_PASSWORD` | Render | Initial admin password. |
| `SESSION_COOKIE_SECURE` | Render | `true` — app is always behind TLS. |
| `FORWARD_HEADERS_STRATEGY` | Render | `framework` — honours `X-Forwarded-*`. |
| `CORS_ALLOWED_ORIGINS` | Render | **Not set.** Unnecessary: the proxy makes requests same-origin. |
| `SAMPLE_DATA_ENABLED` | Render | `false` — demo rows have known passwords. |

## Known constraints

- **Render free tier sleeps** after ~15 minutes idle. The first request can take
  up to a minute to wake it, and Netlify's edge function will return `502` if
  the upstream is too slow. For a seminar, start the demo from a cold service,
  or deploy the `demo` target and sidestep it entirely.
- **One origin, one session.** There is a single session, in memory, on the
  Render instance. If Render restarts or scales to a second instance, sessions
  do not carry over — a shared session store would be needed.
- **Aiven's free tier sleeps** too, on a similar schedule.
