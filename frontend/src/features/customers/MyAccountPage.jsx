import { useAuth } from '../../auth/AuthProvider.jsx';
import { useCustomer } from '../../hooks/useCustomer.js';
import { formatAccountNumber, formatCurrency, formatDate, formatStatus } from '../../lib/format.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Badge, { statusTone } from '../../components/ui/Badge.jsx';
import Spinner from '../../components/ui/FullPageSpinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';

/** The signed-in customer's own account, resolved from the session identity. */
export default function MyAccountPage() {
  const { user } = useAuth();
  const accountNumber = user?.accountNumber ? String(user.accountNumber) : null;
  const { customer, loans } = useCustomer(accountNumber);

  return (
    <>
      <PageHeader title="My account" description={user?.username} />

      {!accountNumber ? (
        <Alert tone="warning" title="No customer account linked">
          This login is not linked to a customer record, so there is nothing to show here.
        </Alert>
      ) : customer.isPending ? (
        <Spinner className="mx-auto mt-16 size-8" label="Loading account" />
      ) : customer.error ? (
        <Alert tone="danger" title="Could not load your account">
          {customer.error.message}
        </Alert>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader title="Details" />
            <CardBody>
              <dl className="flex flex-col gap-3 text-sm">
                <Row label="Name" value={customer.data.fullName} />
                <Row
                  label="Account"
                  value={formatAccountNumber(customer.data.accountNumber)}
                  mono
                />
                <Row label="Email" value={customer.data.email} />
                <Row label="Phone" value={customer.data.phoneNo} mono />
                <Row label="Branch" value={customer.data.branchCode} />
              </dl>
            </CardBody>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader title="My loans" />
            <CardBody className="p-0">
              {loans.isPending ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">Loading loans…</p>
              ) : (loans.data ?? []).length === 0 ? (
                <EmptyState
                  title="No loans yet"
                  description="Applications you submit will appear here."
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {(loans.data ?? []).map((loan) => (
                    <li
                      key={loan.loanId}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {loan.loanType} loan{' '}
                          <span className="font-mono text-xs text-slate-400">#{loan.loanId}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatCurrency(loan.principalAmount)} at{' '}
                          {Number(loan.interestRate).toFixed(2)}% · applied{' '}
                          {formatDate(loan.applicationDate)}
                        </p>
                        {loan.monthlyEmi ? (
                          <p className="mt-0.5 text-xs text-slate-500">
                            {formatCurrency(loan.monthlyEmi)} per month over {loan.tenureMonths}{' '}
                            months
                          </p>
                        ) : null}
                      </div>
                      <Badge tone={statusTone(loan.loanStatus)}>{formatStatus(loan.loanStatus)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-right font-medium text-slate-900 ${mono ? 'font-mono text-xs' : ''}`}>
        {value ?? '—'}
      </dd>
    </div>
  );
}
