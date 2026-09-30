import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAccountRequest, useReviewAccountRequest } from '../../hooks/useAccountRequests.js';
import { formatDate } from '../../lib/format.js';
import Alert from '../../components/ui/Alert.jsx';
import Badge, { statusTone } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import DetailRow from '../../components/ui/DetailRow.jsx';
import Field from '../../components/ui/Field.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import Spinner from '../../components/ui/FullPageSpinner.jsx';
import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';

/** The backend caps `reviewNotes` at 500 characters. */
const MAX_NOTES = 500;

/**
 * One account-opening request, and the decision on it.
 *
 * The detail is the point of the screen: the PAN, date of birth, branch and
 * contact details are all here precisely because `/api/admin/**` is the only
 * place the backend will send them, and an officer cannot check an application
 * against a document from an identifier they cannot see.
 *
 * A decided request is shown as read-only rather than as a form with a disabled
 * button. The server refuses to re-decide one, so offering the control would be
 * offering something that can only fail - and the refusal is a 400 that arrives
 * after the officer has typed a reason, which is a worse way to learn that the
 * decision was already made than being told up front.
 */
export default function AccountRequestReviewPage() {
  const { requestId } = useParams();
  const { data: request, isPending, error, refetch } = useAccountRequest(requestId);
  const review = useReviewAccountRequest();

  const [notes, setNotes] = useState('');
  const [notesError, setNotesError] = useState(null);
  const [failure, setFailure] = useState(null);
  const [decided, setDecided] = useState(null);

  async function decide(decision) {
    setFailure(null);
    setNotesError(null);

    if (decision === 'REJECTED' && !notes.trim()) {
      // Not a server rule - the backend accepts an empty note on a rejection -
      // but a rejection with no reason is a rejection the applicant cannot act
      // on, and this is the one field they ever see from this decision.
      setNotesError('Give the applicant a reason for rejecting the request.');
      return;
    }
    if (notes.length > MAX_NOTES) {
      setNotesError(`Review notes cannot exceed ${MAX_NOTES} characters.`);
      return;
    }

    try {
      const updated = await review.mutateAsync({
        requestId,
        decision,
        reviewNotes: notes.trim() || undefined,
      });
      setDecided(updated);
    } catch (err) {
      setFailure(err.message ?? 'The decision could not be recorded.');
    }
  }

  if (isPending) {
    return <Spinner className="mx-auto mt-24 size-8" label="Loading request" />;
  }

  if (error) {
    return (
      <Alert tone="danger" title="Could not load this request">
        <p>{error.message}</p>
        <div className="mt-2">
          <Button size="sm" variant="secondary" onClick={refetch}>
            Try again
          </Button>
        </div>
      </Alert>
    );
  }

  // The mutation's response is the authoritative post-decision state, including
  // the account number an approval produced, so it replaces the fetched request
  // rather than being shown alongside it.
  const current = decided ?? request;
  const decidedAlready = current.status !== 'PENDING';

  return (
    <>
      <PageHeader
        title={`Account request #${current.requestId}`}
        description="Check the applicant's details, then approve or reject."
        actions={
          <Link
            to="/accounts/requests"
            className="text-sm font-medium text-brand-700 underline hover:text-brand-800"
          >
            Back to queue
          </Link>
        }
      />

      {decided ? (
        <Alert
          tone={decided.status === 'APPROVED' ? 'success' : 'danger'}
          title={
            decided.status === 'APPROVED'
              ? `Approved. Account ${decided.resultingAccountNumber} is now open.`
              : 'Rejected. The applicant can apply again.'
          }
          className="mb-4"
        />
      ) : null}

      {!decided && failure ? (
        <Alert tone="danger" title="Decision not recorded" className="mb-4">
          {failure}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Applicant" description="Shown in full to administrators only." />
          <CardBody>
            <dl className="flex flex-col gap-3 text-sm">
              <DetailRow label="Full name" value={current.fullName} />
              <DetailRow label="PAN" value={current.panNo} mono />
              <DetailRow label="Date of birth" value={formatDate(current.dob)} />
              <DetailRow label="Email" value={current.email} />
              <DetailRow label="Phone" value={current.phoneNo} mono />
              <DetailRow label="Branch" value={current.branchCode} />
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Request" description="Where the application has got to." />
          <CardBody>
            <dl className="flex flex-col gap-3 text-sm">
              <DetailRow
                label="Status"
                value={
                  <Badge tone={statusTone(current.status)}>
                    {current.status.charAt(0) + current.status.slice(1).toLowerCase()}
                  </Badge>
                }
              />
              <DetailRow label="Requested" value={formatDate(current.requestedAt)} />
              {/* 'Not yet reviewed' rather than a dash: the field is absent
                  before a decision and the officer needs to know that means
                  "nobody has looked at this", not "the field is unknown". */}
              <DetailRow
                label="Decided"
                value={current.reviewedAt ? formatDate(current.reviewedAt) : 'Not yet reviewed'}
              />
              {current.resultingAccountNumber ? (
                <DetailRow
                  label="Account opened"
                  value={current.resultingAccountNumber}
                  mono
                />
              ) : null}
            </dl>

            {current.reviewNotes ? (
              <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm ring-1 ring-slate-200 ring-inset">
                <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                  Review notes
                </p>
                <p className="mt-1 text-slate-900">{current.reviewNotes}</p>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>

      {decidedAlready ? (
        <Alert tone="neutral" className="mt-4">
          This request was already {current.status.toLowerCase()}
          {current.reviewedAt ? ` on ${formatDate(current.reviewedAt)}` : ''}. It cannot be
          reviewed again - the applicant may submit a new request.
        </Alert>
      ) : (
        <Card className="mt-4">
          <CardHeader
            title="Decision"
            description="Approving opens the bank account. Rejecting lets the applicant try again."
          />
          <CardBody>
            <Field
              label="Review notes"
              error={notesError}
              // Suppressed once there is an error: the error itself is the
              // message, and the hint underneath it would contradict it.
              hint={
                notesError
                  ? undefined
                  : `Shown to the applicant. Required to reject; ${MAX_NOTES} characters at most.`
              }
            >
              {({ id, describedBy, invalid }) => (
                <textarea
                  id={id}
                  rows={3}
                  maxLength={MAX_NOTES}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  className={[
                    'w-full rounded-[var(--radius-input)] border px-3 py-2 text-sm shadow-xs',
                    'focus:ring-2 focus:ring-brand-600 focus:outline-none',
                    invalid
                      ? 'border-rose-400 focus:ring-rose-500'
                      : 'border-slate-300 focus:border-brand-500',
                  ].join(' ')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              )}
            </Field>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={() => decide('APPROVED')} busy={review.isPending}>
                Approve and open account
              </Button>
              <Button
                variant="danger"
                onClick={() => decide('REJECTED')}
                busy={review.isPending}
              >
                Reject
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </>
  );
}
