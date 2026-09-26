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

export const BRANCHES = [
  { value: 101, label: '101 - Main Street' },
  { value: 102, label: '102 - Central Avenue' },
  { value: 103, label: '103 - Park Road' },
  { value: 104, label: '104 - Riverside' },
  { value: 105, label: '105 - Hillview' },
];

/** @returns {Record<string, string>} field name -> message; empty when valid. */
export function validateRegistration(values) {
  const errors = {};

  if (!values.fullName?.trim()) {
    errors.fullName = 'Full name is required';
  } else if (values.fullName.trim().length > 100) {
    errors.fullName = 'Full name cannot exceed 100 characters';
  }

  if (!values.dob) {
    errors.dob = 'Date of birth is required';
  } else if (new Date(values.dob) >= new Date()) {
    errors.dob = 'Date of birth must be in the past';
  }

  if (!values.panNo?.trim()) {
    errors.panNo = 'PAN is required for KYC';
  } else if (!PAN_PATTERN.test(values.panNo.trim().toUpperCase())) {
    errors.panNo = 'PAN must match the format ABCDE1234F';
  }

  if (!values.phoneNo?.trim()) {
    errors.phoneNo = 'Phone number is required';
  } else if (!PHONE_PATTERN.test(values.phoneNo.trim())) {
    errors.phoneNo = 'Phone number must be exactly 10 digits';
  }

  if (!values.email?.trim()) {
    errors.email = 'Email is required';
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'Enter a valid email address';
  }

  if (!values.branchCode) {
    errors.branchCode = 'Select a branch';
  }

  if (!values.password) {
    errors.password = 'Password is required';
  } else if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
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

  if (!values.accountNumber?.trim()) {
    errors.accountNumber = 'Account number is required';
  } else if (!/^\d{1,15}$/.test(values.accountNumber.trim())) {
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
