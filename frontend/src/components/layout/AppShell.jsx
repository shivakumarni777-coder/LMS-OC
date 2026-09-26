import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider.jsx';
import Button from '../ui/Button.jsx';
import Badge from '../ui/Badge.jsx';
import Spinner from '../ui/FullPageSpinner.jsx';

/**
 * Chrome around every authenticated page.
 *
 * Navigation is derived from the role rather than filtered per-link with
 * `&&` conditionals, so a customer and an admin get genuinely different
 * structures rather than the same list with holes in it.
 */
export default function AppShell() {
  const { user, isAdmin, signOut } = useAuth();

  const links = isAdmin
    ? [
        { to: '/', label: 'Dashboard', end: true },
        { to: '/loans', label: 'All loans' },
        { to: '/loans/pending', label: 'Approvals' },
        { to: '/customers/register', label: 'Register customer' },
        { to: '/customers', label: 'Lookup' },
      ]
    : [
        { to: '/', label: 'Dashboard', end: true },
        { to: '/loans', label: 'My loans' },
        { to: '/loans/apply', label: 'Apply for a loan' },
        { to: '/me', label: 'My account' },
      ];

  return (
    <div className="min-h-dvh">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-lg bg-brand-700 font-bold text-white"
            >
              L
            </span>
            <span className="text-base font-semibold tracking-tight text-slate-900">
              Loan Management
            </span>
          </NavLink>

          <nav aria-label="Main" className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
            <ul className="flex flex-wrap items-center gap-1">
              {links.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    end={link.end}
                    className={({ isActive }) =>
                      [
                        'inline-block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-brand-50 text-brand-800'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                      ].join(' ')
                    }
                  >
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-3 sm:ml-0">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900">{user?.fullName ?? user?.username}</p>
              <p className="text-xs text-slate-500">{user?.username}</p>
            </div>
            <Badge tone={isAdmin ? 'info' : 'neutral'}>{isAdmin ? 'Administrator' : 'Customer'}</Badge>
            <Button variant="secondary" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Each page owns its own boundary, so one failure does not blank the shell. */}
        <Suspense fallback={<Spinner label="Loading page" />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
