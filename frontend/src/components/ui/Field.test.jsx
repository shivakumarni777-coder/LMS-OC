import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Field, { TextInput } from './Field.jsx';
import Button from './Button.jsx';

describe('Field', () => {
  it('associates the label with the input', () => {
    render(
      <Field label="Full name">
        {({ id, describedBy }) => <TextInput id={id} aria-describedby={describedBy} />}
      </Field>,
    );

    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
  });

  it('links the hint to the control so it is announced with the label', () => {
    render(
      <Field label="PAN" hint="Ten characters.">
        {({ id, describedBy }) => <TextInput id={id} aria-describedby={describedBy} />}
      </Field>,
    );

    // The hint must be on the input itself, not on a wrapper: aria-describedby
    // is ignored anywhere else, which is the bug this assertion guards against.
    expect(screen.getByLabelText(/PAN/)).toHaveAccessibleDescription('Ten characters.');
  });

  it('describes the control with both the hint and the error when both exist', () => {
    render(
      <Field label="PAN" hint="Ten characters." error="PAN must match the format ABCDE1234F">
        {({ id, describedBy, invalid }) => (
          <TextInput id={id} aria-describedby={describedBy} invalid={invalid} />
        )}
      </Field>,
    );

    const input = screen.getByLabelText(/PAN/);
    expect(input).toHaveAccessibleDescription(/Ten characters\./);
    expect(input).toHaveAccessibleDescription(/ABCDE1234F/);
  });

  it('exposes a validation message as an alert and marks the field invalid', () => {
    render(
      <Field label="PAN" error="PAN must match the format ABCDE1234F">
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            aria-invalid={invalid}
          />
        )}
      </Field>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('PAN must match the format ABCDE1234F');
    expect(screen.getByLabelText(/PAN/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('conveys the required state programmatically, not via the asterisk', () => {
    render(
      <Field label="Email" required>
        {({ id, describedBy, invalid, required }) => (
          <TextInput
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            aria-required={required}
          />
        )}
      </Field>,
    );

    const input = screen.getByRole('textbox', { name: 'Email' });

    // The asterisk is aria-hidden decoration. `aria-required` is what a screen
    // reader announces, so that is what has to be set.
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAccessibleName('Email');
  });

  it('omits aria-required on an optional field', () => {
    render(
      <Field label="Nickname">
        {({ id, describedBy, required }) => (
          <TextInput id={id} aria-describedby={describedBy} aria-required={required} />
        )}
      </Field>,
    );

    expect(screen.getByRole('textbox', { name: 'Nickname' })).not.toHaveAttribute('aria-required');
  });

  it('describes the control with the error text so it is announced on focus', () => {
    render(
      <Field label="PAN" error="PAN must match the format ABCDE1234F">
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>,
    );

    expect(screen.getByLabelText(/PAN/)).toHaveAccessibleDescription(/ABCDE1234F/);
  });
});

describe('Button', () => {
  it('defaults to type=button so it cannot submit a form by accident', () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole('button', { name: 'Click' })).toHaveAttribute('type', 'button');
  });

  it('disables itself while busy and reports that to assistive tech', () => {
    render(<Button busy>Saving</Button>);
    const button = screen.getByRole('button', { name: /Saving/ });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});
