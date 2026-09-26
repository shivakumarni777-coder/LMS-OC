const VARIANTS = {
  primary:
    'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 disabled:bg-brand-300',
  secondary:
    'bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 active:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-rose-700 text-white hover:bg-rose-800 active:bg-rose-900 disabled:bg-rose-300',
  ghost: 'text-slate-700 hover:bg-slate-100 active:bg-slate-200 disabled:text-slate-400',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-base',
};

/**
 * Button.
 *
 * `busy` keeps the button mounted but disabled and shows a spinner, so the
 * label does not shift and the control does not change size mid-submit.
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  disabled = false,
  type = 'button',
  className = '',
  children,
  ...rest
}) {
  const isDisabled = disabled || busy;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={busy || undefined}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
        'transition-colors duration-150 select-none',
        'disabled:cursor-not-allowed',
        VARIANTS[variant] ?? VARIANTS.primary,
        SIZES[size] ?? SIZES.md,
        className,
      ].join(' ')}
      {...rest}
    >
      {busy ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  );
}

function Spinner({ className = 'size-5' }) {
  return (
    <svg
      className={`${className} animate-spin`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
