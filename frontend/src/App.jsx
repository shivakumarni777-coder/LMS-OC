import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireRole } from './auth/routeGuards.jsx';
import AppShell from './components/layout/AppShell.jsx';
import ErrorBoundary from './components/layout/ErrorBoundary.jsx';
import Spinner from './components/ui/FullPageSpinner.jsx';

/*
 * Route-level code splitting.
 *
 * Every page is a dynamic import, so the initial bundle is only React, the
 * router and the query client. A customer signing in never downloads the admin
 * approval queue, and the login page costs almost nothing on first paint.
 */
const LoginPage = lazy(() => import('./features/auth/LoginPage.jsx'));
const RegisterPage = lazy(() => import('./features/customers/RegisterPage.jsx'));
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage.jsx'));
const LoansPage = lazy(() => import('./features/loans/LoansPage.jsx'));
const ApplyLoanPage = lazy(() => import('./features/loans/ApplyLoanPage.jsx'));
const CustomerLookupPage = lazy(() => import('./features/customers/CustomerLookupPage.jsx'));
const MyAccountPage = lazy(() => import('./features/customers/MyAccountPage.jsx'));
const NotFoundPage = lazy(() => import('./features/NotFoundPage.jsx'));

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Spinner className="mx-auto mt-32 size-8" label="Loading" />}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Authenticated */}
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />

              <Route path="loans" element={<LoansPage />} />
              <Route path="loans/apply" element={<ApplyLoanPage />} />
              <Route path="me" element={<MyAccountPage />} />

              {/* Admin only. Nested, so a non-admin never renders the page. */}
              <Route element={<RequireRole role="ADMIN" />}>
                <Route path="loans/pending" element={<LoansPage pendingOnly />} />
                <Route path="customers/register" element={<RegisterPage />} />
                <Route path="customers" element={<CustomerLookupPage />} />
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
