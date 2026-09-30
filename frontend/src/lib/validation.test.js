import { describe, expect, it } from 'vitest';
import {
  REGISTRATION_FIELDS,
  hasErrors,
  normalisePan,
  splitFieldErrors,
  validateAccountOpening,
  validateApproval,
  validateLoanApplication,
  validateLogin,
  validateRegistration,
} from './validation.js';

// No PAN, and no account number: registration creates a login and a profile,
// nothing more. The PAN moved to the account-opening form, which is the only
// place it is asked for.
const VALID_CUSTOMER = {
  fullName: 'Asha Rao',
  dob: '1994-03-21',
  phoneNo: '9876543210',
  email: 'asha.rao@example.com',
  branchCode: '101',
  password: 'correct-horse-battery',
};

const F = REGISTRATION_FIELDS;

describe('validateRegistration', () => {
  it('accepts a well-formed customer', () => {
    expect(validateRegistration(VALID_CUSTOMER)).toEqual({});
  });

  // Asserted against the cascaded keys the server itself reports under. If these
  // ever drift back to bare field names, server-side validation messages stop
  // being displayed anywhere - the form submits, is rejected, and the user is
  // told nothing about why.
  it.each([
    ['fullName', '', 'Full name is required'],
    ['phoneNo', '12345', 'Phone number must be exactly 10 digits'],
    ['email', 'not-an-email', 'Enter a valid email address'],
    ['branchCode', '', 'Select a branch'],
  ])('rejects a bad %s under its nested key', (field, value, message) => {
    const errors = validateRegistration({ ...VALID_CUSTOMER, [field]: value });
    expect(errors[F[field]]).toBe(message);
  });

  it('keeps password, which is not nested, unprefixed', () => {
    const errors = validateRegistration({ ...VALID_CUSTOMER, password: '' });
    expect(errors[F.password]).toBe('Password is required');
    // The prefix is applied to profile fields only; prefixing the top-level one
    // would invent a key the server never sends.
    expect(errors['profile.password']).toBeUndefined();
  });

  it('never asks for a PAN', () => {
    const errors = validateRegistration(VALID_CUSTOMER);
    expect(Object.keys(errors).some((key) => key.toLowerCase().includes('pan'))).toBe(false);
  });

  it('rejects a date of birth in the future', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const errors = validateRegistration({
      ...VALID_CUSTOMER,
      dob: future.toISOString().slice(0, 10),
    });
    expect(errors[F.dob]).toBe('Date of birth must be in the past');
  });

  it('enforces a minimum password length', () => {
    const errors = validateRegistration({ ...VALID_CUSTOMER, password: 'short' });
    expect(errors[F.password]).toContain('at least 10');
  });
});

describe('validateAccountOpening', () => {
  it('accepts a well-formed PAN', () => {
    expect(validateAccountOpening({ panNo: 'ABCDE1234F' })).toEqual({});
  });

  it('accepts a lower-case PAN, which the server also accepts once upper-cased', () => {
    // The server's pattern is upper-case only, so a lower-case PAN is sent
    // upper-cased. Validation therefore tests the normalised value, or it would
    // reject a PAN the user typed correctly on a lower-case keyboard.
    expect(validateAccountOpening({ panNo: 'abcde1234f' })).toEqual({});
  });

  it.each([
    ['', 'PAN is required'],
    ['   ', 'PAN is required'],
    ['ABCDE1234', 'PAN must match the format ABCDE1234F'],
    ['12345ABCDE', 'PAN must match the format ABCDE1234F'],
  ])('rejects %j', (panNo, message) => {
    expect(validateAccountOpening({ panNo }).panNo).toBe(message);
  });

  it('keys errors on the bare field name, because the body is flat', () => {
    expect(Object.keys(validateAccountOpening({ panNo: '' }))).toEqual(['panNo']);
  });
});

describe('normalisePan', () => {
  it('upper-cases, because the backend pattern is upper-case only', () => {
    expect(normalisePan('abcde1234f')).toBe('ABCDE1234F');
  });

  it('leaves digits alone and tolerates being given nothing', () => {
    expect(normalisePan('abcde1234f'.slice(0, 0) + '12345')).toBe('12345');
    expect(normalisePan(undefined)).toBe('');
  });
});

describe('splitFieldErrors', () => {
  it('routes each message to the input it belongs to', () => {
    const { inputs, general } = splitFieldErrors(
      { 'profile.fullName': 'Full name cannot be blank', 'profile.email': 'Email is required' },
      ['profile.fullName', 'profile.email'],
    );

    expect(inputs).toEqual({
      'profile.fullName': 'Full name cannot be blank',
      'profile.email': 'Email is required',
    });
    expect(general).toEqual([]);
  });

  it('collects a message on the object itself, which has no input', () => {
    // The backend answers a request with no profile at all with `profile: ...`.
    // Painting that against a field called "profile" would be inventing a control,
    // and dropping it would leave the user with no reason at all.
    const { inputs, general } = splitFieldErrors(
      { profile: 'Customer details are required' },
      ['profile.fullName'],
    );

    expect(inputs).toEqual({});
    expect(general).toEqual(['Customer details are required']);
  });

  it('copes with no errors at all', () => {
    expect(splitFieldErrors(undefined, ['panNo'])).toEqual({ inputs: {}, general: [] });
  });
});

describe('validateLogin', () => {
  it('requires both fields', () => {
    expect(validateLogin({})).toEqual({
      username: 'Username is required',
      password: 'Password is required',
    });
  });

  it('accepts a filled form', () => {
    expect(validateLogin({ username: 'a@b.com', password: 'x' })).toEqual({});
  });
});

describe('validateLoanApplication', () => {
  const valid = { accountNumber: '304012345678', loanType: 'HOME', principalAmount: '5000000' };

  it('accepts a well-formed application', () => {
    expect(validateLoanApplication(valid)).toEqual({});
  });

  it('rejects a non-numeric account number', () => {
    expect(validateLoanApplication({ ...valid, accountNumber: 'ABC123' }).accountNumber).toContain(
      'digits only',
    );
  });

  it('accepts a numeric account number, as the status response supplies it', () => {
    // The account-status response types the number as a Long, so JSON hands the
    // form a number rather than the string an input would produce. Validating
    // with .trim() on it would throw a TypeError on submit, and only for the
    // customers whose number was pre-filled for them.
    expect(validateLoanApplication({ ...valid, accountNumber: 304012345678 })).toEqual({});
  });

  it('treats a missing account number as required rather than throwing', () => {
    expect(validateLoanApplication({ ...valid, accountNumber: undefined }).accountNumber).toBe(
      'Account number is required',
    );
  });

  it('rejects an amount below the floor', () => {
    expect(validateLoanApplication({ ...valid, principalAmount: '500' }).principalAmount).toContain(
      'at least',
    );
  });

  it('rejects a non-numeric amount', () => {
    expect(validateLoanApplication({ ...valid, principalAmount: 'lots' }).principalAmount).toBe(
      'Enter a valid amount',
    );
  });
});

describe('validateApproval', () => {
  it('accepts a whole number of months in range', () => {
    expect(validateApproval({ tenureMonths: '240' })).toEqual({});
  });

  it.each([
    ['', 'Tenure is required'],
    ['0', 'at least 1'],
    ['-5', 'at least 1'],
    ['12.5', 'whole number'],
    ['481', 'cannot exceed 480'],
  ])('rejects a tenure of %s', (value, message) => {
    expect(validateApproval({ tenureMonths: value }).tenureMonths).toContain(message);
  });
});

describe('hasErrors', () => {
  it('is false for an empty object', () => {
    expect(hasErrors({})).toBe(false);
  });

  it('is true when any key is present', () => {
    expect(hasErrors({ a: 'b' })).toBe(true);
  });
});
