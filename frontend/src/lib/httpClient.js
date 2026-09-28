import axios from 'axios';
import { createDemoAdapter } from '../demo/adapter.js';

// Standalone demo mode: swaps only the transport, so the interceptors below are
// unchanged and still run. The flag is substituted at build time, so in a normal
// production build this branch is statically dead and the fixture module is
// tree-shaken out - `npm run build` can be grepped to confirm no demo data ships.
if (import.meta.env.VITE_DEMO_MODE === 'true') {
  axios.defaults.adapter = createDemoAdapter({ customerCount: 100 });
}

/**
 * The single HTTP client for the app.
 *
 * Two things it handles that are easy to get wrong by hand:
 *
 *  1. **CSRF.** The session rides on a cookie, so every mutating request must
 *     echo the `XSRF-TOKEN` cookie in the `X-XSRF-TOKEN` header. Reading the
 *     cookie per request (rather than once at startup) matters because Spring
 *     Security rotates the token.
 *
 *  2. **Error shape.** The backend always answers failures with the same
 *     envelope, so it is unwrapped once here into a typed `ApiError` and every
 *     caller can rely on `error.fieldErrors` and `error.status`.
 */

/** Thrown for any non-2xx response, already normalised. */
export class ApiError extends Error {
  constructor({ status, message, fieldErrors, path }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors ?? {};
    this.path = path;
  }

  get isUnauthorised() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isValidation() {
    return this.status === 400 || this.status === 409;
  }
}

/** Raised when the request never reached the server. */
export class NetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NetworkError';
    this.status = 0;
    this.fieldErrors = {};
  }
}

export const http = axios.create({
  baseURL: '/api',
  // The session cookie must ride along on every call.
  withCredentials: true,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
});

const SAFE_METHODS = new Set(['get', 'head', 'options']);

function readCookie(name) {
  const match = document.cookie.match(
    new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

http.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toLowerCase();
  if (SAFE_METHODS.has(method)) {
    return config;
  }
  const token = readCookie('XSRF-TOKEN');
  if (token) {
    config.headers.set('X-XSRF-TOKEN', token);
  }
  return config;
});

/** Subscribers notified when the server says the session is gone. */
const sessionListeners = new Set();

/** Registers a callback for 401s. Returns an unsubscribe function. */
export function onSessionExpired(listener) {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
      return Promise.reject(error);
    }

    if (!error.response) {
      return Promise.reject(new NetworkError(
        'Cannot reach the server. Check that the backend is running.',
      ));
    }

    const { status, data } = error.response;
    const apiError = new ApiError({
      status,
      message: data?.message ?? error.message ?? 'Request failed',
      fieldErrors: data?.fieldErrors,
      path: data?.path,
    });

    // A 401 on anything other than the login probe means the session lapsed
    // while the app was open, so the UI needs to drop back to signed out.
    if (status === 401 && !String(error.config?.url ?? '').includes('/auth/')) {
      sessionListeners.forEach((listener) => listener(apiError));
    }

    return Promise.reject(apiError);
  },
);
