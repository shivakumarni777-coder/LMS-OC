import { http } from '../lib/httpClient.js';

/** Customer API. Shapes mirror the backend DTOs exactly. */

export async function listBranches() {
  const { data } = await http.get('/branches');
  return data;
}

/**
 * Creates a customer's login and profile.
 *
 * Nested under `profile` because the backend's DTO is, and because the email
 * doubles as the username: the profile is the person, the password is the
 * credential, and nothing here opens a bank account. That is a separate request
 * against a separate service - see `accountService.js`.
 *
 * @param {{password: string, profile: {fullName: string, dob: string,
 *   phoneNo: string, email: string, branchCode: number}}} registration
 * @returns {Promise<{username: string, fullName: string, email: string}>}
 */
export async function registerCustomer({ password, profile }) {
  const { data } = await http.post('/customers/register', { password, profile });
  return data;
}

export async function getCustomerByAccount(accountNumber) {
  const { data } = await http.get(`/customers/${accountNumber}`);
  return data;
}

export async function getCustomerLoans(accountNumber) {
  const { data } = await http.get(`/customers/${accountNumber}/loans`);
  return data;
}
