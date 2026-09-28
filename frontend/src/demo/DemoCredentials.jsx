import { useMemo } from 'react';
import { buildDataset, DEMO_PASSWORD } from './fixtures.js';

/**
 * Login credentials, shown on the login page when the app runs in demo mode.
 *
 * WHY THIS EXISTS
 * ---------------
 * The credentials used to exist only inside the mock layer, so anyone
 * presenting the site had to read them out of the source or type them from
 * memory. On a projector, in front of a room, that is a bad way to lose the
 * first minute of a talk - and an audience that cannot log in cannot see any
 * of the work.
 *
 * Every row is a real button that fills the form. Nothing needs to be typed,
 * spelled, or remembered, and the presenter can switch between an admin and a
 * customer account to show both sides of the authorisation model.
 *
 * This module is imported behind an `isDemoMode` check, so it is unreachable -
 * and tree-shaken - in any build that is not explicitly a demo build.
 */

/**
 * Accounts offered for one-click sign-in.
 *
 * Built inside the component rather than at module scope, and that placement is
 * load-bearing. `buildDataset()` is a side effect: run at module top level, it
 * executes on import, and a bundler cannot prove it is safe to remove - so the
 * entire generator was emitted into the LoginPage chunk of a LIVE build, even
 * though the JSX branch rendering it was statically dead. Nothing failed, the
 * site worked, and the fixture data was sitting in the production bundle.
 *
 * Moving the work into the render means the module has no import-time effect, so
 * a live build - where this branch is unreachable - drops the whole thing.
 */
function useDemoAccounts() {
  return useMemo(() => {
    const { customers, loans, admin } = buildDataset({ customerCount: 20 });

    const loanCountFor = (accountNumber) =>
      loans.filter((loan) => loan.accountNumber === accountNumber).length;

    // The two customers with the most loans, because an empty loan list makes
    // the portfolio screens look broken rather than sparse.
    const busiest = [...customers]
      .sort(
        (a, b) => loanCountFor(b.customer.accountNumber) - loanCountFor(a.customer.accountNumber),
      )
      .slice(0, 2);

    return [
      {
        key: 'admin',
        username: admin.username,
        role: 'Administrator',
        detail: 'Every customer and loan. Can approve applications.',
      },
      ...busiest.map((record) => ({
        key: record.username,
        username: record.username,
        role: 'Customer',
        detail: `${record.customer.fullName} - ${loanCountFor(record.customer.accountNumber)} loans, own data only.`,
      })),
    ];
  }, []);
}

export default function DemoCredentials({ onFill }) {
  const accounts = useDemoAccounts();

  return (
    <section
      aria-label="Demo sign-in accounts"
      className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-3"
    >
      <p className="text-xs font-semibold tracking-wide text-amber-900 uppercase">
        Demo mode - no backend
      </p>
      <p className="mt-1 text-xs text-amber-800">
        Select an account to fill the form. Every account uses the password{' '}
        <code className="rounded bg-amber-100 px-1 py-0.5 font-mono font-semibold">
          {DEMO_PASSWORD}
        </code>
      </p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {accounts.map((account) => (
          <li key={account.key}>
            <button
              type="button"
              onClick={() => onFill({ username: account.username, password: DEMO_PASSWORD })}
              className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-left
                         hover:border-amber-500 hover:bg-amber-100/60
                         focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-xs font-semibold break-all text-slate-900">
                  {account.username}
                </span>
                <span className="shrink-0 text-[0.65rem] font-medium tracking-wide text-amber-800 uppercase">
                  {account.role}
                </span>
              </span>
              <span className="mt-0.5 block text-xs text-slate-600">{account.detail}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
