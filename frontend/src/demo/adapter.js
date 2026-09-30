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
 * Drops null and undefined properties, mirroring the backend's Jackson
 * configuration. The trailing `false` matters: `hasBankAccount: false` is a real
 * answer and must survive, so only nullish values are removed.
 */
function omitNulls(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== null && v !== undefined),
  );
}

/** `ABCDE1234F` becomes `XXXXX1234X`, the same shape the backend returns. */
function maskPan(panNo) {
  if (typeof panNo !== 'string' || panNo.length !== 10) return panNo;
  return `XXXXX${panNo.slice(5, 9)}X`;
}

/**
 * The upload ceiling, matching the backend's own.
 *
 * Duplicated rather than imported from the document service on purpose: that
 * module pulls in the HTTP client and therefore the adapter, so sharing the
 * constant would make the fixtures depend on the transport they exist to replace.
 */
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Mirrors the backend's AccountOpeningStatus, for validating `?status=`. */
const ACCOUNT_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

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
  const isCustomer = () => principal?.role === 'CUSTOMER';
  const owns = (accountNumber) => principal?.accountNumber === accountNumber;

  function requireAuth(path) {
    return principal ? null : errorEnvelope(401, 'Authentication required.', path);
  }

  /** The caller's outstanding PENDING request, oldest first. */
  function currentRequest(userId) {
    return state.requests.find((r) => r.userId === userId && r.status === 'PENDING') ?? null;
  }

  /**
   * The caller's most recent request of any status, newest first.
   *
   * Deliberately not the same lookup as `currentRequest`. That one decides whether
   * a second application is allowed, so it has to ignore rejections; this one
   * exists to show the customer where they got to, so it must not. Merging them
   * either re-blocks the resubmission or hides the rejection, depending on which
   * way round it went.
   */
  function latestRequest(userId) {
    return (
      state.requests
        .filter((r) => r.userId === userId)
        // Newest first, by timestamp and then by id. The id tiebreak is not
        // decoration: requestedAt is millisecond-resolution, so a customer who
        // applies again straight after being rejected can produce two rows with
        // the same instant. Without it, insertion order decides - which reports
        // the rejection as the latest request while an officer sits on the
        // resubmission, the exact thing this ordering exists to avoid. Ids only
        // ever increase, so they stand in for "filed later".
        .sort(
          (a, b) =>
            b.requestedAt.localeCompare(a.requestedAt) || b.requestId - a.requestId,
        )[0] ?? null
    );
  }

  /**
   * Brings a held identity back in line with the record it describes.
   *
   * Only the customer branch can change: an administrator has no customer record
   * to pick anything up from. The persisted copy is updated too, or the next page
   * load would fall back to the stale value it was seeded from.
   */
  function refreshPrincipal() {
    if (!principal || !isCustomer()) return;

    const record = state.customers.find((c) => c.userId === principal.userId);
    if (!record) return;

    principal = {
      ...principal,
      fullName: record.customer.fullName,
      accountNumber: record.customer.accountNumber,
      dob: record.customer.dob,
      phoneNo: record.customer.phoneNo,
      branchCode: record.customer.branchCode,
    };
    store.save(principal);
  }

  /**
   * The account-status projection.
   *
   * Carries the customer's most recent request, not merely an outstanding one, so
   * all four states come back distinctly: nothing filed, awaiting review, turned
   * down, or an account open. Only reporting PENDING made a rejection
   * indistinguishable from never having applied, and the page could then offer a
   * fresh form without ever saying why the last one failed.
   *
   * The form is still offered after a rejection. That is the server's rule as
   * much as this one's - a decided request is history, and only a PENDING one
   * blocks a resubmission - and getting it wrong here would make the demo
   * untestable for the exact case it exists to demonstrate.
   */
  function accountStatusFor(userId) {
    const record = state.customers.find((c) => c.userId === userId);
    if (record?.customer?.accountNumber) {
      return { accountNumber: record.customer.accountNumber, hasBankAccount: true };
    }
    const request = latestRequest(userId);
    return omitNulls({
      accountNumber: null,
      hasBankAccount: false,
      accountOpeningRequest: request ? toRequestResponse(request) : null,
    });
  }

  /** Projects a request the way the customer sees it: PAN masked. */
  function toRequestResponse(request) {
    return omitNulls({
      requestId: request.requestId,
      status: request.status,
      maskedPanNo: maskPan(request.panNo),
      requestedAt: request.requestedAt,
      reviewedAt: request.reviewedAt,
      reviewNotes: request.reviewNotes,
      resultingAccountNumber: request.resultingAccountNumber,
    });
  }

  /**
   * Projects a request the way an officer sees it: PAN and date of birth in
   * full, plus the applicant's profile.
   *
   * The profile fields are read from the login rather than stored on the request.
   * The real request row carries only a PAN, and the service copies the rest
   * from the customer's profile at read time - so a demo that copied them at
   * write time would drift the moment a customer corrected their own details,
   * and would show a stale name on a request the officer is deciding.
   */
  function toAdminResponse(request) {
    const profile = state.customers.find((c) => c.userId === request.userId)?.customer;

    return omitNulls({
      requestId: request.requestId,
      status: request.status,
      panNo: request.panNo,
      fullName: profile?.fullName,
      email: profile?.email,
      phoneNo: profile?.phoneNo,
      dob: profile?.dob,
      branchCode: profile?.branchCode,
      requestedAt: request.requestedAt,
      reviewedAt: request.reviewedAt,
      reviewNotes: request.reviewNotes,
      resultingAccountNumber: request.resultingAccountNumber,
    });
  }

/** Routes one request. Returns { status, data } or { error }. */
function route(method, rawPath, body) {
  // The query string is split off once here, so a filter reads as the parameter
  // the backend also takes (`?status=PENDING`) instead of being scraped out of
  // the path by hand at every use.
  const [path, search = ''] = rawPath.split('?');
  const query = new URLSearchParams(search);
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
        userId: record.userId,
        username: record.username,
        fullName: record.customer.fullName,
        role: 'CUSTOMER',
        // Null for a customer who has registered but not had an account opened.
        // That is a real state now, and the identity has to be able to express
        // it rather than inventing a number for someone who does not have one.
        accountNumber: record.customer.accountNumber,
        dob: record.customer.dob,
        phoneNo: record.customer.phoneNo,
        branchCode: record.customer.branchCode,
      };
      store.save(principal);
      return { status: 200, data: identity(principal) };
    }

    if (method === 'GET' && path === '/api/auth/me') {
      if (!principal) {
        return { error: { status: 401, data: errorEnvelope(401, 'Authentication required.', path) } };
      }
      // Re-read rather than echo the stored snapshot. The real endpoint rebuilds
      // the identity from the login row on every request, so after an officer
      // approves an account request the customer immediately sees the new account
      // number. A frozen copy would leave the demo showing "no customer account
      // linked" on My account until the next sign-in - contradicting the server it
      // stands in for.
      refreshPrincipal();
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
      // Mirrors the real DTO: credentials in a `password` field, the person in a
      // nested `profile`. The server keys its validation errors by the cascaded
      // path, so these are keyed `profile.fullName` and not `fullName` - if the
      // demo used flat keys it would agree with a form the real app rejects, and
      // disagree with the very page under test.
      const profile = body?.profile ?? {};
      const fieldErrors = {};
      if (!profile.fullName) fieldErrors['profile.fullName'] = 'Full name cannot be blank';
      if (!profile.dob) fieldErrors['profile.dob'] = 'Date of birth is required';
      if (!/^\d{10}$/.test(profile.phoneNo ?? '')) {
        fieldErrors['profile.phoneNo'] = 'Phone number must be exactly 10 digits';
      }
      if (!profile.email) fieldErrors['profile.email'] = 'Email is required';
      if (!profile.branchCode) fieldErrors['profile.branchCode'] = 'Branch code must be selected';
      if (!body?.password) fieldErrors.password = 'Password is required';
      if (Object.keys(fieldErrors).length) {
        return {
          error: {
            status: 400,
            data: errorEnvelope(400, 'Validation failed.', path, fieldErrors),
          },
        };
      }

      if (state.customers.some((c) => c.username === profile.email)) {
        return {
          error: {
            status: 409,
            data: errorEnvelope(409, 'That email address is already registered.', path, {
              'profile.email': 'That email address is already registered',
            }),
          },
        };
      }

      // No account, and no PAN. A bank account is opened by a separate approved
      // request; minting one here would let the demo show a happy path the real
      // application cannot produce, and would quietly contradict the point of
      // the account-opening flow.
      const record = {
        // Past every fixture id, so a registered customer can never collide
        // with one of the hundred generated accounts.
        userId: 2000 + state.customers.length,
        customer: { ...profile, accountNumber: null },
        username: profile.email,
      };
      state.customers.push(record);
      return {
        status: 201,
        data: omitNulls({
          username: record.username,
          fullName: record.customer.fullName,
          email: record.customer.email,
          accountNumber: record.customer.accountNumber,
        }),
      };
    }

    // --- Authenticated ----------------------------------------------------
    // Everything past this point needs a session, which is where the real
    // SecurityConfig's `anyRequest().authenticated()` sits. Account opening is
    // below this line on purpose: it is a customer-scoped resource, and serving
    // it to an anonymous caller would show the demo answering a question the real
    // backend would refuse with a 401.
    const authError = requireAuth(path);
    if (authError) return { error: { status: 401, data: authError } };

    // --- Account opening ----------------------------------------------------

    if (method === 'GET' && path === '/api/account/status') {
      if (!isCustomer()) {
        // The real endpoint answers for anyone signed in, but with the status of
        // a login that has no customer account: no account, no request.
        return { status: 200, data: { hasBankAccount: false } };
      }
      return { status: 200, data: accountStatusFor(principal.userId) };
    }

    if (method === 'GET' && path === '/api/accounts/requests/me') {
      const current = currentRequest(principal?.userId);
      return { status: 200, data: current ? toRequestResponse(current) : null };
    }

    if (method === 'POST' && path === '/api/accounts/requests') {
      if (!isCustomer()) {
        return {
          error: {
            status: 403,
            data: errorEnvelope(403, 'Forbidden.', path),
          },
        };
      }
      if (principal.accountNumber) {
        return {
          error: {
            status: 400,
            data: errorEnvelope(
              400,
              'This login already has a bank account, so there is nothing to open.',
              path,
            ),
          },
        };
      }
      const panNo = body?.panNo ?? '';
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNo)) {
        return {
          error: {
            status: 400,
            data: errorEnvelope(400, 'Validation failed.', path, {
              panNo: 'PAN must match the format ABCDE1234F',
            }),
          },
        };
      }
      if (currentRequest(principal.userId)) {
        return {
          error: {
            status: 409,
            data: errorEnvelope(
              409,
              'You already have an account-opening request awaiting review.',
              path,
            ),
          },
        };
      }
      const request = {
        requestId: state.requests.length + 1,
        userId: principal.userId,
        panNo,
        status: 'PENDING',
        requestedAt: new Date().toISOString(),
        reviewedAt: null,
        reviewNotes: null,
        resultingAccountNumber: null,
      };
      state.requests.push(request);
      return { status: 201, data: toRequestResponse(request) };
    }

    // The officer's account-opening queue.
    //
    // `status` is read off the query string the same way the backend reads it
    // from a @RequestParam, and it filters on the server rather than in the
    // client - so a demo that filtered in the page would be a different screen
    // from the real one, just as quietly.
    if (method === 'GET' && path === '/api/admin/accounts/requests') {
      if (!isAdmin()) {
        return { error: { status: 403, data: errorEnvelope(403, 'Forbidden.', path) } };
      }
      const status = query.get('status');
      if (status && !ACCOUNT_REQUEST_STATUSES.includes(status)) {
        // The real controller binds the status to the enum, so an unknown value
        // is a 400 before the query runs. A demo that quietly returned the whole
        // list instead would make a typo look like a working filter.
        return {
          error: {
            status: 400,
            data: errorEnvelope(400, `Unknown status: ${status}`, path),
          },
        };
      }
      const matching = status
        ? state.requests.filter((r) => r.status === status)
        : state.requests;
      // Unfiltered is newest first, as the backend's list is; filtered is oldest
      // first, so an officer works a status queue in the order it was filed.
      const ordered = [...matching].sort((a, b) =>
        status
          ? a.requestedAt.localeCompare(b.requestedAt)
          : b.requestedAt.localeCompare(a.requestedAt),
      );
      return { status: 200, data: ordered.map(toAdminResponse) };
    }

    const requestMatch = path.match(/^\/api\/admin\/accounts\/requests\/(\d+)$/);
    if (requestMatch) {
      if (!isAdmin()) {
        return { error: { status: 403, data: errorEnvelope(403, 'Forbidden.', path) } };
      }
      const request = state.requests.find((r) => r.requestId === Number(requestMatch[1]));
      if (!request) {
        return { error: { status: 404, data: errorEnvelope(404, 'Not found.', path) } };
      }

      if (method === 'GET') {
        return { status: 200, data: toAdminResponse(request) };
      }

      if (method === 'PUT') {
        const outcome = body?.decision;
        if (!['APPROVED', 'REJECTED'].includes(outcome)) {
          return {
            error: {
              status: 400,
              data: errorEnvelope(400, 'Validation failed.', path, {
                decision: 'Decision must be APPROVED or REJECTED',
              }),
            },
          };
        }
        const notes = body?.reviewNotes;
        if (notes !== undefined && notes !== null && String(notes).length > 500) {
          return {
            error: {
              status: 400,
              data: errorEnvelope(400, 'Validation failed.', path, {
                reviewNotes: 'Review notes cannot exceed 500 characters',
              }),
            },
          };
        }
        // PENDING-only, as the service is. Refusing a second decision is the
        // whole reason the review screen renders a decided request read-only.
        if (request.status !== 'PENDING') {
          return {
            error: {
              status: 400,
              data: errorEnvelope(
                400,
                `This request has already been ${request.status.toLowerCase()}.`,
                path,
              ),
            },
          };
        }
        request.status = outcome;
        request.reviewedAt = new Date().toISOString();
        request.reviewNotes = notes ?? null;

        if (outcome === 'APPROVED') {
          const record = state.customers.find((c) => c.userId === request.userId);
          const accountNumber = 304000000000 + state.requests.length * 7717;
          request.resultingAccountNumber = accountNumber;
          if (record) {
            record.customer.accountNumber = accountNumber;
            state.accounts.set(accountNumber, record.customer);
          }
        }
        // The full projection, not a status stub: the real endpoint returns
        // AdminResponse, and the review screen reads the resulting account
        // number straight out of this response.
        return { status: 200, data: toAdminResponse(request) };
      }
    }

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

    // --- Loan documents -----------------------------------------------------
    //
    // Documents belong to a loan, and the loan's own customer is what authorises
    // them. Both checks are made through the loan rather than against a customer
    // id, mirroring the server: a caller may not attach a document to an
    // application they cannot see, and the answer for one they cannot is the
    // same 404 as for a loan that does not exist.

    const documentsMatch = path.match(/^\/api\/loans\/(\d+)\/documents$/);
    if (documentsMatch) {
      const loanId = Number(documentsMatch[1]);
      const loan = state.loans.find((l) => l.loanId === loanId);
      if (!loan) {
        return { error: { status: 404, data: errorEnvelope(404, 'Loan not found.', path) } };
      }
      if (!isAdmin() && !owns(loan.accountNumber)) {
        // 404 rather than 403, for the same reason the loan itself answers 404.
        return { error: { status: 404, data: errorEnvelope(404, 'Loan not found.', path) } };
      }

      if (method === 'GET') {
        // Oldest first, as the real repository orders by upload time.
        return {
          status: 200,
          data: state.documents.filter((d) => d.loanId === loanId),
        };
      }

      if (method === 'POST') {
        return uploadDocument(path, loan, body);
      }
    }

    const documentDownloadMatch = path.match(/^\/api\/documents\/(\d+)\/download$/);
    if (method === 'GET' && documentDownloadMatch) {
      const document = state.documents.find(
        (d) => d.documentId === Number(documentDownloadMatch[1]),
      );
      if (!document) {
        return {
          error: { status: 404, data: errorEnvelope(404, 'Document not found.', path) },
        };
      }
      // Resolved through the document's loan, so the ownership check cannot be
      // influenced by a second id in the path.
      const loan = state.loans.find((l) => l.loanId === document.loanId);
      if (!loan || (!isAdmin() && !owns(loan.accountNumber))) {
        return {
          error: { status: 404, data: errorEnvelope(404, 'Document not found.', path) },
        };
      }
      return {
        status: 200,
        // Real bytes, not a placeholder, so a download in the demo produces a
        // file rather than a page that renders a list of characters.
        data: new Blob([document.content], { type: document.contentType }),
        headers: {
          'content-type': document.contentType,
          // `attachment`, matching the server: an uploaded file is untrusted and
          // must not be rendered in the page's own origin.
          'content-disposition':
            `attachment; filename*=UTF-8''${encodeURIComponent(document.documentName)}`,
        },
      };
    }

    return { error: { status: 404, data: errorEnvelope(404, 'No such endpoint.', path) } };
  }

  /**
   * Stores one uploaded document against a loan.
   *
   * The multipart body is read the way the server reads it: `file` and
   * `documentType` are parts, not JSON fields, and the same three rules are
   * applied in the same order - a file must be chosen, it must be within the
   * limit, and it must be described. The demo refuses exactly what the backend
   * refuses, so a flow that works in the demo works against the server.
   */
  async function uploadDocument(path, loan, body) {
    const file = body?.get?.('file') ?? null;
    const rawType = body?.get?.('documentType');
    const documentType = typeof rawType === 'string' ? rawType.trim() : '';

    if (!file || file.size === 0) {
      return {
        error: { status: 400, data: errorEnvelope(400, 'Choose a file to upload.', path) },
      };
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      return {
        error: {
          status: 400,
          data: errorEnvelope(400, 'Documents must be 10 MB or smaller.', path),
        },
      };
    }
    if (!documentType) {
      return {
        error: {
          status: 400,
          data: errorEnvelope(400, 'Describe what kind of document this is.', path),
        },
      };
    }
    if (documentType.length > 40) {
      return {
        error: {
          status: 400,
          data: errorEnvelope(400, 'The document description is too long.', path),
        },
      };
    }

    const document = {
      documentId: state.documents.length + 1,
      loanId: loan.loanId,
      documentType,
      documentName: file.name || 'document',
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      status: 'PENDING',
      rejectionReason: null,
      uploadedAt: new Date().toISOString(),
      // The bytes themselves, so a later download returns the file that was
      // uploaded. A demo that stored only metadata would render the upload flow
      // perfectly while quietly failing the one step that proves it worked.
      content: new Uint8Array(await file.arrayBuffer()),
    };
    state.documents.push(document);

    return { status: 201, data: toDocumentResponse(document) };
  }

  /** A document as the customer and the officer both see it. */
  function toDocumentResponse(document) {
    return omitNulls({
      documentId: document.documentId,
      loanId: document.loanId,
      documentType: document.documentType,
      documentName: document.documentName,
      contentType: document.contentType,
      sizeBytes: document.sizeBytes,
      status: document.status,
      rejectionReason: document.rejectionReason,
      uploadedAt: document.uploadedAt,
    });
  }

  function identity(user) {
    // Nulls are dropped, because the real backend is configured with
    // `default-property-inclusion=non_null` and a null field is simply not in the
    // response. The demo has to agree: a UI that checks `accountNumber !== null`
    // against the demo and truthiness against the real API is a UI that behaves
    // differently in the two, which is worse than either being wrong alone.
    return omitNulls({
      userId: user.userId,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      accountNumber: user.accountNumber ?? null,
      dob: user.dob ?? null,
      phoneNo: user.phoneNo ?? null,
      branchCode: user.branchCode ?? null,
      issuedAt: new Date().toISOString(),
    });
  }

  /** The axios adapter function itself. */
  return async function demoAdapter(config) {
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
      // Awaited, and the function is async for that reason: reading a multipart
      // upload needs the file's bytes, which is a promise. Without the await a
      // rejection inside a route would escape the catch below and reject as a
      // raw error rather than the error envelope every other failure uses.
      result = await route(method, path, body);
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
      // A route that streams bytes sets its own content type; a download served
      // as JSON would be handed to the browser as a corrupt file.
      headers: { 'content-type': 'application/json', ...(result.headers ?? {}) },
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
  // The query string is kept, unlike the path, because `route` reads the
  // parameters out of it. Dropping it here would make every filter look like it
  // had been ignored: `?status=PENDING` would return the whole queue, and a
  // misspelt status would return 200 with everything instead of the 400 the
  // enum binding produces. Only the path is trimmed of a trailing slash, so a
  // `/?` cannot be mistaken for a parameter.
  const [path, search] = combined.split('?');
  const trimmed = path.replace(/\/$/, '');
  return search === undefined ? trimmed : `${trimmed}?${search}`;
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
