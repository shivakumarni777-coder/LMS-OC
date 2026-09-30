/**
 * Client-side validation.
 *
 * These rules mirror the bean validation on the backend DTOs. They exist to
 * give immediate feedback, not as a security control: the server validates
 * every request independently and its `fieldErrors` are what the UI ultimately
 * displays.
 */

export const LOAN_TYPES = [
  { value: 'HOME', label: 'Home loan', rate: '8.50%' },
  { value: 'EDUCATION', label: 'Education loan', rate: '9.00%' },
  { value: 'PERSONAL', label: 'Personal loan', rate: '12.50%' },
];

export const TENURE_PRESETS = [12, 24, 36, 60, 120, 240, 360];

export const MIN_PRINCIPAL = 1000;
export const MIN_PASSWORD_LENGTH = 10;

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const PHONE_PATTERN = /^\d{10}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Field names, as one object rather than as string literals at each use site.
 *
 * The server keys its `fieldErrors` by the *cascaded* path of the field - a
 * violation inside `profile` arrives as `profile.fullName`, not `fullName` - so
 * the keys the client uses have to match those exactly. When the two drift apart
 * the visible failure is silent and nasty: the form submits, the server
 * correctly rejects it, and the message is displayed nowhere, so the user is
 * told registration failed and given no reason.
 */
export const REGISTRATION_FIELDS = {
  password: 'password',
  fullName: 'profile.fullName',
  dob: 'profile.dob',
  phoneNo: 'profile.phoneNo',
  email: 'profile.email',
  branchCode: 'profile.branchCode',
  profile: 'profile',
};

/**
 * Upper-cases a PAN before it is sent.
 *
 * The backend's pattern is `[A-Z]{5}[0-9]{4}[A-Z]`, which is not case
 * insensitive, so a lowercase PAN is rejected outright. Sending what the user
 * typed would therefore fail on a detail they have no way to know about, and the
 * server's message ("PAN must match the format ABCDE1234F") would be
 * indistinguishable from having typed the wrong PAN.
 */
export function normalisePan(panNo) {
  return panNo?.toUpperCase() ?? '';
}

/** @returns {Record<string, string>} field name -> message; empty when valid. */
export function validateRegistration(values) {
  const errors = {};
  const F = REGISTRATION_FIELDS;

  if (!values.fullName?.trim()) {
    errors[F.fullName] = 'Full name is required';
  } else if (values.fullName.trim().length > 100) {
    errors[F.fullName] = 'Full name cannot exceed 100 characters';
  }

  if (!values.dob) {
    errors[F.dob] = 'Date of birth is required';
  } else if (new Date(values.dob) >= new Date()) {
    errors[F.dob] = 'Date of birth must be in the past';
  }

  if (!values.phoneNo?.trim()) {
    errors[F.phoneNo] = 'Phone number is required';
  } else if (!PHONE_PATTERN.test(values.phoneNo.trim())) {
    errors[F.phoneNo] = 'Phone number must be exactly 10 digits';
  }

  if (!values.email?.trim()) {
    errors[F.email] = 'Email is required';
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors[F.email] = 'Enter a valid email address';
  }

  if (!values.branchCode) {
    errors[F.branchCode] = 'Select a branch';
  }

  if (!values.password) {
    errors[F.password] = 'Password is required';
  } else if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors[F.password] = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  return errors;
}

/**
 * The account-opening form, which asks for a PAN and nothing else.
 *
 * A separate function from {@link validateRegistration} rather than one function
 * covering both forms, because the two are genuinely different questions: the
 * profile is about who the person is and is fixed at registration, whereas the
 * PAN is the single identifier the bank does not already hold. Sharing a
 * validator would invite the PAN to drift back into registration, which is the
 * mistake this flow exists to undo.
 *
 * @param {{panNo: string}} values
 * @returns {Record<string, string>} keyed `panNo` - a flat body, so the
 *   server's key for it is the bare name.
 */
export function validateAccountOpening(values) {
  const errors = {};
  const pan = values.panNo?.trim();

  if (!pan) {
    errors.panNo = 'PAN is required';
  } else if (!PAN_PATTERN.test(normalisePan(pan))) {
    errors.panNo = 'PAN must match the format ABCDE1234F';
  }

  return errors;
}

export function validateLogin(values) {
  const errors = {};
  if (!values.username?.trim()) errors.username = 'Username is required';
  if (!values.password) errors.password = 'Password is required';
  return errors;
}

export function validateLoanApplication(values) {
  const errors = {};

  // Coerced to a string first, because the account number reaches this form from
  // two directions with two types: a `Long` in the account-status response, and
  // a string from the input. Calling `.trim()` on the number would throw a
  // TypeError on submit, which surfaces as an unhandled rejection rather than as
  // a validation message - and only for a customer whose number was pre-filled.
  const accountNumber = values.accountNumber == null ? '' : String(values.accountNumber).trim();

  if (!accountNumber) {
    errors.accountNumber = 'Account number is required';
  } else if (!/^\d{1,15}$/.test(accountNumber)) {
    errors.accountNumber = 'Account number must be digits only';
  }

  if (!values.loanType) {
    errors.loanType = 'Select a loan type';
  }

  const amount = Number(values.principalAmount);
  if (!values.principalAmount) {
    errors.principalAmount = 'Principal amount is required';
  } else if (!Number.isFinite(amount)) {
    errors.principalAmount = 'Enter a valid amount';
  } else if (amount < MIN_PRINCIPAL) {
    errors.principalAmount = `Amount must be at least ${MIN_PRINCIPAL.toLocaleString('en-IN')}`;
  }

  return errors;
}

export function validateApproval(values) {
  const errors = {};
  const tenure = Number(values.tenureMonths);

  if (!values.tenureMonths) {
    errors.tenureMonths = 'Tenure is required';
  } else if (!Number.isInteger(tenure) || tenure < 1) {
    errors.tenureMonths = 'Tenure must be a whole number of months, at least 1';
  } else if (tenure > 480) {
    errors.tenureMonths = 'Tenure cannot exceed 480 months (40 years)';
  }

  return errors;
}

export function hasErrors(errors) {
  return Object.keys(errors).length > 0;
}

/**
 * Splits a server `fieldErrors` map into messages that belong to a visible input
 * and messages that belong to none.
 *
 * Needed because a violation on a nested object arrives under the object's own
 * key - the backend answers a request with no `profile` at all with
 * `profile: "Customer details are required"`, not with one entry per missing
 * sub-field. There is no input named `profile` to attach that to, so rendering
 * the map verbatim would either drop the message or paint it against the wrong
 * control. Anything unrecognised is collected and shown once, at the top, which
 * is where a message about the shape of the submission belongs.
 *
 * Client-side keys are deliberately identical to the server's, so the common
 * case is a straight copy and this only has to catch the oddity.
 *
 * @param {Record<string, string>|undefined} fieldErrors
 * @param {string[]} inputKeys - the keys this form actually renders
 * @returns {{inputs: Record<string, string>, general: string[]}}
 */
export function splitFieldErrors(fieldErrors, inputKeys) {
  const known = new Set(inputKeys);
  const inputs = {};
  const general = [];

  Object.entries(fieldErrors ?? {}).forEach(([key, message]) => {
    if (known.has(key)) {
      inputs[key] = message;
    } else {
      general.push(message);
    }
  });

  return { inputs, general };
}
