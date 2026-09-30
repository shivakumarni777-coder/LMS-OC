import { http } from '../lib/httpClient.js';

/**
 * Account-opening API. Shapes mirror the backend DTOs exactly.
 *
 * PAN lives here rather than in the registration call because a bank account is
 * a separate thing from a profile: it is opened only after an officer approves a
 * request, and a loan can only be booked against an account. Registering asks
 * who you are; this asks for the one identifier the bank has not got.
 *
 * The customer-facing endpoints are all scoped to the caller by the backend, so
 * there is no account number in any path and nothing to get wrong.
 */

/**
 * Whether the signed-in customer has a bank account, and where their
 * account-opening request stands.
 *
 * @returns {Promise<{hasBankAccount: boolean, accountNumber?: number,
 *   accountOpeningRequest?: object}>}
 *
 * Both optional properties are absent rather than null when they do not apply,
 * because the backend is configured to omit null fields. `accountNumber` is
 * therefore checked for truthiness, never compared against null.
 */
export async function getAccountStatus() {
  const { data } = await http.get('/account/status');
  return data;
}

/**
 * Files a request to open a bank account. PAN only.
 *
 * @param {string} panNo - upper-cased, matching the backend's `[A-Z]{5}[0-9]{4}[A-Z]`
 * @returns {Promise<object>} the stored request, with the PAN masked
 */
export async function requestAccountOpening(panNo) {
  const { data } = await http.post('/accounts/requests', { panNo });
  return data;
}

// ------------------------------------------------------------------ admin
//
// The officer's side of the same workflow. Under `/api/admin/`, which the
// security filter chain restricts to administrators - so these need no
// authorisation check of their own, and a customer calling one is stopped
// before it reaches this code.

/** The statuses a request can be filtered by. Mirrors the backend enum. */
export const ACCOUNT_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

/**
 * The review queue.
 *
 * @param {string} [status] - omit for the whole list. Passed as a query
 *   parameter rather than filtered here, so the queue is the server's ordering
 *   and a filtered page cannot quietly show rows from another status.
 * @returns {Promise<object[]>} `AdminResponse` items, carrying the full PAN.
 */
export async function listAccountRequests(status) {
  const { data } = await http.get('/admin/accounts/requests', {
    params: status ? { status } : undefined,
  });
  return data;
}

/**
 * One request in full, for the review screen.
 *
 * @returns {Promise<object>} `AdminResponse`, with an unmasked PAN and date of
 *   birth - the one projection in the system that carries them, because
 *   verifying an application is the task that needs them.
 */
export async function getAccountRequest(requestId) {
  const { data } = await http.get(`/admin/accounts/requests/${requestId}`);
  return data;
}

/**
 * Records an officer's decision.
 *
 * @param {number} requestId
 * @param {{decision: 'APPROVED'|'REJECTED', reviewNotes?: string}} decision
 *   Notes are required in spirit for a rejection and capped at 500 characters
 *   by the backend; the reason is what the customer is shown.
 * @returns {Promise<object>} the updated `AdminResponse`, which also tells the
 *   caller the resulting account number after an approval.
 */
export async function reviewAccountRequest(requestId, { decision, reviewNotes }) {
  const { data } = await http.put(`/admin/accounts/requests/${requestId}`, {
    decision,
    reviewNotes,
  });
  return data;
}
