import { http } from '../lib/httpClient.js';

/**
 * Session lifecycle.
 *
 * There is no token to store: the credential is an httpOnly cookie the browser
 * attaches on its own, so this module only ever deals with the resulting
 * identity.
 */

/** Fetches the CSRF cookie so the next mutating request can be accepted. */
export async function primeCsrf() {
  await http.get('/auth/csrf');
}

export async function login({ username, password }) {
  await primeCsrf();
  const { data } = await http.post('/auth/login', { username, password });
  return data;
}

export async function fetchCurrentUser() {
  const { data } = await http.get('/auth/me');
  return data;
}

export async function logout() {
  await http.post('/auth/logout');
}
