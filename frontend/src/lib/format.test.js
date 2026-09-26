import { describe, expect, it } from 'vitest';
import {
  formatAccountNumber,
  formatCurrency,
  formatDate,
  formatPercent,
  formatStatus,
  toAmount,
} from './format.js';

describe('toAmount', () => {
  it('accepts a number', () => {
    expect(toAmount(1500.5)).toBe(1500.5);
  });

  it('accepts the string form a BigDecimal serialises to', () => {
    expect(toAmount('1500.50')).toBe(1500.5);
  });

  it.each([null, undefined, '', 'abc'])('returns null for %s', (value) => {
    expect(toAmount(value)).toBeNull();
  });
});

describe('formatCurrency', () => {
  // The formatter is deliberately en-IN: 5,000,000 reads as "50,00,000" and
  // compacts to "50L", which is how an Indian bank would state the figure.
  it('groups digits the Indian way', () => {
    expect(formatCurrency(5000000)).toBe('₹50,00,000.00');
  });

  it('compacts a large amount on request', () => {
    expect(formatCurrency(5000000, { compact: true })).toBe('₹50L');
  });

  it('leaves small amounts ungrouped', () => {
    expect(formatCurrency(43391.16)).toBe('₹43,391.16');
  });

  it('shows a dash for nothing', () => {
    expect(formatCurrency(null)).toBe('—');
  });
});

describe('formatAccountNumber', () => {
  it('groups a 12-digit number in fours', () => {
    expect(formatAccountNumber(304012345678)).toBe('3040 1234 5678');
  });

  it('does not leave a trailing space on an exact multiple of four', () => {
    expect(formatAccountNumber(3040123456780)).toBe('3040 1234 5678 0');
  });

  it('shows a dash for nothing', () => {
    expect(formatAccountNumber(undefined)).toBe('—');
  });
});

describe('formatDate', () => {
  it('formats an ISO date', () => {
    expect(formatDate('2026-09-27')).toBe('27 Sept 2026');
  });

  it.each([null, '', 'not-a-date'])('shows a dash for %s', (value) => {
    expect(formatDate(value)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('keeps two decimal places', () => {
    expect(formatPercent('8.5')).toBe('8.50%');
  });
});

describe('formatStatus', () => {
  it('title-cases the enum value', () => {
    expect(formatStatus('PENDING')).toBe('Pending');
  });

  it('falls back for a missing status', () => {
    expect(formatStatus(null)).toBe('Unknown');
  });
});
