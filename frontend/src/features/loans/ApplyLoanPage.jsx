import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { applyForLoan } from '../../api/loanService.js';
import { LOAN_TYPES, hasErrors, validateLoanApplication } from '../../lib/validation.js';
import { formatCurrency, formatPercent } from '../../lib/format.js';
import Field, { SelectInput, TextInput } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';

const EMPTY = { accountNumber: '', loanType: '', principalAmount: '' };

export default function ApplyLoanPage({ defaultAccountNumber }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [values, setValues] = useState({ ...EMPTY, accountNumber: defaultAccountNumber ?? '' });
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);

  const selected = LOAN_TYPES.find((type) => type.value === values.loanType);

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFailure(null);

    const found = validateLoanApplication(values);
    setErrors(found);
    if (hasErrors(found)) {
      document.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    setBusy(true);
    try {
      const loan = await applyForLoan({
        accountNumber: Number(values.accountNumber.trim()),
        loanType: values.loanType,
        principalAmount: Number(values.principalAmount),
      });
      // The loan list and the dashboard both change as a result.
      await queryClient.invalidateQueries({ queryKey: ['loans'] });
      navigate('/loans', { state: { flash: `Application ${loan.loanId} submitted for review.` } });
    } catch (error) {
      setErrors(error.fieldErrors ?? {});
      setFailure(error.message ?? 'Could not submit the application.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Apply for a loan"
        description="Applications are reviewed by an administrator before they are approved."
      />

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
                  value={values.accountNumber}
                  invalid={invalid}
                  aria-invalid={invalid || undefined}
                  aria-required={required}
                  onChange={(e) => update('accountNumber', e.target.value.replace(/\D/g, ''))}
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
    </div>
  );
}
