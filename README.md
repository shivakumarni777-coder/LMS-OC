# Bank / Loan Management System

Spring Boot 4 backend + React frontend for customer registration and loan
origination (apply → approve → EMI calculation).

> **Provenance:** this repository is the AI-assisted rebuild. The untouched
> original is preserved at `shivakumarni777-coder/LMS` and on disk at
> `../project - bank management system-original`. Every commit after
> `initial commit` is a deliberate, reviewable change.

---

## ⚠️ If you are coming from the original repo

The original had a **MySQL root password committed in plaintext to a public
GitHub repository.** That credential must be treated as compromised:

1. Rotate the MySQL `root` password (or better, create a dedicated
   `lms_app` user with only the privileges this app needs).
2. The password no longer appears in this repository's code — it is read from
   the environment (see below).
3. Rotating does **not** rewrite git history. If you want the old value purged
   from the history itself, that needs a history rewrite
   (`git filter-repo`) plus a force-push, and every existing clone must be
   re-cloned. That is a separate, deliberate operation.

---

## Tech stack

| Layer     | Choice                                                     |
| --------- | ---------------------------------------------------------- |
| Backend   | Spring Boot 4.1, Java 21, Spring Data JPA, MySQL 8          |
| Security  | Spring Security, server-side `HttpSession`, BCrypt, CSRF    |
| Frontend  | React 19 + Vite, JavaScript, Tailwind CSS v4, TanStack Query |
| Build     | Maven 3.9, npm 11                                          |

Authentication uses a **server-side session**: the browser only ever holds an
`httpOnly`, `SameSite=Strict` session id. There is no JWT in `localStorage`, so
an XSS bug cannot exfiltrate a bearer token.

---

## Getting started

### 1. Prerequisites

- JDK 21
- Maven 3.9+
- MySQL 8 running locally
- Node 20+

### 2. Database

```sql
CREATE DATABASE loan_management_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

JPA (`ddl-auto=update`) creates the tables on first run. Seed the schema only —
do not create tables by hand.

### 3. Configuration (no secrets in git)

```bash
cp .env.example .env
```

Then edit `.env` and set at minimum:

```properties
DB_PASSWORD=<your rotated password>
BOOTSTRAP_ADMIN_PASSWORD=<a strong admin password>
```

Spring Boot loads `.env` automatically. If you prefer real environment
variables, they take precedence and `.env` can be deleted.

### 4. Run the backend

```bash
./mvnw spring-boot:run          # or: mvn spring-boot:run
```

The API is served on `http://localhost:8080`. A bootstrap `ADMIN` account is
created on first run from `BOOTSTRAP_ADMIN_*`.

### 5. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Vite serves on `http://localhost:5173` and proxies `/api` to the backend, so the
browser makes same-origin requests and CORS never enters the picture.

---

## Project layout

```
.
├── .env.example                  # template for local secrets
├── pom.xml
├── src/
│   ├── main/java/com/bank/lms/
│   │   ├── config/               # SecurityConfig, CORS, OpenAPI
│   │   ├── controller/           # HTTP layer
│   │   ├── dto/                  # request/response records
│   │   ├── entity/               # JPA entities
│   │   ├── exception/            # error handling
│   │   ├── repository/           # Spring Data repositories
│   │   ├── security/             # session, CSRF, auth principal
│   │   └── service/              # business logic
│   └── main/resources/
│       └── application.properties
└── frontend/                     # React SPA
    ├── src/
    │   ├── api/                  # one module per backend resource
    │   ├── auth/                 # session identity + route guards
    │   ├── components/           # layout/ and ui/
    │   ├── features/             # one folder per screen
    │   ├── hooks/                # TanStack Query hooks
    │   └── lib/                  # httpClient, validation, formatting, EMI
    └── vite.config.js
```

---

## Frontend architecture

`frontend/` is a plain JavaScript React SPA — no TypeScript, no extra framework
layer. The full rationale is in [`frontend/README.md`](frontend/README.md); the
load-bearing decisions are:

**One direction for data.** `feature -> hook -> api module -> httpClient ->
backend`. Pages never touch axios, and only `src/api/` knows a URL exists. The
axios instance in `src/lib/httpClient.js` is the single place that adds the
`X-XSRF-TOKEN` header and unwraps the error envelope into a typed `ApiError`.

**No client-side session state.** The session is an httpOnly cookie, so there is
nothing to store and nothing for an XSS bug to steal. `AuthProvider` re-asks
`GET /api/auth/me` on mount, which is why a hard refresh keeps you signed in. A
401 on any other endpoint means the session lapsed: the client notifies
`AuthProvider`, which clears the query cache and drops back to signed out, so a
stale tab cannot keep rendering another user's data.

**Every route is a dynamic import.** `src/App.jsx` is the route table and each
page is `lazy(() => import(...))`. A customer signing in never downloads the
admin approval queue, and first paint carries only React, the router and axios.

**Two independent queries run in parallel.** On the dashboard the summary and
the loan list are separate query hooks, so React Query starts both on the same
render instead of one handler awaiting the other. On customer lookup the same
applies to the customer record and their loans.

**The EMI preview mirrors the server.** `src/lib/emi.js` reproduces
`EmiCalculator`, including the 0% case that would otherwise divide 0/0, and
`src/lib/emi.test.js` asserts the same figures as `EmiCalculatorTest` — so the
amount shown before approval is provably the amount charged.

**Server-side validation is always the authority.** `src/lib/validation.js`
mirrors the bean validation for instant feedback, but a failed request writes
`error.fieldErrors` back onto the individual form fields.

---

## API

All `/api/**` routes except `POST /api/auth/login` and `GET /api/auth/csrf`
require an authenticated session.

| Method | Path                                  | Role      | Purpose                     |
| ------ | ------------------------------------- | --------- | --------------------------- |
| GET    | `/api/auth/csrf`                      | public    | Issue CSRF token            |
| POST   | `/api/auth/login`                     | public    | Start a session             |
| GET    | `/api/auth/me`                        | any       | Current identity            |
| POST   | `/api/auth/logout`                    | any       | End the session             |
| POST   | `/api/customers/register`             | public    | Register customer + login   |
| GET    | `/api/customers/{accountNumber}`      | owner/admin | Customer details          |
| POST   | `/api/loans/apply`                    | owner     | Apply for a loan            |
| GET    | `/api/loans`                          | any       | Loans visible to the caller |
| GET    | `/api/loans/summary`                  | any       | Dashboard aggregate         |
| GET    | `/api/loans/{loanId}`                 | owner/admin | Single loan              |
| GET    | `/api/customers/{accountNumber}/loans` | owner/admin | A customer's loans      |
| PUT    | `/api/loans/{loanId}/approve`         | admin     | Approve + calculate EMI     |

### CSRF in practice

The session rides on a cookie, so mutating requests are CSRF-protected.

```
GET  /api/auth/csrf        -> sets a readable XSRF-TOKEN cookie
POST /api/auth/login       <- header X-XSRF-TOKEN: <value from cookie>
```

Every subsequent `POST`/`PUT` must echo the current `XSRF-TOKEN` cookie value in
the `X-XSRF-TOKEN` header. In development the Vite proxy makes these
same-origin, so the browser attaches the cookies itself.

### Registration payload

The login username is the customer's email address, so there is one identifier
to remember rather than two.

```json
{
  "password": "at-least-ten-chars",
  "customer": {
    "fullName": "Asha Rao",
    "dob": "1994-03-21",
    "panNo": "ABCDE1234F",
    "phoneNo": "9876543210",
    "email": "asha.rao@example.com",
    "branchCode": 101
  }
}
```

### Error shape

Every error returns the same envelope:

```json
{
  "timestamp": "2026-09-27T10:15:30.123",
  "status": 400,
  "error": "Bad Request",
  "message": "Phone number must be exactly 10 digits",
  "path": "/api/customers/register",
  "fieldErrors": { "phoneNo": "Phone number must be exactly 10 digits" }
}
```

---

## Testing

```bash
mvn test                          # backend — 26 tests
cd frontend && npm test           # frontend — 70 tests
cd frontend && npm run lint       # oxlint
```

The backend suite grew from 1 test in the original to 26, covering typed
exceptions and their HTTP mapping, the EMI formula (including 0%), account-number
generation, the registration contract, security rules, and the four list/lookup
endpoints.

The frontend suite covers the EMI preview, validation rules, `en-IN` formatting,
`Field` accessibility wiring, and the loan-approval flow against a mocked API.
