export function Card({ className = '', children, ...rest }) {
  return (
    <div
      className={`rounded-[var(--radius-card)] bg-white shadow-sm ring-1 ring-slate-200/70 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, description, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className = '', children }) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

/** A labelled figure for the dashboard. */
export function StatTile({ label, value, hint, tone = 'default' }) {
  const toneClass =
    tone === 'brand'
      ? 'text-brand-700'
      : tone === 'positive'
        ? 'text-emerald-700'
        : tone === 'caution'
          ? 'text-amber-700'
          : 'text-slate-900';

  return (
    <Card className="px-5 py-4">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </Card>
  );
}
