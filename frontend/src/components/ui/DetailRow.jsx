/**
 * One label/value pair inside a `<dl>`.
 *
 * Extracted because the read-only detail pattern - "here is a field, here is its
 * value" - now appears on the account page, the account-request review screen and
 * the loan review screen, and three copies of the same ten lines is three places
 * to fix a formatting change.
 *
 * A `<div>` wrapper around the `<dt>`/`<dd>` pair is required: a `<dl>` may only
 * contain `dt`, `dd`, `div`, `script` or `template` children, and a bare pair per
 * row is exactly what the `div` is there to permit.
 *
 * @param {string} label
 * @param {React.ReactNode} value - rendered as given, so a caller can put a
 *   `Badge` here rather than flattening a status to text and losing its colour.
 * @param {boolean} [mono] - for identifiers that should be read digit by digit.
 */
export default function DetailRow({ label, value, mono = false }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={`text-right font-medium text-slate-900 ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value ?? '—'}
      </dd>
    </div>
  );
}
