import { describe, it, expect, beforeEach } from 'vitest';
import { createDemoAdapter } from '../demo/adapter.js';
import { DEMO_PASSWORD } from '../demo/fixtures.js';

/**
 * Tests for the demo adapter.
 *
 * The seminar deliverable is the demo, and the demo runs on this code with no
 * backend to fall back on, so a regression here is a blank screen on stage
 * rather than a failing request someone notices in a log. These tests cover the
 * behaviours the presentation actually leans on: both roles signing in, the
 * per-customer scoping, approving a pending loan, and the ownership rule that
 * hides another customer's loan behind a 404.
 */

/** Drives the adapter the way axios would, and unwraps the response. */
function call(adapter, method, url, data) {
  const config = {
    method,
    url,
    baseURL: '/api',
    data: data === undefined ? undefined : JSON.stringify(data),
    headers: {},
  };
  return adapter(config).then(
    (response) => ({ status: response.status, data: response.data }),
    (error) => ({ status: error.response.status, data: error.response.data, error }),
  );
}

const asCustomer = async (adapter, username) => {
  await call(adapter, 'post', '/auth/login', { username, password: DEMO_PASSWORD });
  return username;
};

describe('demo adapter', () => {
  let adapter;

  beforeEach(() => {
    // Storage is cleared as well as the adapter replaced, because the session
    // now outlives the adapter by design. Without this a sign-in in one test
    // would be inherited by the next, and every test asserting an anonymous
    // 401 would pass for the wrong reason or fail outright.
    window.sessionStorage.clear();
    // A fresh adapter per test, so in-memory mutations cannot leak between them.
    adapter = createDemoAdapter({ customerCount: 10 });
  });

  describe('sessions', () => {
    it('signs in an administrator and establishes a session', async () => {
      const { status, data } = await call(adapter, 'post', '/auth/login', {
        username: 'admin',
        password: DEMO_PASSWORD,
      });

      expect(status).toBe(200);
      expect(data.role).toBe('ADMIN');
      // Guards the bug where an identity was returned without setting the
      // session, which logged in briefly and then bounced straight to login.
      const me = await call(adapter, 'get', '/auth/me');
      expect(me.status).toBe(200);
      expect(me.data.username).toBe('admin');
    });

    it('signs in a customer on their email and scopes them to their account', async () => {
      const username = await asCustomer(adapter, 'demo.user000@lms-oc.test');
      const { data } = await call(adapter, 'get', '/auth/me');

      expect(data.role).toBe('CUSTOMER');
      expect(data.username).toBe(username);
      expect(data.accountNumber).toEqual(expect.any(Number));
    });

    it('rejects a wrong password', async () => {
      const { status, data } = await call(adapter, 'post', '/auth/login', {
        username: 'admin',
        password: 'not-the-password',
      });

      expect(status).toBe(400);
      expect(data.fieldErrors.username).toBeTruthy();
    });

    it('refuses every protected endpoint before sign-in', async () => {
      const { status } = await call(adapter, 'get', '/loans');
      expect(status).toBe(401);
    });

    it('ends the session on logout', async () => {
      await asCustomer(adapter, 'demo.user000@lms-oc.test');
      await call(adapter, 'post', '/auth/logout');
      expect((await call(adapter, 'get', '/auth/me')).status).toBe(401);
    });

    it('keeps the session across a page reload', async () => {
      await asCustomer(adapter, 'demo.user000@lms-oc.test');

      // A reload is modelled by throwing the adapter away and building a new
      // one over the same storage, which is exactly what the browser does: the
      // JavaScript context is discarded, only what was persisted survives.
      const afterReload = createDemoAdapter({ customerCount: 10 });
      const { status, data } = await call(afterReload, 'get', '/auth/me');

      // This is the F5-on-stage bug. It held the identity in a closure variable,
      // so a reload answered 401 and threw the presenter back to the login page
      // in the middle of a demo. The real app never did this, because the
      // server-set session cookie is resent on every request.
      expect(status).toBe(200);
      expect(data.username).toBe('demo.user000@lms-oc.test');
      expect(data.role).toBe('CUSTOMER');
    });

    it('stays signed out after a reload once logged out', async () => {
      await asCustomer(adapter, 'demo.user000@lms-oc.test');
      await call(adapter, 'post', '/auth/logout');

      const afterReload = createDemoAdapter({ customerCount: 10 });

      // Guards the half-finished sign-out: clearing only the in-memory identity
      // would leave it in storage, and the reload would quietly sign the user
      // back in. Signing out has to mean signed out.
      expect((await call(afterReload, 'get', '/auth/me')).status).toBe(401);
    });

    it('ignores a corrupted stored identity rather than trusting it', async () => {
      await asCustomer(adapter, 'demo.user000@lms-oc.test');
      window.sessionStorage.setItem('lms-oc.demo.principal', '{"not":"an identity"');

      const afterReload = createDemoAdapter({ customerCount: 10 });

      // Unparseable JSON, and separately a well-formed object with no role,
      // must both read as no session. Trusting either would produce a
      // half-signed-in app that then fails its first real request.
      expect((await call(afterReload, 'get', '/auth/me')).status).toBe(401);
    });
  });

  describe('scoping', () => {
    it('shows an administrator every loan', async () => {
      await asCustomer(adapter, 'admin');
      const { data } = await call(adapter, 'get', '/loans');
      expect(data.length).toBeGreaterThan(10);
    });

    it('shows a customer only their own loans', async () => {
      await asCustomer(adapter, 'demo.user000@lms-oc.test');
      const { data: me } = await call(adapter, 'get', '/auth/me');
      const { data: loans } = await call(adapter, 'get', '/loans');

      expect(loans.length).toBeGreaterThan(0);
      loans.forEach((loan) => expect(loan.accountNumber).toBe(me.accountNumber));
    });

    it("hides another customer's loan behind a 404, not a 403", async () => {
      await asCustomer(adapter, 'demo.user000@lms-oc.test');
      const { data: me } = await call(adapter, 'get', '/auth/me');

      // Find a loan that exists but is not this customer's.
      await call(adapter, 'post', '/auth/login', { username: 'admin', password: DEMO_PASSWORD });
      const { data: all } = await call(adapter, 'get', '/loans');
      const foreign = all.find((loan) => loan.accountNumber !== me.accountNumber);

      await asCustomer(adapter, 'demo.user000@lms-oc.test');
      const { status } = await call(adapter, 'get', `/loans/${foreign.loanId}`);

      // A 403 would confirm the loan exists, so the rule is 404.
      expect(status).toBe(404);
    });
  });

  describe('loan workflow', () => {
    it('records an application as pending, with no tenure or EMI yet', async () => {
      await asCustomer(adapter, 'demo.user000@lms-oc.test');
      const { data: me } = await call(adapter, 'get', '/auth/me');

      const { status, data } = await call(adapter, 'post', '/loans/apply', {
        accountNumber: me.accountNumber,
        loanType: 'HOME',
        principalAmount: 500000,
      });

      expect(status).toBe(201);
      expect(data.loanStatus).toBe('PENDING');
      // A pending loan must not carry a repayment figure; the real application
      // only computes one on approval.
      expect(data.tenureMonths).toBeNull();
      expect(data.monthlyEmi).toBeNull();
    });

    it('sets tenure and EMI when an administrator approves', async () => {
      await asCustomer(adapter, 'demo.user000@lms-oc.test');
      const { data: me } = await call(adapter, 'get', '/auth/me');
      const { data: applied } = await call(adapter, 'post', '/loans/apply', {
        accountNumber: me.accountNumber,
        loanType: 'PERSONAL',
        principalAmount: 200000,
      });

      await asCustomer(adapter, 'admin');
      const { status, data } = await call(adapter, 'put', `/loans/${applied.loanId}/approve`, {
        tenureMonths: 24,
      });

      expect(status).toBe(200);
      expect(data.loanStatus).toBe('APPROVED');
      expect(data.tenureMonths).toBe(24);
      // Reducing balance: r = 0.125/12, EMI = P*r*(1+r)^n / ((1+r)^n - 1)
      // = 9461.46. Matches the backend's EmiCalculator, so a divergence in the
      // rate table or the formula would fail here rather than on stage.
      expect(data.monthlyEmi).toBeCloseTo(9461.46, 2);
    });

    it('refuses approval from a customer', async () => {
      await asCustomer(adapter, 'demo.user000@lms-oc.test');
      const { status } = await call(adapter, 'put', '/loans/1/approve', { tenureMonths: 12 });
      expect(status).toBe(403);
    });

    it('keeps the summary totals consistent with the loan list', async () => {
      await asCustomer(adapter, 'admin');
      const { data: loans } = await call(adapter, 'get', '/loans');
      const { data: summary } = await call(adapter, 'get', '/loans/summary');

      expect(summary.totalLoans).toBe(loans.length);
      const summed = summary.byStatus.reduce((total, s) => total + s.count, 0);
      expect(summed).toBe(loans.length);
    });
  });

  describe('branches and registration', () => {
    it('serves branches without a session', async () => {
      const { status, data } = await call(adapter, 'get', '/branches');
      expect(status).toBe(200);
      expect(data).toHaveLength(5);
    });

    it('reports per-field validation errors under the keys the server uses', async () => {
      const { status, data } = await call(adapter, 'post', '/customers/register', {
        profile: { fullName: '', email: '', phoneNo: '123' },
      });

      expect(status).toBe(400);
      // Cascaded paths, because the profile is nested in the request body. Flat
      // keys here would make the demo agree with a form the real server rejects.
      expect(Object.keys(data.fieldErrors)).toEqual(
        expect.arrayContaining([
          'profile.fullName',
          'profile.dob',
          'profile.phoneNo',
          'profile.email',
          'profile.branchCode',
          'password',
        ]),
      );
    });

    it('accepts a well-formed registration and opens no account', async () => {
      const { status, data } = await call(adapter, 'post', '/customers/register', {
        password: DEMO_PASSWORD,
        profile: {
          fullName: 'Seminar Attendee',
          email: 'speaker@lms-oc.test',
          phoneNo: '9876543210',
          dob: '1990-01-01',
          branchCode: 101,
        },
      });

      expect(status).toBe(201);
      expect(data.username).toBe('speaker@lms-oc.test');
      // Null fields are omitted by the backend's Jackson configuration, so the
      // absence of the key is the assertion - not a null.
      expect('accountNumber' in data).toBe(false);
    });

    it('refuses a duplicate email, as a unique username would', async () => {
      await call(adapter, 'post', '/customers/register', {
        password: DEMO_PASSWORD,
        profile: {
          fullName: 'Seminar Attendee',
          email: 'speaker@lms-oc.test',
          phoneNo: '9876543210',
          dob: '1990-01-01',
          branchCode: 101,
        },
      });

      const { status } = await call(adapter, 'post', '/customers/register', {
        password: DEMO_PASSWORD,
        profile: {
          fullName: 'Someone Else',
          email: 'speaker@lms-oc.test',
          phoneNo: '9876543211',
          dob: '1991-01-01',
          branchCode: 101,
        },
      });

      expect(status).toBe(409);
    });
  });

  describe('account opening', () => {
    const register = async (username, overrides = {}) =>
      call(adapter, 'post', '/customers/register', {
        password: DEMO_PASSWORD,
        profile: {
          fullName: 'New Customer',
          email: username,
          phoneNo: '9876543210',
          dob: '1990-01-01',
          branchCode: 101,
          ...overrides,
        },
      });

    /** Registers, then signs in, so the customer-scoped routes are reachable. */
    const registerAndSignIn = async (username) => {
      const { status } = await register(username);
      expect(status).toBe(201);
      await asCustomer(adapter, username);
    };

    it('says a customer with no account has none, and has applied for nothing', async () => {
      await registerAndSignIn('newcomer@lms-oc.test');

      const { status, data } = await call(adapter, 'get', '/account/status');

      expect(status).toBe(200);
      expect(data.hasBankAccount).toBe(false);
      expect('accountNumber' in data).toBe(false);
      expect(data.accountOpeningRequest).toBeUndefined();
    });

    it('reports an existing customer as having an account', async () => {
      await asCustomer(adapter, 'demo.user000@lms-oc.test');
      const { data } = await call(adapter, 'get', '/account/status');

      expect(data.hasBankAccount).toBe(true);
      expect(data.accountNumber).toEqual(expect.any(Number));
    });

    it('carries no account number on the identity of someone who has none', async () => {
      await registerAndSignIn('newcomer@lms-oc.test');
      const { data } = await call(adapter, 'get', '/auth/me');

      // Omitted rather than null, which is what the real backend does. A UI
      // written against a null would behave differently in demo and production.
      expect('accountNumber' in data).toBe(false);
      // The profile details are, so the account-opening form can show them.
      expect(data.dob).toBe('1990-01-01');
      expect(data.phoneNo).toBe('9876543210');
      expect(data.branchCode).toBe(101);
    });

    it('records a request and masks the PAN in the response', async () => {
      await registerAndSignIn('newcomer@lms-oc.test');

      const { status, data } = await call(adapter, 'post', '/accounts/requests', {
        panNo: 'ABCDE1234F',
      });

      expect(status).toBe(201);
      expect(data.status).toBe('PENDING');
      // The customer is told the request exists, not handed back a usable KYC
      // identifier. Only the officer's projection carries the real value.
      expect(data.maskedPanNo).toBe('XXXXX1234X');
      expect(JSON.stringify(data)).not.toContain('ABCDE1234F');
    });

    it('shows the outstanding request on the status page', async () => {
      await registerAndSignIn('newcomer@lms-oc.test');
      await call(adapter, 'post', '/accounts/requests', { panNo: 'ABCDE1234F' });

      const { data } = await call(adapter, 'get', '/account/status');

      expect(data.hasBankAccount).toBe(false);
      expect(data.accountOpeningRequest.status).toBe('PENDING');
      expect(data.accountOpeningRequest.requestId).toEqual(expect.any(Number));
    });

    it('refuses a second request while one is pending', async () => {
      await registerAndSignIn('newcomer@lms-oc.test');
      await call(adapter, 'post', '/accounts/requests', { panNo: 'ABCDE1234F' });

      const { status } = await call(adapter, 'post', '/accounts/requests', { panNo: 'ZZZZZ9999Z' });

      expect(status).toBe(409);
    });

    it('rejects a lower-case PAN, because the pattern is upper-case only', async () => {
      await registerAndSignIn('newcomer@lms-oc.test');

      const { status, data } = await call(adapter, 'post', '/accounts/requests', {
        panNo: 'abcde1234f',
      });

      // This is why the client upper-cases before submitting. The form cannot
      // submit a PAN the backend will accept.
      expect(status).toBe(400);
      expect(data.fieldErrors.panNo).toContain('ABCDE1234F');
    });

    it('refuses a request from a customer who already has an account', async () => {
      await asCustomer(adapter, 'demo.user000@lms-oc.test');
      const { status } = await call(adapter, 'post', '/accounts/requests', { panNo: 'ABCDE1234F' });

      expect(status).toBe(400);
    });

    it('answers 401 to every account route before sign-in', async () => {
      // The real SecurityConfig requires a session for these. Serving them
      // anonymously would let the demo answer a question the backend refuses.
      expect((await call(adapter, 'get', '/account/status')).status).toBe(401);
      expect((await call(adapter, 'get', '/accounts/requests/me')).status).toBe(401);
      expect((await call(adapter, 'post', '/accounts/requests', { panNo: 'ABCDE1234F' })).status)
        .toBe(401);
    });

    it('opens the account when an officer approves, and the customer can then apply', async () => {
      await registerAndSignIn('newcomer@lms-oc.test');
      const { data: request } = await call(adapter, 'post', '/accounts/requests', {
        panNo: 'ABCDE1234F',
      });

      await asCustomer(adapter, 'admin');
      const approved = await call(
        adapter,
        'put',
        `/admin/accounts/requests/${request.requestId}`,
        { decision: 'APPROVED' },
      );
      expect(approved.status).toBe(200);

      // Back as the customer: the account exists, and the loan flow is unblocked.
      await asCustomer(adapter, 'newcomer@lms-oc.test');
      const { data: status } = await call(adapter, 'get', '/account/status');
      expect(status.hasBankAccount).toBe(true);

      const { status: applyStatus } = await call(adapter, 'post', '/loans/apply', {
        accountNumber: status.accountNumber,
        loanType: 'HOME',
        principalAmount: 500000,
      });
      expect(applyStatus).toBe(201);
    });

    it('frees the customer to apply again after a rejection', async () => {
      await registerAndSignIn('newcomer@lms-oc.test');
      const { data: request } = await call(adapter, 'post', '/accounts/requests', {
        panNo: 'ABCDE1234F',
      });

      await asCustomer(adapter, 'admin');
      await call(adapter, 'put', `/admin/accounts/requests/${request.requestId}`, {
        decision: 'REJECTED',
        reviewNotes: 'PAN illegible',
      });

      await asCustomer(adapter, 'newcomer@lms-oc.test');
      const { data: status } = await call(adapter, 'get', '/account/status');

      // The rejection is reported, with the officer's reason, so the page can say
      // why rather than just that it failed. Reporting nothing would leave the
      // customer looking exactly as though they had never applied.
      expect(status.hasBankAccount).toBe(false);
      expect(status.accountOpeningRequest.status).toBe('REJECTED');
      expect(status.accountOpeningRequest.reviewNotes).toBe('PAN illegible');
      expect(status.accountOpeningRequest.reviewedAt).toEqual(expect.any(String));
      expect(status.accountOpeningRequest.maskedPanNo).toBe('XXXXX1234X');
      expect(status.accountOpeningRequest.panNo).toBeUndefined();

      // Which is the point: the customer may submit again.
      const { status: retry } = await call(adapter, 'post', '/accounts/requests', {
        panNo: 'ABCDE5678G',
      });
      expect(retry).toBe(201);
    });

    it('reports the resubmission, not the rejection it followed', async () => {
      await registerAndSignIn('newcomer@lms-oc.test');
      const { data: request } = await call(adapter, 'post', '/accounts/requests', {
        panNo: 'ABCDE1234F',
      });

      await asCustomer(adapter, 'admin');
      await call(adapter, 'put', `/admin/accounts/requests/${request.requestId}`, {
        decision: 'REJECTED',
        reviewNotes: 'PAN illegible',
      });

      await asCustomer(adapter, 'newcomer@lms-oc.test');
      await call(adapter, 'post', '/accounts/requests', { panNo: 'ABCDE5678G' });

      const { data: status } = await call(adapter, 'get', '/account/status');

      // Telling the customer they were rejected while an officer sits on their
      // new request is the failure mode of reporting the wrong row of the two.
      expect(status.accountOpeningRequest.status).toBe('PENDING');
      expect(status.accountOpeningRequest.maskedPanNo).toBe('XXXXX5678X');
      expect(status.accountOpeningRequest.reviewNotes).toBeUndefined();
    });

    it('keeps the rejected request in the history when the customer applies again', async () => {
      await registerAndSignIn('newcomer@lms-oc.test');
      const { data: request } = await call(adapter, 'post', '/accounts/requests', {
        panNo: 'ABCDE1234F',
      });

      await asCustomer(adapter, 'admin');
      await call(adapter, 'put', `/admin/accounts/requests/${request.requestId}`, {
        decision: 'REJECTED',
        reviewNotes: 'PAN illegible',
      });

      await asCustomer(adapter, 'newcomer@lms-oc.test');
      const { data: retry } = await call(adapter, 'post', '/accounts/requests', {
        panNo: 'ABCDE5678G',
      });

      // A new row, not the rejected one rewritten. Reporting the latest request
      // to the customer must not cost the officer the record of what went wrong -
      // the reason is the only thing that makes the second attempt different from
      // the first. So the id has to differ, and the decided one has to be
      // undecidable now rather than have vanished: the review endpoint refuses a
      // second decision by looking the row up, and returns 400 not 404.
      expect(retry.requestId).not.toBe(request.requestId);
      await asCustomer(adapter, 'admin');
      const { status: redecide } = await call(
        adapter,
        'put',
        `/admin/accounts/requests/${request.requestId}`,
        { decision: 'APPROVED' },
      );
      expect(redecide).toBe(400);
    });

    it('refuses to decide the same request twice', async () => {
      await registerAndSignIn('newcomer@lms-oc.test');
      const { data: request } = await call(adapter, 'post', '/accounts/requests', {
        panNo: 'ABCDE1234F',
      });

      await asCustomer(adapter, 'admin');
      const path = `/admin/accounts/requests/${request.requestId}`;
      await call(adapter, 'put', path, { decision: 'APPROVED' });

      expect((await call(adapter, 'put', path, { decision: 'REJECTED' })).status).toBe(400);
    });

    it('shows the new account number on the identity after approval', async () => {
      await registerAndSignIn('newcomer@lms-oc.test');
      const { data: request } = await call(adapter, 'post', '/accounts/requests', {
        panNo: 'ABCDE1234F',
      });

      await asCustomer(adapter, 'admin');
      await call(adapter, 'put', `/admin/accounts/requests/${request.requestId}`, {
        decision: 'APPROVED',
      });

      // The real /auth/me rebuilds the identity from the login row on every
      // request. A demo that echoed a snapshot taken at sign-in would keep saying
      // "no customer account linked" until the user signed out and back in.
      await asCustomer(adapter, 'newcomer@lms-oc.test');
      const { data: me } = await call(adapter, 'get', '/auth/me');

      expect(me.accountNumber).toEqual(expect.any(Number));
      // And the customer record is now readable, where before approval it was not.
      expect((await call(adapter, 'get', `/customers/${me.accountNumber}`)).status).toBe(200);
    });
  });

  describe('loan documents', () => {
    /** Drives the adapter the way axios would, and unwraps the response. */
    function callRaw(adapter, method, url, data) {
      return adapter({ method, url, baseURL: '/api', data, headers: {} }).then(
        (response) => ({ status: response.status, data: response.data, headers: response.headers }),
        (error) => ({ status: error.response.status, data: error.response.data, error }),
      );
    }

    /** Builds the multipart body the upload endpoint actually receives. */
    function multipart({ name = 'salary-slip.pdf', body = 'PAYSLIP', type = 'application/pdf', documentType = 'Salary slip' } = {}) {
      const form = new FormData();
      form.append('file', new File([body], name, { type }));
      if (documentType !== null) {
        form.append('documentType', documentType);
      }
      return form;
    }

    /** Signs in, applies for a loan, and returns that loan. */
    async function applyForLoan(adapter, username = 'demo.user000@lms-oc.test') {
      await asCustomer(adapter, username);
      const { data: me } = await call(adapter, 'get', '/auth/me');
      const { data: loan } = await call(adapter, 'post', '/loans/apply', {
        accountNumber: me.accountNumber,
        loanType: 'HOME',
        principalAmount: 500000,
      });
      return loan;
    }

    it('records an uploaded document against the loan it was sent with', async () => {
      const loan = await applyForLoan(adapter);

      const { status, data } = await callRaw(
        adapter,
        'post',
        `/loans/${loan.loanId}/documents`,
        multipart(),
      );

      expect(status).toBe(201);
      expect(data.loanId).toBe(loan.loanId);
      expect(data.documentType).toBe('Salary slip');
      expect(data.documentName).toBe('salary-slip.pdf');
      expect(data.sizeBytes).toBe(7);
      // PENDING, because nothing has looked at it - the same state a real
      // upload lands in, and the one the panel has to render.
      expect(data.status).toBe('PENDING');
      // No rejection reason until something rejects it, and the server omits
      // nulls rather than sending the key empty.
      expect('rejectionReason' in data).toBe(false);
      // No storage key on the way out, matching the DTO.
      expect('storageKey' in data).toBe(false);
    });

    it('lists a loan\'s documents, oldest first', async () => {
      const loan = await applyForLoan(adapter);
      await callRaw(adapter, 'post', `/loans/${loan.loanId}/documents`, multipart({ documentType: 'Bank statement' }));
      await callRaw(adapter, 'post', `/loans/${loan.loanId}/documents`, multipart({ documentType: 'Identity proof' }));

      const { status, data } = await call(adapter, 'get', `/loans/${loan.loanId}/documents`);

      expect(status).toBe(200);
      expect(data).toHaveLength(2);
      expect(data.map((d) => d.documentType)).toEqual(['Bank statement', 'Identity proof']);
    });

    it('keeps one loan\'s documents out of another\'s list', async () => {
      const first = await applyForLoan(adapter);
      await callRaw(adapter, 'post', `/loans/${first.loanId}/documents`, multipart());

      // A second loan for the same customer, which is exactly the case a
      // document key that ignored the loan would get wrong. The account number
      // comes from the session rather than a literal, because the fixtures
      // randomise it and a hardcoded one would drift.
      const { data: me } = await call(adapter, 'get', '/auth/me');
      const { data: second } = await call(adapter, 'post', '/loans/apply', {
        accountNumber: me.accountNumber,
        loanType: 'PERSONAL',
        principalAmount: 25000,
      });

      const firstList = await call(adapter, 'get', `/loans/${first.loanId}/documents`);
      const secondList = await call(adapter, 'get', `/loans/${second.loanId}/documents`);

      expect(first.loanId).not.toBe(second.loanId);
      expect(firstList.data).toHaveLength(1);
      expect(secondList.data).toHaveLength(0);
    });

    it('returns the uploaded bytes from the download endpoint', async () => {
      const loan = await applyForLoan(adapter);
      const { data: document } = await callRaw(
        adapter,
        'post',
        `/loans/${loan.loanId}/documents`,
        multipart({ body: 'REALPDF' }),
      );

      const { status, data, headers } = await callRaw(
        adapter,
        'get',
        `/documents/${document.documentId}/download`,
      );

      expect(status).toBe(200);
      // The bytes that went in, not a placeholder. A demo that stored only
      // metadata would show a perfect upload flow and a download that produces
      // nothing, which is worse than not offering the button at all.
      expect(await data.text()).toBe('REALPDF');
      expect(data.type).toBe('application/pdf');
      // Served as a download, matching the server: an untrusted file must not be
      // rendered in the page's own origin.
      expect(headers['content-disposition']).toContain('attachment');
      expect(headers['content-disposition']).toContain('salary-slip.pdf');
    });

    it('refuses an upload with no file, no description, or an oversized file', async () => {
      const loan = await applyForLoan(adapter);
      const url = `/loans/${loan.loanId}/documents`;

      expect((await callRaw(adapter, 'post', url, multipart({ body: '' }))).status).toBe(400);
      expect((await callRaw(adapter, 'post', url, multipart({ documentType: '  ' }))).status).toBe(400);
      expect(
        (await callRaw(adapter, 'post', url, multipart({ documentType: 'x'.repeat(41) }))).status,
      ).toBe(400);
      // Just over 10 MB. The limit is checked, not assumed: a demo that let an
      // oversized file through would fail on stage and only against the real
      // backend.
      expect(
        (await callRaw(adapter, 'post', url, multipart({ body: 'x'.repeat(10 * 1024 * 1024 + 1) })))
          .status,
      ).toBe(400);

      // And none of those attempts left anything behind.
      expect((await call(adapter, 'get', url)).data).toHaveLength(0);
    });

    it('answers 401 before sign-in and 404 for a loan the caller cannot see', async () => {
      const loan = await applyForLoan(adapter, 'demo.user000@lms-oc.test');
      await callRaw(adapter, 'post', `/loans/${loan.loanId}/documents`, multipart());

      // Another customer must not be able to read or attach to this application.
      await asCustomer(adapter, 'demo.user001@lms-oc.test');
      expect((await call(adapter, 'get', `/loans/${loan.loanId}/documents`)).status).toBe(404);
      expect((await callRaw(adapter, 'post', `/loans/${loan.loanId}/documents`, multipart())).status)
        .toBe(404);

      window.sessionStorage.clear();
      adapter = createDemoAdapter({ customerCount: 10 });
      expect((await call(adapter, 'get', `/loans/${loan.loanId}/documents`)).status).toBe(401);
      expect((await callRaw(adapter, 'post', `/loans/${loan.loanId}/documents`, multipart())).status)
        .toBe(401);
    });

    it('lets an officer reach a customer\'s documents, as the real admin rule does', async () => {
      const loan = await applyForLoan(adapter);
      const { data: document } = await callRaw(
        adapter,
        'post',
        `/loans/${loan.loanId}/documents`,
        multipart(),
      );

      await asCustomer(adapter, 'admin');

      expect((await call(adapter, 'get', `/loans/${loan.loanId}/documents`)).data).toHaveLength(1);
      expect((await call(adapter, 'get', `/documents/${document.documentId}/download`)).status)
        .toBe(200);
    });
  });

  describe('admin account-opening review', () => {
    // The queue is seeded so the officer's screen has something in it on arrival.
    // A blank queue is indistinguishable from a broken one, and the state worth
    // demonstrating - a decision actually opening an account - would otherwise be
    // unreachable without registering a customer first.
    const queue = async () => {
      await asCustomer(adapter, 'admin');
      return call(adapter, 'get', '/admin/accounts/requests');
    };

    it('lists requests with the PAN and profile an officer needs', async () => {
      const { status, data } = await queue();

      expect(status).toBe(200);
      expect(data.length).toBeGreaterThan(0);
      const request = data[0];
      // Unmasked, as AdminResponse is the one projection that carries a PAN.
      expect(request.panNo).toMatch(/^[A-Z]{5}[0-9]{4}[A-Z]$/);
      expect(request.fullName).toEqual(expect.any(String));
      expect(request.email).toEqual(expect.any(String));
      expect(request.phoneNo).toMatch(/^\d{10}$/);
      expect(request.dob).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(request.branchCode).toEqual(expect.any(Number));
      // Never the storage-side shape.
      expect('userId' in request).toBe(false);
      expect('maskedPanNo' in request).toBe(false);
    });

    it('filters the queue by status', async () => {
      await asCustomer(adapter, 'admin');

      const all = (await call(adapter, 'get', '/admin/accounts/requests')).data;
      const pending = (await call(adapter, 'get', '/admin/accounts/requests?status=PENDING'))
        .data;
      const rejected = (
        await call(adapter, 'get', '/admin/accounts/requests?status=REJECTED')
      ).data;

      expect(pending.every((r) => r.status === 'PENDING')).toBe(true);
      expect(rejected.every((r) => r.status === 'REJECTED')).toBe(true);
      // The filter narrows rather than replacing the list.
      expect(pending.length).toBeLessThan(all.length);
      expect(pending.length + rejected.length).toBeLessThan(all.length);
    });

    it('refuses a status the backend does not have', async () => {
      await asCustomer(adapter, 'admin');

      const { status } = await call(
        adapter,
        'get',
        '/admin/accounts/requests?status=SOMETHING',
      );

      expect(status).toBe(400);
    });

    it('serves one request in full', async () => {
      const { data: list } = await queue();
      const wanted = list.find((r) => r.status === 'PENDING');

      const { status, data } = await call(
        adapter,
        'get',
        `/admin/accounts/requests/${wanted.requestId}`,
      );

      expect(status).toBe(200);
      expect(data.requestId).toBe(wanted.requestId);
      expect(data.panNo).toEqual(expect.any(String));
    });

    it('approves a pending request and returns the account it opened', async () => {
      const { data: list } = await queue();
      const pending = list.find((r) => r.status === 'PENDING');

      const { status, data } = await call(
        adapter,
        'put',
        `/admin/accounts/requests/${pending.requestId}`,
        { decision: 'APPROVED', reviewNotes: 'Documents checked.' },
      );

      expect(status).toBe(200);
      expect(data.status).toBe('APPROVED');
      // The full AdminResponse, not a status stub: the review screen reads the
      // resulting account number straight out of this response.
      expect(data.panNo).toEqual(expect.any(String));
      expect(data.resultingAccountNumber).toEqual(expect.any(Number));
      expect(data.reviewedAt).toEqual(expect.any(String));
      // And it leaves the queue as decided.
      const after = (
        await call(adapter, 'get', `/admin/accounts/requests/${pending.requestId}`)
      ).data;
      expect(after.status).toBe('APPROVED');
    });

    it('rejects with the applicant\'s reason recorded', async () => {
      const { data: list } = await queue();
      const pending = list.find((r) => r.status === 'PENDING');

      const { data } = await call(
        adapter,
        'put',
        `/admin/accounts/requests/${pending.requestId}`,
        { decision: 'REJECTED', reviewNotes: 'PAN not on record.' },
      );

      expect(data.status).toBe('REJECTED');
      expect(data.reviewNotes).toBe('PAN not on record.');
      // A rejection opens no account.
      expect('resultingAccountNumber' in data).toBe(false);
    });

    it('refuses to decide a request twice, as the service does', async () => {
      const { data: list } = await queue();
      const decided = list.find((r) => r.status !== 'PENDING');
      const path = `/admin/accounts/requests/${decided.requestId}`;

      const { status, data } = await call(adapter, 'put', path, { decision: 'APPROVED' });

      // PENDING-only, and the reason names the existing state so the officer can
      // see which request was already dealt with.
      expect(status).toBe(400);
      expect(data.message).toMatch(new RegExp(decided.status.toLowerCase()));
    });

    it('refuses a decision it does not recognise, and over-long notes', async () => {
      const { data: list } = await queue();
      const pending = list.find((r) => r.status === 'PENDING');
      const path = `/admin/accounts/requests/${pending.requestId}`;

      const bad = await call(adapter, 'put', path, { decision: 'MAYBE' });
      expect(bad.status).toBe(400);
      expect(bad.data.fieldErrors.decision).toEqual(expect.any(String));

      const long = await call(adapter, 'put', path, {
        decision: 'APPROVED',
        reviewNotes: 'x'.repeat(501),
      });
      expect(long.status).toBe(400);
      expect(long.data.fieldErrors.reviewNotes).toEqual(expect.any(String));

      // Neither attempt consumed the request, so it is still decidable.
      const good = await call(adapter, 'put', path, { decision: 'APPROVED' });
      expect(good.status).toBe(200);
    });

    it('answers 404 for a request that does not exist', async () => {
      await asCustomer(adapter, 'admin');

      expect((await call(adapter, 'get', '/admin/accounts/requests/9999')).status).toBe(404);
    });

    it('keeps the queue out of a customer\'s reach, and requires a session', async () => {
      await asCustomer(adapter, 'demo.user000@lms-oc.test');

      expect((await call(adapter, 'get', '/admin/accounts/requests')).status).toBe(403);
      expect((await call(adapter, 'get', '/admin/accounts/requests/1')).status).toBe(403);

      window.sessionStorage.clear();
      adapter = createDemoAdapter({ customerCount: 10 });
      expect((await call(adapter, 'get', '/admin/accounts/requests')).status).toBe(401);
    });

    it('lets an approved applicant use the account that was opened for them', async () => {
      const { data: list } = await queue();
      const pending = list.find((r) => r.status === 'PENDING');
      const { data: decided } = await call(
        adapter,
        'put',
        `/admin/accounts/requests/${pending.requestId}`,
        { decision: 'APPROVED' },
      );

      // The point of approving: the applicant can now hold an account. Signed in
      // with the request's own email, which doubles as the sign-in username -
      // the same field the real system authenticates on.
      await asCustomer(adapter, pending.email);
      const { status, data: me } = await call(adapter, 'get', '/auth/me');

      expect(status).toBe(200);
      expect(me.accountNumber).toBe(decided.resultingAccountNumber);
    });
  });
});
