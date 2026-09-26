import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchCurrentUser, login as loginRequest, logout as logoutRequest } from '../api/authService.js';
import { onSessionExpired } from '../lib/httpClient.js';

const AuthContext = createContext(null);

export const AUTH_QUERY_KEY = ['auth', 'me'];

/**
 * Holds the signed-in identity.
 *
 * The session itself lives in an httpOnly cookie, so there is nothing secret
 * to persist here and nothing to clear on logout beyond the server-side
 * session. The identity is refetched on mount, which is what makes a page
 * refresh survive without any client-side session storage.
 */
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authenticated | anonymous

  const applyIdentity = useCallback((identity) => {
    setUser(identity);
    setStatus(identity ? 'authenticated' : 'anonymous');
  }, []);

  // Re-establish the session on first load.
  useEffect(() => {
    let cancelled = false;

    fetchCurrentUser()
      .then((identity) => {
        if (!cancelled) applyIdentity(identity);
      })
      .catch(() => {
        if (!cancelled) applyIdentity(null);
      });

    return () => {
      cancelled = true;
    };
  }, [applyIdentity]);

  // A 401 mid-session means the cookie expired or was revoked server-side.
  useEffect(
    () =>
      onSessionExpired(() => {
        applyIdentity(null);
        // Drop every cached response; it belonged to the previous session.
        queryClient.clear();
      }),
    [applyIdentity, queryClient],
  );

  const signIn = useCallback(
    async (credentials) => {
      const identity = await loginRequest(credentials);
      applyIdentity(identity);
      return identity;
    },
    [applyIdentity],
  );

  const signOut = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      applyIdentity(null);
      queryClient.clear();
    }
  }, [applyIdentity, queryClient]);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      isAdmin: user?.role === 'ADMIN',
      signIn,
      signOut,
    }),
    [user, status, signIn, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}
