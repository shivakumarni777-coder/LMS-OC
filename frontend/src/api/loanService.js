import { http } from '../lib/httpClient.js';

/** Loan API. Shapes mirror the backend DTOs exactly. */

export async function applyForLoan({ accountNumber, loanType, principalAmount }) {
  const { data } = await http.post('/loans/apply', { accountNumber, loanType, principalAmount });
  return data;
}

export async function approveLoan(loanId, { tenureMonths }) {
  const { data } = await http.put(`/loans/${loanId}/approve`, { tenureMonths });
  return data;
}

/** Scoped server-side: every loan for an admin, only their own otherwise. */
export async function listLoans() {
  const { data } = await http.get('/loans');
  return data;
}

export async function getLoan(loanId) {
  const { data } = await http.get(`/loans/${loanId}`);
  return data;
}

export async function fetchLoanSummary() {
  const { data } = await http.get('/loans/summary');
  return data;
}
