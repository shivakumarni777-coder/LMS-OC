/**
 * Display formatting.
 *
 * Kept in one module so currency and date rendering is consistent everywhere
 * and so tests can assert on a single definition.
 */

const CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const COMPACT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** The backend may serialise BigDecimal as a number or a string. */
export function toAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatCurrency(value, { compact = false } = {}) {
  const amount = toAmount(value);
  if (amount === null) return '—';
  return (compact ? COMPACT_CURRENCY : CURRENCY).format(amount);
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATE.format(date);
}

/** 304012345678 -> "3040 1234 5678" */
export function formatAccountNumber(value) {
  if (value === null || value === undefined) return '—';
  return String(value).replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

export function formatPercent(value) {
  const amount = toAmount(value);
  return amount === null ? '—' : `${amount.toFixed(2)}%`;
}

/** Human label for a loan status, used for badges and headings. */
export function formatStatus(status) {
  if (!status) return 'Unknown';
  return status.charAt(0) + status.slice(1).toLowerCase();
}
