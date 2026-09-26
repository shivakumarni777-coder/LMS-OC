const TONES = {
  info: 'bg-brand-50 text-brand-900 ring-brand-200',
  success: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  danger: 'bg-rose-50 text-rose-900 ring-rose-200',
};

/**
 * Inline status message.
 *
 * `role="alert"` on the error tone makes assistive technology announce a
 * failure as soon as it appears, which matters because these are frequently
 * the result of a user action.
 */
export default function Alert({ tone = 'info', title, children, className = '' }) {
  const isError = tone === 'danger' || tone === 'warning';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={[
        'rounded-lg px-4 py-3 text-sm ring-1 ring-inset',
        TONES[tone] ?? TONES.info,
        className,
      ].join(' ')}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? 'mt-1' : undefined}>{children}</div> : null}
    </div>
  );
}
