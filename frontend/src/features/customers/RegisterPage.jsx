import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { registerCustomer } from '../../api/customerService.js';
import {
  REGISTRATION_FIELDS,
  hasErrors,
  splitFieldErrors,
  validateRegistration,
} from '../../lib/validation.js';
import { useBranches } from '../../hooks/useCustomer.js';
import Field, { SelectInput, TextInput } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';

const EMPTY = {
  fullName: '',
  dob: '',
  phoneNo: '',
  email: '',
  branchCode: '',
  password: '',
};

/** Every key this form renders, for splitting the server's fieldErrors. */
const INPUT_KEYS = [
  REGISTRATION_FIELDS.password,
  REGISTRATION_FIELDS.fullName,
  REGISTRATION_FIELDS.dob,
  REGISTRATION_FIELDS.phoneNo,
  REGISTRATION_FIELDS.email,
  REGISTRATION_FIELDS.branchCode,
];

/**
 * Registration: create a login and a profile.
 *
 * No PAN and no account number, and that is the whole point of the page. A bank
 * account is opened separately, through a request an officer approves, because
 * a loan is booked against an account and an account is not something a web form
 * can grant itself. The PAN is collected on that later form, once, and asked for
 * as the one detail the bank does not already hold.
 *
 * So this page ends at "you have an account login", and the success screen says
 * exactly that rather than implying an account exists - telling someone their
 * account number is ready when none has been opened is the sort of small lie
 * that costs a support call later.
 */
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

    setBusy(true);
    try {
      const result = await registerCustomer({
        password: values.password,
        profile: {
          fullName: values.fullName.trim(),
          dob: values.dob,
          phoneNo: values.phoneNo.trim(),
          email: values.email.trim(),
          // The backend types this as an integer and the branch dropdown's
          // values are numeric, so it is sent as a number rather than the
          // string the select produces.
          branchCode: Number(values.branchCode),
        },
      });
      setCreated(result);
      queryClient.clear();
    } catch (error) {
      // The server's keys are already the cascaded paths this form validates on,
      // so they are used as-is. A message on the profile object itself has no
      // input to attach to and is shown at the top instead of being dropped.
      const { inputs, general } = splitFieldErrors(error.fieldErrors, INPUT_KEYS);
      setErrors(inputs);
      setFailure([...(general ?? []), error.message].filter(Boolean).join(' '));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <>
        <PageHeader
          title="Registration complete"
          description="Your login is ready. A bank account is a separate step."
        />
        <div className="mx-auto max-w-lg">
          <Alert tone="success" title={`Welcome, ${created.fullName}`}>
            <p>
              Sign in as <strong>{created.username}</strong> with the password you just chose.
            </p>
            <p className="mt-2">
              No bank account has been opened yet. Loans are booked against an account, so the next
              step is to request one: sign in, open <strong>Apply for a loan</strong>, and you will be
              asked for your PAN.
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
        description="Creates their login and profile. A bank account is opened separately."
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
              <Field label="Full name" error={errors[REGISTRATION_FIELDS.fullName]} required>
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

              <Field label="Date of birth" error={errors[REGISTRATION_FIELDS.dob]} required>
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
                label="Phone number"
                error={errors[REGISTRATION_FIELDS.phoneNo]}
                hint="Exactly 10 digits."
                required
              >
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
                error={errors[REGISTRATION_FIELDS.email]}
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

              <Field label="Branch" error={errors[REGISTRATION_FIELDS.branchCode]} required>
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
              error={errors[REGISTRATION_FIELDS.password]}
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
              Your PAN is not asked for here. It is collected once, when you request a bank account.
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
