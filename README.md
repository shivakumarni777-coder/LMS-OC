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
└── src/
    ├── main/java/com/bank/lms/
    │   ├── config/               # SecurityConfig, CORS, OpenAPI
    │   ├── controller/           # HTTP layer
    │   ├── dto/                  # request/response records
    │   ├── entity/               # JPA entities
    │   ├── exception/            # error handling
    │   ├── repository/           # Spring Data repositories
    │   ├── security/             # session, CSRF, auth principal
    │   └── service/              # business logic
    └── main/resources/
        └── application.properties
```

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
mvn test                          # backend
cd frontend && npm test           # frontend
```
