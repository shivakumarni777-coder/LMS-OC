import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApproveLoan, useLoan } from '../../hooks/useLoans.js';
import { useCustomerProfile } from '../../hooks/useCustomer.js';
import { useLoanDocuments } from '../../hooks/useLoanDocuments.js';
import { downloadDocument } from '../../api/documentService.js';
import { estimateEmi, totalInterest } from '../../lib/emi.js';
import { TENURE_PRESETS, hasErrors, validateApproval } from '../../lib/validation.js';
import {
  formatAccountNumber,
  formatBytes,
  formatCurrency,
  formatDate,
  formatStatus,
} from '../../lib/format.js';
import Alert from '../../components/ui/Alert.jsx';
import Badge, { statusTone } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import DetailRow from '../../components/ui/DetailRow.jsx';
import Field, { TextInput } from '../../components/ui/Field.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import Spinner from '../../components/ui/FullPageSpinner.jsx';
import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';

/**
 * One loan application, reviewed end to end.
 *
 * Everything needed to decide sits on this one screen: who applied, which
 * account it is booked against, the terms, and the documents they attached. The
 * previous arrangement - an Approve button in the list that opened a dialog -
 * meant approving without ever having looked at any of it, because there was
 * nowhere on that screen to see the documents.
 *
 * Read from three sources rather than one, because the backend serves them from
 * three places: the loan from `GET /api/loans/{loanId}` (owner-or-admin), the
 * applicant from `GET /api/customers/{accountNumber}` (owner-or-admin), and the
 * documents from the loan-scoped list. None of them grants more authority than
 * an officer already has, so no admin-only variants are involved.
 *
 * Approval is the existing `PUT /api/loans/{loanId}/approve`. Only a PENDING
 * loan can be approved, and that rule belongs to the server - so the control is
 * simply absent for a decided loan rather than present and failing.
 */
export default function LoanDetailPage() {
  const { loanId } = useParams();
  const loan = useLoan(loanId);
  const approve = useApproveLoan();

  // The applicant is keyed by the loan's account number, so the query is
  // disabled until the loan has arrived - fetching on an empty id would ask for
  // a customer the page has not identified yet.
  const accountNumber = loan.data?.accountNumber;
  const applicant = useCustomerProfile(accountNumber);
  const documents = useLoanDocuments(loanId);

  const [tenure, setTenure] = useState('');
  const [tenureError, setTenureError] = useState(null);
  const [failure, setFailure] = useState(null);
  const [approved, setApproved] = useState(null);
  const [downloadError, setDownloadError] = useState(null);

  async function submitApproval(event) {
    event.preventDefault();
    setFailure(null);
    setTenureError(null);

    const found = validateApproval({ tenureMonths: tenure });
    setTenureError(found.tenureMonths);
    if (hasErrors(found)) return;

    try {
      const result = await approve.mutateAsync({ loanId, tenureMonths: Number(tenure) });
      setApproved(result);
    } catch (err) {
      setFailure(err.fieldErrors?.tenureMonths ?? err.message ?? 'Approval failed.');
    }
  }

  async function handleDownload(document_) {
    setDownloadError(null);
    try {
      const { blob, fileName } = await downloadDocument(document_.documentId);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = fileName ?? document_.documentName;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoked straight after the click. These files can be ten megabytes, and
      // an object URL left alive holds its blob for the life of the page.
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err.message ?? 'The document could not be downloaded.');
    }
  }

  if (loan.isPending) {
    return <Spinner className="mx-auto mt-24 size-8" label="Loading loan" />;
  }

  if (loan.error) {
    return (
      <Alert tone="danger" title="Could not load this loan">
        <p>{loan.error.message}</p>
        <div className="mt-2">
          <Button size="sm" variant="secondary" onClick={loan.refetch}>
            Try again
          </Button>
        </div>
      </Alert>
    );
  }

  // The mutation's response replaces the fetched loan, so the screen shows what
  // the server stored - its own tenure and EMI - rather than the draft the
  // officer was looking at when they clicked.
  const current = approved ?? loan.data;
  const isPending = current.loanStatus === 'PENDING';
  const docs = documents.data ?? [];

  return (
    <>
      <PageHeader
        title={`Loan #${current.loanId}`}
        description={`${current.loanType} · applied ${formatDate(current.applicationDate)}`}
        actions={
          <Link
            to="/loans"
            className="text-sm font-medium text-brand-700 underline hover:text-brand-800"
          >
            Back to loans
          </Link>
        }
      />

      {approved ? (
        <Alert
          tone="success"
          title={`Loan ${approved.loanId} approved`}
          className="mb-4"
        >
          Monthly instalment {formatCurrency(approved.monthlyEmi)} over {approved.tenureMonths}{' '}
          months.
        </Alert>
      ) : null}

      {failure ? (
        <Alert tone="danger" title="Approval not recorded" className="mb-4">
          {failure}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Applicant" description="The account holder." />
          <CardBody>
            {applicant.isPending ? (
              <Spinner className="my-4 size-5" label="Loading applicant" />
            ) : applicant.error ? (
              <p className="text-sm text-slate-600">
                Could not load the applicant ({applicant.error.message}). The account number below
                is from the loan itself.
              </p>
            ) : (
              <dl className="flex flex-col gap-3 text-sm">
                <DetailRow label="Name" value={applicant.data.fullName} />
                <DetailRow label="Email" value={applicant.data.email} />
                <DetailRow label="Phone" value={applicant.data.phoneNo} mono />
              </dl>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Bank account" description="Where the loan is booked." />
          <CardBody>
            <dl className="flex flex-col gap-3 text-sm">
              <DetailRow
                label="Account"
                value={formatAccountNumber(current.accountNumber)}
                mono
              />
              <DetailRow label="Branch" value={applicant.data?.branchCode} />
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Application" description="Terms as submitted." />
          <CardBody>
            <dl className="flex flex-col gap-3 text-sm">
              <DetailRow label="Type" value={current.loanType} />
              <DetailRow label="Principal" value={formatCurrency(current.principalAmount)} />
              <DetailRow
                label="Interest"
                value={`${Number(current.interestRate).toFixed(2)}%`}
              />
              <DetailRow label="Applied" value={formatDate(current.applicationDate)} />
              <DetailRow
                label="Status"
                value={<Badge tone={statusTone(current.loanStatus)}>{formatStatus(current.loanStatus)}</Badge>}
              />
              {current.tenureMonths ? (
                <>
                  <DetailRow label="Tenure" value={`${current.tenureMonths} months`} />
                  <DetailRow label="Monthly EMI" value={formatCurrency(current.monthlyEmi)} />
                </>
              ) : null}
            </dl>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Documents"
          // The count is withheld while loading and after a failure, rather than
          // reporting a confident "0" that was never actually established.
          description={
            documents.isPending || documents.error
              ? 'Attached to this application'
              : `${docs.length} attached to this application`
          }
        />
        <CardBody>
          {downloadError ? (
            <Alert tone="danger" title="Download problem" className="mb-4">
              {downloadError}
            </Alert>
          ) : null}

          {documents.isPending ? (
            <Spinner className="my-4 size-5" label="Loading documents" />
          ) : documents.error ? (
            // Distinguished from an empty list, because an officer deciding a
            // "0 attached" application has not been told the same thing as one
            // whose attachments could not be loaded.
            <div>
              <Alert tone="danger" title="Could not load the documents">
                <p>{documents.error.message}</p>
                <div className="mt-2">
                  <Button size="sm" variant="secondary" onClick={documents.refetch}>
                    Try again
                  </Button>
                </div>
              </Alert>
            </div>
          ) : docs.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              The applicant attached no documents. The system requires none, so the application can
              still be decided on its own terms.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-200">
              {docs.map((document_) => (
                <li
                  key={document_.documentId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {document_.documentName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {document_.documentType} · {formatBytes(document_.sizeBytes)} ·{' '}
                      {formatDate(document_.uploadedAt)}
                    </p>
                    {document_.status === 'REJECTED' && document_.rejectionReason ? (
                      <p className="mt-1 text-xs text-rose-700">
                        Rejected: {document_.rejectionReason}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={statusTone(document_.status)}>
                      {formatStatus(document_.status)}
                    </Badge>
                    <Button variant="ghost" onClick={() => handleDownload(document_)}>
                      Download
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {isPending ? (
        <Card className="mt-4">
          <CardHeader
            title="Approve"
            description="Setting the tenure calculates and stores the monthly instalment."
          />
          <CardBody>
            <form onSubmit={submitApproval} noValidate className="flex flex-col gap-4">
              <Field
                label="Tenure in months"
                error={tenureError}
                hint="Between 1 and 480."
                required
              >
                {({ id, describedBy, invalid, required: isRequired }) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    name="tenureMonths"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="480"
                    value={tenure}
                    invalid={invalid}
                    aria-invalid={invalid || undefined}
                    aria-required={isRequired}
                    onChange={(e) => setTenure(e.target.value)}
                  />
                )}
              </Field>

              <div className="flex flex-wrap gap-2">
                {TENURE_PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    size="sm"
                    variant="secondary"
                    onClick={() => setTenure(String(preset))}
                  >
                    {preset}m
                  </Button>
                ))}
              </div>

              <ApprovalPreview loan={current} tenure={tenure} />

              <div>
                <Button type="submit" busy={approve.isPending}>
                  {approve.isPending ? 'Approving' : 'Confirm approval'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : (
        <Alert tone="neutral" className="mt-4">
          This loan is {formatStatus(current.loanStatus).toLowerCase()} and cannot be approved
          again.
          {current.tenureMonths
            ? ` It was approved over ${current.tenureMonths} months at ${formatCurrency(current.monthlyEmi)} per month.`
            : ''}
        </Alert>
      )}
    </>
  );
}

/** Live EMI estimate, recomputed as the tenure changes. */
function ApprovalPreview({ loan, tenure }) {
  const emi = estimateEmi(loan.principalAmount, loan.interestRate, tenure);
  const interest = totalInterest(loan.principalAmount, emi, tenure);

  if (emi === null) {
    return <p className="text-sm text-slate-500">Enter a tenure to see the monthly instalment.</p>;
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
