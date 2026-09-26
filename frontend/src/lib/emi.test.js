import { describe, expect, it } from 'vitest';
import { estimateEmi, totalInterest } from './emi.js';

/**
 * These expectations are the same values the backend's EmiCalculator produces,
 * asserted in EmiCalculatorTest. If the two ever diverge, a figure shown to a
 * customer before approval would not match the one they are charged.
 */
describe('estimateEmi', () => {
  it('matches the backend for a 20-year home loan', () => {
    expect(estimateEmi(5000000, 8.5, 240)).toBe(43391.16);
  });

  it.each([
    [100000, 8.5, 120, 1239.86],
    [250000, 9, 60, 5189.59],
    [100000, 12.5, 36, 3345.36],
  ])('matches the backend for %d at %d%% over %d months', (p, rate, months, expected) => {
    expect(estimateEmi(p, rate, months)).toBe(expected);
  });

  it('amortises a zero-interest loan straight down', () => {
    // The general formula divides 0/0 here, so this is the case the backend
    // special-cases; the preview must agree.
    expect(estimateEmi(12000, 0, 12)).toBe(1000);
  });

  it.each([
    [0, 8.5, 12],
    [-100, 8.5, 12],
    [100000, 8.5, 0],
    [100000, 8.5, -12],
  ])('returns null for nonsensical input (%d, %d, %d)', (p, rate, months) => {
    expect(estimateEmi(p, rate, months)).toBeNull();
  });

  it('returns null rather than NaN when the tenure is not yet typed', () => {
    expect(estimateEmi(5000000, 8.5, '')).toBeNull();
  });
});

describe('totalInterest', () => {
  it('is the instalments minus the principal', () => {
    expect(totalInterest(5000000, 43391.16, 240)).toBe(5413878.4);
  });

  it('is zero for a 0% loan', () => {
    expect(totalInterest(12000, 1000, 12)).toBe(0);
  });

  it('returns null for missing input', () => {
    expect(totalInterest(5000000, null, 240)).toBeNull();
  });
});
