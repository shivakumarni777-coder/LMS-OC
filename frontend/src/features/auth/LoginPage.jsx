import { useState } from 'react';
import { Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { hasErrors, validateLogin } from '../../lib/validation.js';
import Field, { TextInput } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Spinner from '../../components/ui/FullPageSpinner.jsx';

const EMPTY = { username: '', password: '' };

export default function LoginPage() {
  const { signIn, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);

  // Already signed in: send them where they were originally headed.
  if (status === 'authenticated') {
    return <Navigate to={location.state?.from?.pathname ?? '/'} replace />;
  }
  if (status === 'loading') {
    return <Spinner className="mx-auto mt-24 size-8" label="Loading" />;
  }

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFailure(null);

    const found = validateLogin(values);
    setErrors(found);
    if (hasErrors(found)) return;

    setBusy(true);
    try {
      await signIn(values);
      navigate(location.state?.from?.pathname ?? '/', { replace: true });
    } catch (error) {
      setFailure(
        error.status === 401
          ? 'That username and password combination was not recognised.'
          : (error.message ?? 'Sign in failed. Please try again.'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-4 py-12">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-brand-700 text-xl font-bold text-white"
          >
            L
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">
            Loan Management System
          </p>
        </div>

        {failure ? (
          <Alert tone="danger" className="mb-4">
            {failure}
          </Alert>
        ) : null}

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Field label="Username" error={errors.username} required>
            {({ id, describedBy, invalid, required }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                name="username"
                autoComplete="username"
                autoFocus
                value={values.username}
                invalid={invalid}
                aria-invalid={invalid || undefined}
                aria-required={required}
                onChange={(event) => update('username', event.target.value)}
              />
            )}
          </Field>

          <Field label="Password" error={errors.password} required>
            {({ id, describedBy, invalid, required }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                name="password"
                type="password"
                autoComplete="current-password"
                value={values.password}
                invalid={invalid}
                aria-invalid={invalid || undefined}
                aria-required={required}
                onChange={(event) => update('password', event.target.value)}
              />
            )}
          </Field>

          <Button type="submit" size="lg" busy={busy} className="mt-2 w-full">
            {busy ? 'Signing in' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Need an account?{' '}
          <Link to="/register" className="font-medium text-brand-700 hover:underline">
            Register as a customer
          </Link>
        </p>
      </div>
    </div>
  );
}
