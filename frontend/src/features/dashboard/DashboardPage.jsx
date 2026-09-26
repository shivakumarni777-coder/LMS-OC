import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useLoanSummary, useLoans } from '../../hooks/useLoans.js';
import { formatAccountNumber, formatCurrency, formatStatus } from '../../lib/format.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import { Card, CardBody, CardHeader, StatTile } from '../../components/ui/Card.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Badge, { statusTone } from '../../components/ui/Badge.jsx';
import Spinner from '../../components/ui/FullPageSpinner.jsx';
import Button from '../../components/ui/Button.jsx';

/**
 * Role-aware landing page.
 *
 * Both queries are started by their hooks on the same render, so the summary
 * and the list arrive together rather than one after the other.
 */
export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const summary = useLoanSummary();
  const loans = useLoans();

  if (summary.isPending || loans.isPending) {
    return <Spinner className="mx-auto mt-24 size-8" label="Loading dashboard" />;
  }

  if (summary.error) {
    return (
      <Alert tone="danger" title="Could not load the dashboard">
        <p>{summary.error.message}</p>
        <div className="mt-2">
          <Button size="sm" variant="secondary" onClick={summary.refetch}>
            Try again
          </Button>
        </div>
      </Alert>
    );
  }

  const rows = loans.data ?? [];
  const recent = rows.slice(0, 5);
  const pendingCount = summary.data?.byStatus?.find((b) => b.status === 'PENDING')?.count ?? 0;

  return (
    <>
      <PageHeader
        title={greeting(user)}
        description={
          isAdmin
            ? 'Book-wide view. Pending applications are waiting on your decision.'
            : 'A summary of your account and loan applications.'
        }
        actions={
          isAdmin ? (
            <Link to="/loans/pending">
              <Button>Review approvals</Button>
            </Link>
          ) : (
            <Link to="/loans/apply">
              <Button>Apply for a loan</Button>
            </Link>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total loans"
          value={summary.data?.totalLoans ?? 0}
          hint="All applications on record"
        />
        <StatTile
          label="Principal sanctioned"
          value={formatCurrency(summary.data?.totalPrincipal, { compact: true })}
          tone="brand"
          hint="Sum of applied amounts"
        />
        <StatTile
          label="Monthly instalments"
          value={formatCurrency(summary.data?.totalOutstandingEmi, { compact: true })}
          tone="positive"
          hint="Across approved loans"
        />
        <StatTile
          label="Pending"
          value={pendingCount}
          tone={pendingCount > 0 ? 'caution' : 'default'}
          hint={pendingCount > 0 ? 'Awaiting a decision' : 'Nothing outstanding'}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Recent loans"
            actions={
              <Link
                to="/loans"
                className="text-sm font-medium text-brand-700 hover:underline"
              >
                View all
              </Link>
            }
          />
          <CardBody className="p-0">
            {recent.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                No loans yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recent.map((loan) => (
                  <li
                    key={loan.loanId}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {loan.loanType} loan
                        <span className="ml-2 font-mono text-xs text-slate-400">
                          #{loan.loanId}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatCurrency(loan.principalAmount)}
                        {loan.monthlyEmi ? ` · ${formatCurrency(loan.monthlyEmi)}/month` : ''}
                      </p>
                    </div>
                    <Badge tone={statusTone(loan.loanStatus)}>{formatStatus(loan.loanStatus)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Portfolio by status" />
          <CardBody>
            <dl className="flex flex-col gap-3">
              {(summary.data?.byStatus ?? []).map((bucket) => (
                <div key={bucket.status} className="flex items-center justify-between gap-3">
                  <dt>
                    <Badge tone={statusTone(bucket.status)}>{formatStatus(bucket.status)}</Badge>
                  </dt>
                  <dd className="text-right">
                    <span className="block text-sm font-semibold tabular-nums text-slate-900">
                      {bucket.count}
                    </span>
                    <span className="block text-xs tabular-nums text-slate-500">
                      {formatCurrency(bucket.principal, { compact: true })}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>

            {!isAdmin && user?.accountNumber ? (
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
                Your account number is{' '}
                <span className="font-mono text-slate-700">
                  {formatAccountNumber(user.accountNumber)}
                </span>
                .
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function greeting(user) {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = user?.fullName?.split(' ')[0] ?? user?.username ?? 'there';
  return `${part}, ${name}`;
}
