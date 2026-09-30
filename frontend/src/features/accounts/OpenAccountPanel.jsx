import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useAccountStatus, useRequestAccountOpening } from '../../hooks/useAccount.js';
import { hasErrors, normalisePan, splitFieldErrors, validateAccountOpening } from '../../lib/validation.js';
import { formatAccountNumber, formatDate } from '../../lib/format.js';
import Field, { TextInput } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Spinner from '../../components/ui/FullPageSpinner.jsx';
import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';

/**
 * Requesting a bank account, for a customer who does not have one.
 *
 * This is the first half of the answer to "why can't I apply for a loan yet". A
 * loan is booked against a customer account, so the honest thing is to say so and
 * to offer the step that unblocks it, rather than rendering a loan form that the
 * backend will reject.
 *
 * One identifier is asked for. Name, date of birth, phone, email and branch were
 * all taken at registration and are held on the profile, so re-asking for them
 * would only create a way for the two to disagree. The PAN is the one thing the
 * bank does not have, because it lives on the customer record and the customer
 * record does not exist until an account does.
 *
 * No document is uploaded here. The backend's document endpoints hang off a
 * loan, and there is no loan yet.
 *
 * The status response carries the customer's most recent request, not merely an
 * outstanding one, so a rejection can be shown with the officer's reason. That is
 * the difference between being told "that did not work" and being told why, and it
 * is the only way a rejected customer learns what to change. The form stays
 * available in that state, because a rejection does not block a second attempt -
 * the server keeps no lock on the customer, only on their outstanding request.
 */
export default function OpenAccountPanel() {
  const { user } = useAuth();
  const status = useAccountStatus();
  const submitRequest = useRequestAccountOpening();

  const [pan, setPan] = useState('');
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setFailure(null);

    const found = validateAccountOpening({ panNo: pan });
    setErrors(found);
    if (hasErrors(found)) {
      document.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    try {
      // Upper-cased on the way out. The server's pattern is upper-case only, so
      // sending the raw input would reject a PAN the user had typed correctly
      // on a keyboard set to lower case.
      await submitRequest.mutateAsync(normalisePan(pan.trim()));
      setPan('');
    } catch (error) {
      // Flat body, so the server's key is the bare `panNo`. Anything else is a
      // message about the request as a whole - a conflict, say - and belongs at
      // the top of the form.
      const { inputs, general } = splitFieldErrors(error.fieldErrors, ['panNo']);
      setErrors(inputs);
      setFailure([...(general ?? []), error.message].filter(Boolean).join(' '));
    }
  }

  if (status.isPending) {
    return <Spinner className="mx-auto mt-16 size-8" label="Checking your account" />;
  }

  if (status.error) {
    return (
      <Alert tone="danger" title="Could not check your account status">
        {status.error.message}
      </Alert>
    );
  }

  if (status.data?.hasBankAccount) {
    return (
      <Alert tone="success" title="Your bank account is open">
        Account{' '}
        <strong className="font-mono">{formatAccountNumber(status.data.accountNumber)}</strong>. You
        can apply for a loan.
      </Alert>
    );
  }

  const request = status.data?.accountOpeningRequest;
  // A decided request is not the same as no request, so this cannot be a truthiness
  // test on `request` alone. PENDING is the only state in which the customer must
  // not be offered a second form - the server would refuse it as a duplicate.
  const awaitingReview = request?.status === 'PENDING';
  const wasRejected = request?.status === 'REJECTED';

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="warning" title="You need a bank account to apply for a loan">
        A loan is booked against an account number, so an application cannot be recorded until one
        exists. Requesting an account takes one identifier from you and an officer's approval; your
        other details are already on file.
      </Alert>

      {wasRejected ? (
        <Alert tone="danger" title="Your previous request was not approved">
          {request.reviewNotes?.trim() ? (
            <>
              <span className="block">The officer's reason: {request.reviewNotes}</span>
            </>
          ) : (
            // A rejection with no reason recorded is still a rejection. Saying
            // nothing would leave the customer with the impression the page is
            // broken, so this says what is known and no more.
            <span className="block">No reason was recorded for the decision.</span>
          )}
          {request.reviewedAt ? (
            <span className="mt-1 block text-sm">
              Decided {formatDate(request.reviewedAt)}.
            </span>
          ) : null}
          <span className="mt-1 block text-sm">
            You can apply again below. Please check the details you send.
          </span>
        </Alert>
      ) : null}

      {awaitingReview ? (
        <Card>
          <CardHeader
            title="Your request is with us"
            description={`Submitted ${formatDate(request.requestedAt)}.`}
          />
          <CardBody>
            <dl className="flex flex-col gap-3 text-sm">
              <SummaryRow label="Request" value={`#${request.requestId}`} mono />
              <SummaryRow label="PAN" value={request.maskedPanNo} mono />
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <Badge tone="warning">Awaiting review</Badge>
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-slate-500">
              An officer will approve or reject this. You will be able to apply for a loan once the
              account is open.
            </p>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title={wasRejected ? 'Apply again' : 'Request a bank account'}
            description="Your PAN is the only thing we still need."
          />
          <CardBody>
            <dl className="mb-5 flex flex-col gap-2 rounded-lg bg-slate-50 px-4 py-3 text-sm ring-1 ring-inset ring-slate-200">
              <p className="text-xs font-medium text-slate-500">Already on file</p>
              <SummaryRow label="Name" value={user?.fullName} />
              <SummaryRow label="Date of birth" value={user?.dob} />
              <SummaryRow label="Phone" value={user?.phoneNo} mono />
              <SummaryRow label="Email" value={user?.username} />
              <SummaryRow label="Branch" value={user?.branchCode} />
            </dl>

            {failure ? (
              <Alert tone="danger" title="Could not submit your request" className="mb-4">
                {failure}
              </Alert>
            ) : null}

            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              <Field
                label="PAN number"
                error={errors.panNo}
                hint="Ten characters, for example ABCDE1234F. Letters are converted to upper case."
                required
              >
                {({ id, describedBy, invalid, required }) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    name="panNo"
                    maxLength={10}
                    spellCheck={false}
                    autoComplete="off"
                    className="font-mono uppercase"
                    value={pan}
                    invalid={invalid}
                    aria-invalid={invalid || undefined}
                    aria-required={required}
                    onChange={(e) => setPan(normalisePan(e.target.value))}
                  />
                )}
              </Field>

              <div className="flex flex-wrap gap-3">
                <Button type="submit" busy={submitRequest.isPending}>
                  {submitRequest.isPending ? 'Submitting' : 'Request account'}
                </Button>
              </div>

              <p className="text-xs text-slate-500">
                No documents are needed here.
              </p>
            </form>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function SummaryRow({ label, value, mono = false }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={`text-right font-medium text-slate-900 ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value ?? '-'}
      </dd>
    </div>
  );
}
