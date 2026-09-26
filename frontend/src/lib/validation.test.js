import { describe, expect, it } from 'vitest';
import {
  hasErrors,
  validateApproval,
  validateLoanApplication,
  validateLogin,
  validateRegistration,
} from './validation.js';

const VALID_CUSTOMER = {
  fullName: 'Asha Rao',
  dob: '1994-03-21',
  panNo: 'ABCDE1234F',
  phoneNo: '9876543210',
  email: 'asha.rao@example.com',
  branchCode: '101',
  password: 'correct-horse-battery',
};

describe('validateRegistration', () => {
  it('accepts a well-formed customer', () => {
    expect(validateRegistration(VALID_CUSTOMER)).toEqual({});
  });

  it.each([
    ['fullName', '', 'Full name is required'],
    ['phoneNo', '12345', 'Phone number must be exactly 10 digits'],
    ['panNo', 'ABCDE1234', 'PAN must match the format ABCDE1234F'],
    ['email', 'not-an-email', 'Enter a valid email address'],
    ['branchCode', '', 'Select a branch'],
  ])('rejects a bad %s', (field, value, message) => {
    const errors = validateRegistration({ ...VALID_CUSTOMER, [field]: value });
    expect(errors[field]).toBe(message);
  });

  it('rejects a date of birth in the future', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const errors = validateRegistration({
      ...VALID_CUSTOMER,
      dob: future.toISOString().slice(0, 10),
    });
    expect(errors.dob).toBe('Date of birth must be in the past');
  });

  it('enforces a minimum password length', () => {
    const errors = validateRegistration({ ...VALID_CUSTOMER, password: 'short' });
    expect(errors.password).toContain('at least 10');
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
