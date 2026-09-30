import { Link, useLocation } from 'react-router-dom';
import { useLoans } from '../../hooks/useLoans.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { formatAccountNumber, formatCurrency, formatDate, formatStatus } from '../../lib/format.js';
import Badge, { statusTone } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Spinner from '../../components/ui/FullPageSpinner.jsx';

/**
 * Loan list.
 *
 * An officer's row action goes to the loan's own review page rather than opening
 * a dialog here. Deciding a loan means reading the applicant's details and the
 * documents they attached, and a popover over a list has no room for either - so
 * the inline Approve dialog this replaced let a loan be approved without having
 * looked at any of it.
 *
 * @param pendingOnly admin-only: show just the undecided applications.
 */
export default function LoansPage({ pendingOnly = false }) {
  const { isAdmin } = useAuth();
  const { data: loans, isPending, isFetching, error, refetch } = useLoans();
  const location = useLocation();

  const rows = loans ?? [];
  const queue = pendingOnly ? rows.filter((loan) => loan.loanStatus === 'PENDING') : rows;
  const isQueue = pendingOnly && queue.length > 0;

  if (isPending) return <Spinner className="mx-auto mt-24 size-8" label="Loading loans" />;

  if (error) {
    return (
      <Alert tone="danger" title="Could not load loans">
        <p>{error.message}</p>
        <div className="mt-2">
          <Button size="sm" variant="secondary" onClick={refetch}>
            Try again
          </Button>
        </div>
      </Alert>
    );
  }

  return (
    <>
      <PageHeader
        title={pendingOnly ? 'Pending approvals' : isAdmin ? 'Loans' : 'My loans'}
        description={
          pendingOnly
            ? 'Applications awaiting a decision. Approving sets the tenure and calculates the EMI.'
            : isAdmin
              ? 'Every application in the system.'
              : 'Your loan applications and their current status.'
        }
        actions={
          <Button variant="secondary" onClick={refetch} busy={isFetching}>
            Refresh
          </Button>
        }
      />

      {location.state?.flash ? (
        <Alert tone="success" className="mb-4">
          {location.state.flash}
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title={pendingOnly ? 'Awaiting decision' : 'All loans'}
          description={`${queue.length} ${queue.length === 1 ? 'loan' : 'loans'}`}
        />
        <CardBody className="p-0">
          <DataTable
            caption="Loans with status, amount and approval controls"
            rows={queue}
            rowKey={(loan) => loan.loanId}
            emptyState={
              <EmptyState
                title={isQueue ? 'Nothing pending' : 'No loans to show'}
                description={
                  isQueue
                    ? 'Every application has been decided. New ones will appear here.'
                    : isAdmin
                      ? 'Applications will appear here as soon as customers submit them.'
                      : 'Apply for a loan to see it here.'
                }
              />
            }
            columns={[
              {
                key: 'loanId',
                header: 'Loan ID',
                render: (loan) => <span className="font-mono text-xs">#{loan.loanId}</span>,
              },
              {
                key: 'accountNumber',
                header: 'Account',
                render: (loan) => (
                  <span className="font-mono text-xs">
                    {formatAccountNumber(loan.accountNumber)}
                  </span>
                ),
              },
              {
                key: 'loanType',
                header: 'Type',
                render: (loan) => loan.loanType,
              },
              {
                key: 'principalAmount',
                header: 'Principal',
                align: 'right',
                render: (loan) => formatCurrency(loan.principalAmount),
              },
              {
                key: 'interestRate',
                header: 'Rate',
                align: 'right',
                render: (loan) => `${Number(loan.interestRate).toFixed(2)}%`,
              },
              {
                key: 'loanStatus',
                header: 'Status',
                render: (loan) => (
                  <Badge tone={statusTone(loan.loanStatus)}>{formatStatus(loan.loanStatus)}</Badge>
                ),
              },
              {
                key: 'monthlyEmi',
                header: 'Monthly EMI',
                align: 'right',
                render: (loan) => formatCurrency(loan.monthlyEmi),
              },
              {
                key: 'applicationDate',
                header: 'Applied',
                render: (loan) => formatDate(loan.applicationDate),
              },
              ...(isAdmin
                ? [
                    {
                      key: 'actions',
                      header: 'Action',
                      // Always present, for every status. A decided loan still
                      // has its details and documents to read, and hiding the
                      // link would make those unreachable from the list.
                      render: (loan) => (
                        <Link
                          to={`/loans/${loan.loanId}`}
                          className="text-sm font-medium text-brand-700 underline hover:text-brand-800"
                        >
                          {loan.loanStatus === 'PENDING' ? 'Review' : 'View'}
                        </Link>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </CardBody>
      </Card>
    </>
  );
}
