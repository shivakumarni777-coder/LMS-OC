/**
 * Persistence for the demo session, so a page reload does not sign the user out.
 *
 * WHY THIS EXISTS
 * ---------------
 * The real application authenticates with a session cookie. That cookie is sent
 * by the server on every subsequent request, so refreshing the page or opening
 * a deep link keeps you signed in. The demo adapter, before this existed, held
 * the signed-in identity in a closure variable, which dies with the JavaScript
 * context: any full page load bounced straight back to the login screen.
 *
 * That matters for two reasons. It is the single most likely thing to go wrong
 * in front of an audience, because someone always presses F5. And it made the
 * demo quietly contradict the thing it is meant to demonstrate - the presenter
 * claims the session survives a refresh, and in demo mode it did not.
 *
 * WHY sessionStorage AND NOT localStorage
 * --------------------------------------
 * A server session cookie with no expiry is discarded when the browser closes.
 * `sessionStorage` has exactly that lifetime, so switching browser tabs or
 * reloading preserves the session while quitting the browser ends it.
 * `localStorage` would outlive the tab and keep a stale identity around, which
 * is not what the real cookie does.
 *
 * Storage can be unavailable or throw: Safari private browsing, a blocked
 * third-party context, or a browser with site data disabled. The demo must not
 * white-screen in that case, so every access is guarded and the store degrades
 * to holding the identity in memory for the life of the page, which is the
 * behaviour it had before.
 */

const STORAGE_KEY = 'lms-oc.demo.principal';

/** Reads the persisted identity, or null if there is none to read. */
function load() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // A stored value that is not a usable identity is treated as no session
    // rather than trusted, so a hand-edited or truncated entry cannot produce a
    // half-signed-in app that then 401s on the first request.
    return parsed && typeof parsed === 'object' && typeof parsed.role === 'string'
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** Persists the identity. A failure here is not worth interrupting the demo. */
function save(principal) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(principal));
  } catch {
    // Storage full or unavailable: the in-memory session still works for this
    // page view, so the demo continues without it.
  }
}

/** Forgets the identity, on sign-out and on tab close. */
function clear() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do - if it cannot be cleared it was never written.
  }
}

/**
 * A store shaped like the real cookie jar, so the adapter's session handling
 * reads the same either way.
 */
export function createSessionStore() {
  return { load, save, clear };
}

/** A store that keeps the identity in memory only. Used as the test default. */
export function createMemoryStore() {
  let held = null;
  return {
    load: () => held,
    save: (value) => {
      held = value;
    },
    clear: () => {
      held = null;
    },
  };
}
