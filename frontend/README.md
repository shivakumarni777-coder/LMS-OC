# Loan Management System — Web Frontend

React single-page app for the LMS backend. Talks to `/api` over a server-side
session, so there is no token in JavaScript and nothing to persist locally.

## Requirements

- Node 20.19+ (developed on 24)
- The Spring Boot backend running on port 8080

## Getting started

```bash
npm install
cp .env.example .env      # optional; the default already points at localhost:8080
npm run dev
```

The dev server runs on <http://localhost:5173> and proxies `/api` to the backend
(see `server.proxy` in `vite.config.js`). Same-origin in dev is what makes the
session cookie work without any CORS relaxation.

### Signing in

The bootstrap administrator is created on first backend start. The password comes
from `BOOTSTRAP_ADMIN_PASSWORD` — see the root `README.md`. Customers register
themselves at `/register`, which creates the customer record **and** the login in
one request; the username is the email address used at registration.

## Scripts

| Command             | Does                                                     |
| ------------------- | -------------------------------------------------------- |
| `npm run dev`       | Dev server with HMR                                       |
| `npm run build`     | Production build into `dist/`                             |
| `npm run preview`   | Serve the production build locally                        |
| `npm run lint`      | Oxlint                                                    |
| `npm test`          | Vitest, single run                                        |
| `npm run test:watch`| Vitest in watch mode                                      |

## Layout

```
src/
  api/         one module per backend resource; the only place URLs appear
  auth/        session identity (AuthProvider) and the route guards
  components/
    layout/    AppShell, PageHeader, ErrorBoundary
    ui/        Button, Field, Card, DataTable, Alert, Badge, EmptyState, Spinner
  features/    one folder per screen, lazily loaded
  hooks/       TanStack Query hooks
  lib/         httpClient, validation, formatting, EMI preview
  test/        Vitest setup
```

Data flows one way: `feature -> hook -> api module -> httpClient -> backend`.
Pages never call axios directly, and only `api/` knows a URL exists.

## Decisions worth knowing

**No client-side session storage.** The session is an httpOnly cookie the browser
manages. `AuthProvider` asks `GET /api/auth/me` on mount, which is why a hard
refresh keeps you signed in and why signing out is a single server call. A 401 on
any other endpoint means the session lapsed; `httpClient` notifies
`AuthProvider`, which clears the query cache and returns to signed out. Without
that, a stale page would keep rendering another user's data.

**CSRF is handled once.** `httpClient` reads the `XSRF-TOKEN` cookie and copies
it into `X-XSRF-TOKEN` on every non-safe method. It reads the cookie per request
rather than caching it, because Spring Security rotates the token.

**Every route is a dynamic import.** `App.jsx` holds the route table; each page is
`lazy(() => import(...))`. A customer signing in never downloads the admin
approval queue, and the first paint carries only React, the router and axios.

**Currency is `en-IN`.** 5,000,000 renders as `₹50,00,000` and compacts to `₹50L`,
because that is how an Indian bank states the figure.

**The EMI preview mirrors `EmiCalculator`.** `lib/emi.js` reproduces the backend
formula, including the 0% special case, so the figure shown before approval
matches the one charged. `lib/emi.test.js` asserts the same values as the
backend's `EmiCalculatorTest` — if the two ever drift apart, those tests fail.

**Account numbers stay strings.** A 12-digit account number loses precision as a
JavaScript number, so it is only converted at the API boundary and the query key
is the exact string.

**Validation is duplicated on purpose.** `lib/validation.js` mirrors the server's
bean validation for immediate feedback, but the server response is always the
authority: on failure, `error.fieldErrors` is written back onto the form.

## Accessibility

- One `ErrorBoundary` at the root, so a broken page cannot blank the portal.
- `Field` wires label, hint and error to the input with matching ids, and hands
  `describedBy` to the control through a render prop — `aria-describedby` on a
  wrapper element does nothing, which the tests assert against.
- Required state is `aria-required` on the control, not hidden text in the label.
  The accessible-name algorithm trims a leading space per node, so a visually
  hidden " (required)" would be announced as "Emailrequired".
- Focus-visible rings, a skip link, and `prefers-reduced-motion` are handled in
  `index.css`.
- Every failure path has a visible message, not just a console log.

## Tests

70 tests across 5 files:

- `lib/emi.test.js` — the formula, including the 0% case and invalid input
- `lib/validation.test.js` — every field rule, mirroring the backend constraints
- `lib/format.test.js` — Indian digit grouping, dates, account numbers
- `components/ui/Field.test.jsx` — label/hint/error association, `aria-required`
- `features/loans/LoansPage.test.jsx` — the approval flow against a mocked API:
  listing, empty state, the pending-only filter, live EMI preview, server-side
  field errors, and that a customer sees no approve control
