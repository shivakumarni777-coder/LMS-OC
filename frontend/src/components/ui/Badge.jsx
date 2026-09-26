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

/** Maps a loan status to a tone, so every screen colours it identically. */
export function statusTone(status) {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'PENDING':
      return 'warning';
    case 'DISBURSED':
      return 'info';
    case 'CLOSED':
      return 'neutral';
    default:
      return 'neutral';
  }
}
