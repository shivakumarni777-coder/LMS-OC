import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { approveLoan } from '../../api/loanService.js';
import { useLoans } from '../../hooks/useLoans.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { estimateEmi, totalInterest } from '../../lib/emi.js';
import { TENURE_PRESETS, hasErrors, validateApproval } from '../../lib/validation.js';
import { formatAccountNumber, formatCurrency, formatDate, formatStatus } from '../../lib/format.js';
import Field, { TextInput } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Badge, { statusTone } from '../../components/ui/Badge.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Spinner from '../../components/ui/FullPageSpinner.jsx';

/**
 * Loan list with inline approval.
 *
 * The approve action lives in the row because an officer's whole task is
 * working down this queue; making them open a detail page and come back would
 * add a step for no benefit.
 *
 * @param pendingOnly admin-only: show just the undecided applications.
 */
export default function LoansPage({ pendingOnly = false }) {
  const { isAdmin } = useAuth();
  const { data: loans, isPending, isFetching, error, refetch } = useLoans();
  const location = useLocation();

  const [active, setActive] = useState(null);
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const [draft, setDraft] = useState({ tenureMonths: '' });
  const [draftError, setDraftError] = useState(null);

  const rows = loans ?? [];
  const queue = pendingOnly ? rows.filter((loan) => loan.loanStatus === 'PENDING') : rows;
  const isQueue = pendingOnly && queue.length > 0;

  async function submitApproval(event) {
    event.preventDefault();
    setFormError(null);
    setDraftError(null);

    const found = validateApproval(draft);
    setDraftError(found.tenureMonths);
    if (hasErrors(found)) return;

    setBusy(true);
    try {
      const approved = await approveLoan(active.loanId, {
        tenureMonths: Number(draft.tenureMonths),
      });
      setDone(approved);
      setActive(null);
      setDraft({ tenureMonths: '' });
    } catch (err) {
      setFormError(err.fieldErrors?.tenureMonths ?? err.message ?? 'Approval failed.');
    } finally {
      setBusy(false);
    }
  }

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

      {done ? (
        <Alert tone="success" title={`Loan ${done.loanId} approved`} className="mb-4">
          Monthly instalment {formatCurrency(done.monthlyEmi)} over {done.tenureMonths} months.
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
                      render: (loan) =>
                        loan.loanStatus === 'PENDING' ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              setActive(loan);
                              setDraft({ tenureMonths: '' });
                              setFormError(null);
                            }}
                          >
                            Approve
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        ),
                    },
                  ]
                : []),
            ]}
          />
        </CardBody>
      </Card>

      {active ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="approve-title"
            className="w-full max-w-md rounded-[var(--radius-card)] bg-white shadow-xl"
          >
            <CardHeader
              title="Approve loan"
              description={`#${active.loanId} · ${formatCurrency(active.principalAmount)} at ${
                Number(active.interestRate).toFixed(2)
              }%`}
            />
            <CardBody>
              {formError ? (
                <Alert tone="danger" className="mb-4">
                  {formError}
                </Alert>
              ) : null}

              <form onSubmit={submitApproval} noValidate className="flex flex-col gap-4">
                <Field
                  label="Tenure in months"
                  error={draftError}
                  hint="Between 1 and 480. This sets the monthly instalment."
                  required
                >
                  {({ id, describedBy, invalid, required }) => (
                    <TextInput
                      id={id}
                      aria-describedby={describedBy}
                      name="tenureMonths"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="480"
                      autoFocus
                      value={draft.tenureMonths}
                      invalid={invalid}
                      aria-invalid={invalid || undefined}
                      aria-required={required}
                      onChange={(e) => setDraft({ tenureMonths: e.target.value })}
                    />
                  )}
                </Field>

                <div className="flex flex-wrap gap-2">
                  {TENURE_PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      size="sm"
                      variant="secondary"
                      onClick={() => setDraft({ tenureMonths: String(preset) })}
                    >
                      {preset}m
                    </Button>
                  ))}
                </div>

                <ApprovalPreview loan={active} tenure={draft.tenureMonths} />

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" busy={busy}>
                    {busy ? 'Approving' : 'Confirm approval'}
                  </Button>
                  <Button variant="ghost" onClick={() => setActive(null)} disabled={busy}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardBody>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Live EMI estimate, recomputed as the tenure changes. */
function ApprovalPreview({ loan, tenure }) {
  const emi = estimateEmi(loan.principalAmount, loan.interestRate, tenure);
  const interest = totalInterest(loan.principalAmount, emi, tenure);

  if (emi === null) {
    return (
      <p className="text-sm text-slate-500">
        Enter a tenure to see the monthly instalment.
      </p>
    );
  }

  return (
    <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm ring-1 ring-slate-200 ring-inset">
      <div className="flex justify-between">
        <span className="text-slate-600">Monthly instalment</span>
        <span className="font-semibold tabular-nums text-slate-900">{formatCurrency(emi)}</span>
      </div>
      <div className="mt-1 flex justify-between">
        <span className="text-slate-600">Total interest</span>
        <span className="tabular-nums text-slate-900">{formatCurrency(interest)}</span>
      </div>
      <div className="mt-1 flex justify-between">
        <span className="text-slate-600">Total repayable</span>
        <span className="tabular-nums text-slate-900">
          {formatCurrency(Number(loan.principalAmount) + (interest ?? 0))}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        An estimate. The server recalculates and stores the final figure on approval.
      </p>
    </div>
  );
}
