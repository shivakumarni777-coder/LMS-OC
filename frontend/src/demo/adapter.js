/**
 * An axios adapter backed by in-memory fixtures, for running the frontend with
 * no backend at all.
 *
 * WHY AN ADAPTER, AND NOT A MOCKING LIBRARY
 * -----------------------------------------
 * Axios lets you swap the transport. Everything above the transport - the CSRF
 * request interceptor, the ApiError envelope unwrapping, the session-expiry
 * notification - stays exactly as it is in production and is genuinely
 * exercised. A library that intercepts at the network layer instead would need
 * a service worker, and a service worker that has not finished activating on a
 * cold first load is precisely the sort of thing that hangs in front of an
 * audience. An adapter is synchronous to install and cannot fail that way.
 *
 * The one behavioural difference is deliberate and documented below: CSRF is not
 * validated, because there is no session to protect.
 */

import { buildDataset, calculateEmi, summarise, BRANCHES, DEMO_PASSWORD } from './fixtures.js';
import { createSessionStore } from './sessionStore.js';

const CSRF_TOKEN = 'demo-csrf-token';

function badCredentials(path) {
  return {
    error: {
      status: 400,
      data: errorEnvelope(400, 'Invalid username or password.', path, {
        username: 'Invalid username or password.',
      }),
    },
  };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function errorEnvelope(status, message, path, fieldErrors = {}) {
  return {
    timestamp: new Date().toISOString(),
    status,
    error: status === 400 ? 'Bad Request' : status === 404 ? 'Not Found'
      : status === 409 ? 'Conflict' : 'Unauthorized',
    message,
    path,
    fieldErrors,
  };
}

/**
 * Builds the adapter, owning all mutable demo state.
 *
 * Kept as a factory so a reload or a re-enable gets clean state rather than the
 * accumulated mutations of the previous run, which is what makes a repeated demo
 * behave identically.
 */
export function createDemoAdapter({ customerCount = 100, store = createSessionStore() } = {}) {
  const state = buildDataset({ customerCount });

  // Who the browser is signed in as, or null. Session semantics are honoured so
  // the app's real guards, redirects and 401 handling all still run.
  //
  // Seeded from `store`, not left null, so a reload resumes the session exactly
  // as the real cookie does. `principal` is still a local variable, so route
  // matching reads one source of truth rather than reaching into storage on
  // every request.
  let principal = store.load();

  const isAdmin = () => principal?.role === 'ADMIN';
  const owns = (accountNumber) => principal?.accountNumber === accountNumber;

  function requireAuth(path) {
    return principal ? null : errorEnvelope(401, 'Authentication required.', path);
  }

  /** Routes one request. Returns { status, data } or { error }. */
  function route(method, path, body) {
    if (method === 'GET' && path === '/api/auth/csrf') {
      return { status: 200, data: { headerName: 'X-XSRF-TOKEN', token: CSRF_TOKEN } };
    }

    if (method === 'POST' && path === '/api/auth/login') {
      const { username, password } = body ?? {};

      if (password !== DEMO_PASSWORD) {
        return badCredentials(path);
      }

      if (username === state.admin.username) {
        // Setting `principal` is what actually establishes the session. Returning
        // an identity without doing so would render the dashboard for a moment
        // and then bounce straight back to the login screen on the next request.
        principal = { ...state.admin };
        store.save(principal);
        return { status: 200, data: identity(principal) };
      }

      const record = state.customers.find((c) => c.username === username);
      if (!record) return badCredentials(path);

      principal = {
        userId: 1000 + state.customers.indexOf(record),
        username: record.username,
        fullName: record.customer.fullName,
        role: 'CUSTOMER',
        accountNumber: record.customer.accountNumber,
      };
      store.save(principal);
      return { status: 200, data: identity(principal) };
    }

    if (method === 'GET' && path === '/api/auth/me') {
      if (!principal) {
        return { error: { status: 401, data: errorEnvelope(401, 'Authentication required.', path) } };
      }
      return { status: 200, data: identity(principal) };
    }

    if (method === 'POST' && path === '/api/auth/logout') {
      principal = null;
      // Both halves of the sign-out, not just one. Clearing only the variable
      // would leave the identity in storage, and the next page load would
      // silently sign the user straight back in.
      store.clear();
      return { status: 204, data: '' };
    }

    // --- Public: reference data -------------------------------------------
    if (method === 'GET' && path === '/api/branches') {
      return { status: 200, data: BRANCHES };
    }

    if (method === 'POST' && path === '/api/customers/register') {
      const customer = body?.customer ?? {};
      const fieldErrors = {};
      if (!customer.fullName) fieldErrors.fullName = 'Full name cannot be blank';
      if (!customer.dob) fieldErrors.dob = 'Date of birth is required';
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(customer.panNo ?? '')) {
        fieldErrors.panNo = 'PAN must match the format ABCDE1234F';
      }
      if (!/^\d{10}$/.test(customer.phoneNo ?? '')) {
        fieldErrors.phoneNo = 'Phone number must be exactly 10 digits';
      }
      if (!customer.email) fieldErrors.email = 'Email is required';
      if (!customer.branchCode) fieldErrors.branchCode = 'Branch code must be selected';
      if (Object.keys(fieldErrors).length) {
        return {
          error: {
            status: 400,
            data: errorEnvelope(400, 'Validation failed.', path, fieldErrors),
          },
        };
      }

      const record = {
        customer: { ...customer },
        username: customer.email,
      };
      state.customers.push(record);
      state.accounts.set(customer.accountNumber, record.customer);
      return { status: 201, data: record };
    }

    // --- Authenticated ----------------------------------------------------
    const authError = requireAuth(path);
    if (authError) return { error: { status: 401, data: authError } };

    if (method === 'GET' && path === '/api/loans/summary') {
      return { status: 200, data: summarise(state.loans) };
    }

    if (method === 'GET' && path === '/api/loans') {
      // A customer only ever sees their own portfolio; an admin sees all of it.
      // The demo keeps that rule so the scoping screen still demonstrates
      // something real rather than showing everyone everything.
      const visible = isAdmin() ? state.loans : state.loans.filter((l) => owns(l.accountNumber));
      return { status: 200, data: visible };
    }

    const loanMatch = path.match(/^\/api\/loans\/(\d+)$/);
    if (method === 'GET' && loanMatch) {
      const loan = state.loans.find((l) => l.loanId === Number(loanMatch[1]));
      if (!loan) {
        return { error: { status: 404, data: errorEnvelope(404, 'Loan not found.', path) } };
      }
      if (!isAdmin() && !owns(loan.accountNumber)) {
        // 404 rather than 403: a 403 would confirm the loan exists.
        return { error: { status: 404, data: errorEnvelope(404, 'Loan not found.', path) } };
      }
      return { status: 200, data: loan };
    }

    const approveMatch = path.match(/^\/api\/loans\/(\d+)\/approve$/);
    if (method === 'PUT' && approveMatch) {
      if (!isAdmin()) {
        return { error: { status: 403, data: errorEnvelope(403, 'Forbidden.', path) } };
      }
      const loan = state.loans.find((l) => l.loanId === Number(approveMatch[1]));
      if (!loan) {
        return { error: { status: 404, data: errorEnvelope(404, 'Loan not found.', path) } };
      }
      if (loan.loanStatus !== 'PENDING') {
        return {
          error: {
            status: 400,
            data: errorEnvelope(400, 'Only a pending loan can be approved.', path),
          },
        };
      }
      const tenureMonths = Number(body?.tenureMonths);
      if (!tenureMonths || tenureMonths < 1 || tenureMonths > 480) {
        return {
          error: {
            status: 400,
            data: errorEnvelope(400, 'Validation failed.', path, {
              tenureMonths: 'Tenure must be between 1 and 480 months',
            }),
          },
        };
      }
      loan.loanStatus = 'APPROVED';
      loan.tenureMonths = tenureMonths;
      loan.monthlyEmi = calculateEmi(loan.principalAmount, loan.interestRate, tenureMonths);
      return { status: 200, data: loan };
    }

    if (method === 'POST' && path === '/api/loans/apply') {
      const accountNumber = Number(body?.accountNumber);
      if (!state.accounts.has(accountNumber)) {
        return {
          error: {
            status: 400,
            data: errorEnvelope(400, 'Validation failed.', path, {
              accountNumber: 'No such account number',
            }),
          },
        };
      }
      if (!isAdmin() && !owns(accountNumber)) {
        return { error: { status: 403, data: errorEnvelope(403, 'Forbidden.', path) } };
      }
      const rates = { HOME: 8.5, EDUCATION: 9.0, PERSONAL: 12.5 };
      const loanType = body?.loanType;
      const principalAmount = round2(Number(body?.principalAmount));
      if (!rates[loanType] || !(principalAmount >= 1000)) {
        return {
          error: {
            status: 400,
            data: errorEnvelope(400, 'Validation failed.', path, {
              ...(rates[loanType] ? {} : { loanType: 'Loan type must be HOME, EDUCATION or PERSONAL' }),
              ...(principalAmount >= 1000 ? {} : { principalAmount: 'Principal amount must be at least 1,000' }),
            }),
          },
        };
      }
      const loan = {
        loanId: state.loans.length + 1,
        accountNumber,
        loanType,
        principalAmount,
        interestRate: rates[loanType],
        loanStatus: 'PENDING',
        applicationDate: isoToday(),
        tenureMonths: null,
        monthlyEmi: null,
      };
      state.loans.push(loan);
      return { status: 201, data: loan };
    }

    const customerMatch = path.match(/^\/api\/customers\/(\d+)$/);
    if (method === 'GET' && customerMatch) {
      const accountNumber = Number(customerMatch[1]);
      const customer = state.accounts.get(accountNumber);
      if (!customer) {
        return { error: { status: 404, data: errorEnvelope(404, 'Customer not found.', path) } };
      }
      return { status: 200, data: customer };
    }

    const customerLoansMatch = path.match(/^\/api\/customers\/(\d+)\/loans$/);
    if (method === 'GET' && customerLoansMatch) {
      const accountNumber = Number(customerLoansMatch[1]);
      if (!state.accounts.has(accountNumber)) {
        return { error: { status: 404, data: errorEnvelope(404, 'Customer not found.', path) } };
      }
      return {
        status: 200,
        data: state.loans.filter((l) => l.accountNumber === accountNumber),
      };
    }

    return { error: { status: 404, data: errorEnvelope(404, 'No such endpoint.', path) } };
  }

  function identity(user) {
    return {
      userId: user.userId,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      accountNumber: user.accountNumber ?? null,
      issuedAt: new Date().toISOString(),
    };
  }

  /** The axios adapter function itself. */
  return function demoAdapter(config) {
    // Normalised to upper case once, here, so every route can compare against a
    // constant. Axios hands adapters a lower-case method, so comparing routes
    // against 'POST' matched nothing at all: every request fell through to the
    // auth guard and the demo answered 401 to its own login call. Keeping the
    // casing convention in one place stops it drifting apart again.
    const method = (config.method ?? 'get').toUpperCase();
    const path = normalisePath(config.url, config.baseURL);
    const body = parseBody(config.data);

    let result;
    try {
      result = route(method, path, body);
    } catch {
      // An unexpected throw must not white-screen the app in front of an
      // audience, so it is converted into the same error envelope the real API
      // uses and the UI renders its normal error state instead.
      result = {
        error: { status: 500, data: errorEnvelope(500, 'Demo backend error.', path) },
      };
    }

    if (result.error) {
      return Promise.reject(toAxiosError(result.error, config));
    }

    return Promise.resolve({
      data: result.data,
      status: result.status,
      statusText: String(result.status),
      headers: { 'content-type': 'application/json' },
      config,
      request: { demo: true },
    });
  };
}

/**
 * Reconstructs the full path.
 *
 * `config.url` is relative and `config.baseURL` is the axios default, so they
 * have to be rejoined. Naively concatenating them yields '/api/api/loans',
 * because the callers already include /branches, /loans and so on.
 */
function normalisePath(url, baseURL) {
  const combined = `${baseURL ?? ''}${url ?? ''}`.replace(/\/{2,}/g, '/');
  return combined.split('?')[0].replace(/\/$/, '');
}

function parseBody(data) {
  if (!data) return undefined;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }
  return data;
}

/**
 * Rejects in the exact shape axios's real adapters reject in.
 *
 * This matters: the response interceptor reads `error.config` and `error.response`
 * to build an ApiError and to decide whether a 401 means the session lapsed.
 * A rejection missing either field would be swallowed or misreported instead of
 * surfacing as the real error shape.
 */
function toAxiosError({ status, data }, config) {
  const error = new Error(
    typeof data === 'string' ? data : (data?.message ?? `Request failed with status ${status}`),
  );
  error.config = config;
  error.isAxiosError = true;
  error.response = {
    data,
    status,
    statusText: String(status),
    headers: { 'content-type': 'application/json' },
    config,
  };
  return error;
}
