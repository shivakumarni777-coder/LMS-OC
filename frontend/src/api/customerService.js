import { http } from '../lib/httpClient.js';

/** Customer API. Shapes mirror the backend DTOs exactly. */

export async function registerCustomer({ password, customer }) {
  const { data } = await http.post('/customers/register', { password, customer });
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
