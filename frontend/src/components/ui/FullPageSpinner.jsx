/**
 * Loading placeholder.
 *
 * `aria-busy` plus a visually hidden status message means the wait is
 * announced rather than being conveyed only by a moving element.
 */
export default function Spinner({ className = 'size-6', label = 'Loading' }) {
  return (
    <span role="status" aria-busy="true" className="inline-flex items-center gap-2">
      <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function FullPageSpinner({ label = 'Loading' }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-brand-600">
      <Spinner className="size-8" label={label} />
    </div>
  );
}
