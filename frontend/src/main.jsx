import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthProvider.jsx';
import { ApiError } from './lib/httpClient.js';
import './index.css';

/**
 * Query defaults tuned for a portal backed by a server-side session.
 *
 * `refetchOnWindowFocus` is off deliberately: the server is the authority on
 * what the session can see, and a refocus storm would re-request data the
 * backend has not changed. Mutations invalidate explicitly instead.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Never retry a rejected credential or a missing resource; only
        // transient server trouble is worth a second attempt.
        if (error instanceof ApiError) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
