import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider.jsx';
import FullPageSpinner from '../components/ui/FullPageSpinner.jsx';

/**
 * Gate for authenticated routes.
 *
 * While the session is still being re-established on a page refresh it renders
 * a spinner rather than redirecting, otherwise a hard refresh would bounce an
 * authenticated user to the login screen for a frame.
 */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <FullPageSpinner label="Restoring your session" />;
  }

  if (status === 'anonymous') {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

/** Gate for admin-only routes. Renders nothing for non-admins. */
export function RequireRole({ role }) {
  const { user, status } = useAuth();

  if (status === 'loading') {
    return <FullPageSpinner label="Checking your permissions" />;
  }
  if (user?.role !== role) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
