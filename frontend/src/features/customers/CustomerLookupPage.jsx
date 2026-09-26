import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useCustomer } from '../../hooks/useCustomer.js';
import { formatAccountNumber, formatCurrency, formatDate, formatStatus } from '../../lib/format.js';
import Field, { TextInput } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Badge, { statusTone } from '../../components/ui/Badge.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';
import Spinner from '../../components/ui/FullPageSpinner.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';

/**
 * Account lookup.
 *
 * The number is kept as a string throughout: a 12-digit account number would
 * lose precision as a JavaScript number, so it is only converted at the point
 * of the API call, and the query key stays exact.
 */
export default function CustomerLookupPage() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [input, setInput] = useState('');
  const [accountNumber, setAccountNumber] = useState(null);

  const { customer, loans } = useCustomer(accountNumber);

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = input.replace(/\D/g, '');
    if (!trimmed) return;
    setAccountNumber(trimmed);
  }

  return (
    <>
      <PageHeader
        title="Customer lookup"
        description={
          isAdmin
            ? 'Search any account to see its details and loan portfolio.'
            : 'Look up an account to see its details and loans.'
        }
      />

      <Card className="mb-6">
        <CardBody>
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
            <Field label="Account number" className="w-full sm:max-w-xs">
              {({ id }) => (
                <TextInput
                  id={id}
                  name="accountNumber"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="304012345678"
                  className="font-mono"
                  value={input}
                  onChange={(event) => setInput(event.target.value.replace(/\D/g, ''))}
                />
              )}
            </Field>
            <Button type="submit" disabled={!input.trim()}>
              Search
            </Button>
            {isAdmin && user?.accountNumber ? (
              <Button variant="ghost" onClick={() => navigate(`/customers/${user.accountNumber}`)}>
                Use my own account
              </Button>
            ) : null}
          </form>
        </CardBody>
      </Card>

      {accountNumber === null ? null : customer.isPending ? (
        <Spinner className="mx-auto my-12 size-8" label="Loading customer" />
      ) : customer.error ? (
        <Alert tone="danger" title="Not found">
          <p>
            No customer matches account{' '}
            <span className="font-mono">{formatAccountNumber(accountNumber)}</span>.
          </p>
        </Alert>
      ) : (
        <CustomerResult customer={customer.data} loans={loans} />
      )}
    </>
  );
}

function CustomerResult({ customer, loans }) {
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader title="Customer" />
        <CardBody>
          <dl className="flex flex-col gap-3 text-sm">
            <Row label="Name" value={customer.fullName} />
            <Row label="Account" value={formatAccountNumber(customer.accountNumber)} mono />
            <Row label="Email" value={customer.email} />
            <Row label="Phone" value={customer.phoneNo} mono />
            <Row label="Branch" value={customer.branchCode} />
          </dl>
        </CardBody>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader title="Loans" description={loans.isPending ? 'Loading' : undefined} />
        <CardBody className="p-0">
          {loans.isPending ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">Loading loans…</p>
          ) : loans.error ? (
            <p className="px-5 py-8 text-center text-sm text-rose-700">{loans.error.message}</p>
          ) : (
            <DataTable
              caption="Loans for this customer"
              rows={loans.data ?? []}
              rowKey={(loan) => loan.loanId}
              emptyState={
                <EmptyState title="No loans" description="This customer has not applied for a loan." />
              }
              columns={[
                {
                  key: 'loanId',
                  header: 'ID',
                  render: (loan) => <span className="font-mono text-xs">#{loan.loanId}</span>,
                },
                { key: 'loanType', header: 'Type', render: (loan) => loan.loanType },
                {
                  key: 'principalAmount',
                  header: 'Principal',
                  align: 'right',
                  render: (loan) => formatCurrency(loan.principalAmount),
                },
                {
                  key: 'monthlyEmi',
                  header: 'EMI',
                  align: 'right',
                  render: (loan) => formatCurrency(loan.monthlyEmi),
                },
                {
                  key: 'loanStatus',
                  header: 'Status',
                  render: (loan) => (
                    <Badge tone={statusTone(loan.loanStatus)}>{formatStatus(loan.loanStatus)}</Badge>
                  ),
                },
                {
                  key: 'applicationDate',
                  header: 'Applied',
                  render: (loan) => formatDate(loan.applicationDate),
                },
              ]}
            />
          )}
        </CardBody>
      </Card>
    </div>
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
