import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { registerCustomer } from '../../api/customerService.js';
import { hasErrors, validateRegistration } from '../../lib/validation.js';
import { useBranches } from '../../hooks/useCustomer.js';
import Field, { SelectInput, TextInput } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';
import { formatAccountNumber } from '../../lib/format.js';

const EMPTY = {
  fullName: '',
  dob: '',
  panNo: '',
  phoneNo: '',
  email: '',
  branchCode: '',
  password: '',
};

/** Registration is public, so this page sits outside the authenticated shell. */
export default function RegisterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: branches = [], isLoading: branchesLoading } = useBranches();

  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFailure(null);

    const found = validateRegistration(values);
    setErrors(found);
    if (hasErrors(found)) {
      // Move focus to the first problem so keyboard and screen reader users
      // are not left guessing what went wrong.
      document.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    const { password, ...customer } = values;
    setBusy(true);
    try {
      const result = await registerCustomer({
        password,
        customer: {
          ...customer,
          branchCode: Number(customer.branchCode),
        },
      });
      setCreated(result);
      queryClient.clear();
    } catch (error) {
      setErrors(error.fieldErrors ?? {});
      setFailure(error.message ?? 'Registration failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <>
        <PageHeader title="Registration complete" description="The account is ready to use." />
        <div className="mx-auto max-w-lg">
          <Alert tone="success" title={`Welcome, ${created.customer.fullName}`}>
            <p>
              Your account number is{' '}
              <strong className="font-mono">{formatAccountNumber(created.customer.accountNumber)}</strong>.
            </p>
            <p className="mt-2">
              Sign in with <strong>{created.username}</strong> and the password you just chose.
            </p>
          </Alert>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => navigate('/login', { replace: true })}>Go to sign in</Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Register a customer"
        description="Creates the customer record and their login in one step."
      />

      {failure ? (
        <Alert tone="danger" title="Could not register" className="mb-4">
          {failure}
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Customer details" description="All fields are required for KYC." />
        <CardBody>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" error={errors.fullName} required>
                {({ id, describedBy, invalid, required }) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    name="fullName"
                    autoComplete="name"
                    value={values.fullName}
                    invalid={invalid}
                    aria-invalid={invalid || undefined}
                    aria-required={required}
                    onChange={(e) => update('fullName', e.target.value)}
                  />
                )}
              </Field>

              <Field label="Date of birth" error={errors.dob} required>
                {({ id, describedBy, invalid, required }) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    name="dob"
                    type="date"
                    value={values.dob}
                    invalid={invalid}
                    aria-invalid={invalid || undefined}
                    aria-required={required}
                    onChange={(e) => update('dob', e.target.value)}
                  />
                )}
              </Field>

              <Field
                label="PAN number"
                error={errors.panNo}
                hint="Ten characters, for example ABCDE1234F."
                required
              >
                {({ id, describedBy, invalid, required }) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    name="panNo"
                    maxLength={10}
                    spellCheck={false}
                    className="font-mono uppercase"
                    value={values.panNo}
                    invalid={invalid}
                    aria-invalid={invalid || undefined}
                    aria-required={required}
                    onChange={(e) => update('panNo', e.target.value.toUpperCase())}
                  />
                )}
              </Field>

              <Field label="Phone number" error={errors.phoneNo} hint="Exactly 10 digits." required>
                {({ id, describedBy, invalid, required }) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    name="phoneNo"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={10}
                    value={values.phoneNo}
                    invalid={invalid}
                    aria-invalid={invalid || undefined}
                    aria-required={required}
                    onChange={(e) => update('phoneNo', e.target.value.replace(/\D/g, ''))}
                  />
                )}
              </Field>

              <Field
                label="Email address"
                error={errors.email}
                hint="Also used as the sign-in username."
                required
              >
                {({ id, describedBy, invalid, required }) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={values.email}
                    invalid={invalid}
                    aria-invalid={invalid || undefined}
                    aria-required={required}
                    onChange={(e) => update('email', e.target.value)}
                  />
                )}
              </Field>

              <Field label="Branch" error={errors.branchCode} required>
                {({ id, describedBy, invalid, required }) => (
                  <SelectInput
                    id={id}
                    aria-describedby={describedBy}
                    name="branchCode"
                    value={values.branchCode}
                    invalid={invalid}
                    disabled={branchesLoading}
                    aria-invalid={invalid || undefined}
                    aria-required={required}
                    onChange={(e) => update('branchCode', e.target.value)}
                  >
                    <option value="">Select a branch</option>
                    {branches.map((branch) => (
                      <option key={branch.branchCode} value={branch.branchCode}>
                        {branch.branchCode} - {branch.branchName}
                      </option>
                    ))}
                  </SelectInput>
                )}
              </Field>
            </div>

            <Field
              label="Password"
              error={errors.password}
              hint="At least 10 characters. This is the password you will sign in with."
              required
            >
              {({ id, describedBy, invalid, required }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  value={values.password}
                  invalid={invalid}
                  aria-invalid={invalid || undefined}
                  aria-required={required}
                  onChange={(e) => update('password', e.target.value)}
                />
              )}
            </Field>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Button type="submit" busy={busy}>
                {busy ? 'Registering' : 'Register customer'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setValues(EMPTY);
                  setErrors({});
                  setFailure(null);
                }}
                disabled={busy}
              >
                Clear form
              </Button>
            </div>

            <p className="text-xs text-slate-500">
              Your PAN is used for KYC only and is never shown again after registration.
            </p>
          </form>
        </CardBody>
      </Card>

      <p className="mt-4 text-center text-sm text-slate-500">
        Already registered?{' '}
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
