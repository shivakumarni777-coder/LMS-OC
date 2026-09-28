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

    it('reports per-field validation errors on registration', async () => {
      const { status, data } = await call(adapter, 'post', '/customers/register', {
        customer: { fullName: '', email: '', panNo: 'bad', phoneNo: '123' },
      });

      expect(status).toBe(400);
      expect(Object.keys(data.fieldErrors)).toEqual(
        expect.arrayContaining(['fullName', 'panNo', 'phoneNo', 'email', 'branchCode']),
      );
    });

    it('accepts a well-formed registration', async () => {
      const { status, data } = await call(adapter, 'post', '/customers/register', {
        customer: {
          accountNumber: 309999999999,
          fullName: 'Seminar Attendee',
          email: 'speaker@lms-oc.test',
          phoneNo: '9876543210',
          panNo: 'ABCDE1234F',
          branchCode: 101,
          dob: '1990-01-01',
        },
      });

      expect(status).toBe(201);
      expect(data.username).toBe('speaker@lms-oc.test');
    });
  });
});
