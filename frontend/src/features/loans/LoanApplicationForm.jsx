import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { applyForLoan } from '../../api/loanService.js';
import { LOAN_TYPES, hasErrors, validateLoanApplication } from '../../lib/validation.js';
import { formatCurrency, formatPercent } from '../../lib/format.js';
import Field, { SelectInput, TextInput } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';
import DocumentUploadPanel from './DocumentUploadPanel.jsx';

const EMPTY = { loanType: '', principalAmount: '' };

/**
 * The loan application, and then its documents.
 *
 * Split out from ApplyLoanPage so that page can decide whether a form is the
 * right thing to show - a customer with no bank account cannot have an
 * application recorded at all - without duplicating the fields to render the
 * other branch.
 *
 * The account number is pre-filled from the caller's own account when they have
 * one, so the common case leaves a single field to complete. It stays editable
 * because an administrator applies on a customer's behalf and has no account of
 * their own to apply against.
 *
 * The API is two-phase and this reads as one: apply, then attach documents to
 * the loan that comes back. They are separate requests because documents are
 * scoped to a loan that has to exist before it can be keyed by, and the phase
 * boundary is real - the loan is recorded whatever happens to the upload. So the
 * created loan is held in state and the second half of the form takes over from
 * the first, rather than the upload being fired from inside the apply and the
 * whole thing unwound on failure. A failure after the loan exists is a failed
 * upload, not a failed application, and the user is left looking at their
 * application with the option to retry - not back at an empty form for a loan
 * that is already in review.
 *
 * @param {string|number} [accountNumber] - the account to book against, from the
 *   status response the parent already fetched. Preferred over the value in the
 *   identity: it is the same answer, fetched on this page and for this purpose,
 *   so there is no second source that could disagree with it.
 */
export default function LoanApplicationForm({ accountNumber }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const [typedAccount, setTypedAccount] = useState('');
  // Set once, immediately after the apply succeeds, and never cleared. This is
  // what stops a failed upload from costing the customer their application: the
  // loan already exists on the server whether or not a document ever attaches,
  // so the UI stops offering to create another one.
  const [createdLoan, setCreatedLoan] = useState(null);

  const selected = LOAN_TYPES.find((type) => type.value === values.loanType);
  // Undefined rather than '' when nobody has an account, so the field renders
  // empty instead of the string "undefined" or a stray zero.
  const resolved = accountNumber ?? typedAccount ?? user?.accountNumber ?? undefined;

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function finish() {
    navigate('/loans', {
      state: { flash: `Application ${createdLoan.loanId} submitted for review.` },
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFailure(null);

    const found = validateLoanApplication({ ...values, accountNumber: resolved });
    setErrors(found);
    if (hasErrors(found)) {
      document.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    setBusy(true);
    try {
      const loan = await applyForLoan({
        accountNumber: Number(String(resolved).trim()),
        loanType: values.loanType,
        principalAmount: Number(values.principalAmount),
      });
      // The loan list and the dashboard both change as a result.
      await queryClient.invalidateQueries({ queryKey: ['loans'] });
      setCreatedLoan(loan);
    } catch (error) {
      setErrors(error.fieldErrors ?? {});
      setFailure(error.message ?? 'Could not submit the application.');
    } finally {
      setBusy(false);
    }
  }

  // Second phase. Reached only after the loan exists, so there is always a real
  // id to attach documents to and never a document offered against no loan.
  if (createdLoan) {
    return (
      <>
        <Alert tone="success" title="Application submitted" className="mb-4">
          Application <strong className="font-mono">#{createdLoan.loanId}</strong> is with an
          administrator for review. You can attach documents now or come back to it later.
        </Alert>

        <DocumentUploadPanel loanId={createdLoan.loanId} onFinish={finish} />
      </>
    );
  }

  return (
    <>
      {failure ? (
        <Alert tone="danger" title="Application rejected" className="mb-4">
          {failure}
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="New application" description="All fields are required." />
        <CardBody>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <Field
              label="Account number"
              error={errors.accountNumber}
              hint="The account the loan will be booked against."
              required
            >
              {({ id, describedBy, invalid, required }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  name="accountNumber"
                  inputMode="numeric"
                  autoComplete="off"
                  className="font-mono"
                  value={resolved ?? ''}
                  invalid={invalid}
                  aria-invalid={invalid || undefined}
                  aria-required={required}
                  onChange={(e) => setTypedAccount(e.target.value.replace(/\D/g, ''))}
                />
              )}
            </Field>

            <Field label="Loan type" error={errors.loanType} required>
              {({ id, describedBy, invalid, required }) => (
                <SelectInput
                  id={id}
                  aria-describedby={describedBy}
                  name="loanType"
                  value={values.loanType}
                  invalid={invalid}
                  aria-invalid={invalid || undefined}
                  aria-required={required}
                  onChange={(e) => update('loanType', e.target.value)}
                >
                  <option value="">Select a loan type</option>
                  {LOAN_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label} at {type.rate}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>

            <Field
              label="Principal amount"
              error={errors.principalAmount}
              hint="At least 1,000."
              required
            >
              {({ id, describedBy, invalid, required }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  name="principalAmount"
                  inputMode="decimal"
                  min="1000"
                  step="1000"
                  value={values.principalAmount}
                  invalid={invalid}
                  aria-invalid={invalid || undefined}
                  aria-required={required}
                  onChange={(e) => update('principalAmount', e.target.value)}
                />
              )}
            </Field>

            {selected ? (
              <Alert tone="info">
                {selected.label} carries a fixed rate of {formatPercent(selected.rate)} per annum.
                You will be asked for a tenure when the application is approved.
              </Alert>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-3">
              <Button type="submit" busy={busy}>
                {busy ? 'Submitting' : 'Submit application'}
              </Button>
              <Button variant="ghost" onClick={() => navigate('/loans')} disabled={busy}>
                Cancel
              </Button>
            </div>

            {values.principalAmount ? (
              <p className="text-xs text-slate-500">
                Requesting {formatCurrency(values.principalAmount)}.
              </p>
            ) : null}
          </form>
        </CardBody>
      </Card>
    </>
  );
}
