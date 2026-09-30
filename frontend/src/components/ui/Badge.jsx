const TONES = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  info: 'bg-brand-50 text-brand-800 ring-brand-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  danger: 'bg-rose-50 text-rose-800 ring-rose-200',
};

/** Small status pill. Tone is paired with text, never used as the only signal. */
export default function Badge({ tone = 'neutral', children }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone] ?? TONES.neutral,
      ].join(' ')}
    >
      {children}
    </span>
  );
}

/**
 * Maps a status to a tone, so every screen colours the same status identically.
 *
 * `REJECTED` is here for the account-opening queue and for documents. It is not
 * a loan status - a loan is approved, disbursed or closed - but both of those
 * other workflows can be turned down, and a shared mapper is what stops a
 * rejection being rendered as a neutral pill on one screen and a red one on
 * another.
 */
export function statusTone(status) {
  switch (status) {
    case 'APPROVED':
    case 'VERIFIED':
      return 'success';
    case 'PENDING':
      return 'warning';
    case 'REJECTED':
      return 'danger';
    case 'DISBURSED':
      return 'info';
    case 'CLOSED':
      return 'neutral';
    default:
      return 'neutral';
  }
}
