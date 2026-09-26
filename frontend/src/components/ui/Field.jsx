import { useId } from 'react';

/**
 * Labelled form control.
 *
 * Wires up the label, hint and error to the input with matching ids so a screen
 * reader announces the constraint and any validation message together. The
 * hint and error ids are handed to the control through the render prop rather
 * than set on a wrapper element, because `aria-describedby` only works when it
 * is on the element being described.
 *
 * The render prop receives:
 *   - `id`         - put on the control and referenced by the label
 *   - `describedBy`- space-separated ids of the hint and error, if present
 *   - `invalid`    - true when there is an error, for `aria-invalid`
 *   - `required`   - pass to `aria-required` on the control
 *
 * Required state is carried by `aria-required`, not by hidden text in the
 * label. The accessible-name algorithm trims a leading space off every child
 * node, so a visually hidden " (required)" would be announced as
 * "Emailrequired"; `aria-required` is announced as the word "required".
 *
 * @example
 * <Field label="PAN" error={errors.pan} required>
 *   {({ id, describedBy, invalid, required }) => (
 *     <TextInput
 *       id={id}
 *       aria-describedby={describedBy}
 *       aria-invalid={invalid || undefined}
 *       aria-required={required}
 *     />
 *   )}
 * </Field>
 */
export default function Field({
  label,
  hint,
  error,
  required = false,
  children,
  className = '',
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : null;
  const errorId = error ? `${id}-error` : null;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
        {required ? (
          /* Decorative only. The state itself lives on the control as
             aria-required, which is what a screen reader actually announces;
             hidden text here would be merged into the name without a space. */
          <span aria-hidden="true" className="ml-0.5 text-rose-600">
            *
          </span>
        ) : null}
      </label>

      {hint ? (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}

      {typeof children === 'function' ? (
        // `undefined` rather than `false`: React renders aria-required="false"
        // instead of dropping the attribute, which is valid but noisy.
        children({ id, describedBy, invalid: Boolean(error), required: required || undefined })
      ) : (
        children
      )}

      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL_BASE =
  'w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 transition-colors ' +
  'focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none ' +
  'disabled:bg-slate-100 disabled:text-slate-500';

/** Shared control styling. `invalid` is presentational; aria-invalid is the signal. */
export function inputClassName(invalid) {
  return `${CONTROL_BASE} ${invalid ? 'border-rose-400' : 'border-slate-300'}`;
}

export function TextInput({ invalid, className = '', ...rest }) {
  return <input className={`${inputClassName(invalid)} ${className}`} {...rest} />;
}

export function SelectInput({ invalid, className = '', children, ...rest }) {
  return (
    <select className={`${inputClassName(invalid)} ${className}`} {...rest}>
      {children}
    </select>
  );
}
