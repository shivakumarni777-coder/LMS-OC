import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RegisterPage from './RegisterPage.jsx';
import { registerCustomer } from '../../api/customerService.js';
import { listBranches } from '../../api/customerService.js';

vi.mock('../../api/customerService.js', () => ({
  registerCustomer: vi.fn(),
  listBranches: vi.fn(),
  getCustomerByAccount: vi.fn(),
  getCustomerLoans: vi.fn(),
}));

const BRANCHES = [
  { branchCode: 101, branchName: 'Main Street' },
  { branchCode: 102, branchName: 'Central Avenue' },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/register']}>
        <RegisterPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Fills every field, so a test can vary exactly one of them. */
async function fillForm(overrides = {}) {
  const values = {
    'Full name': 'Asha Rao',
    'Date of birth': '1994-03-21',
    'Phone number': '9876543210',
    'Email address': 'asha.rao@example.com',
    ...overrides,
  };

  for (const [label, value] of Object.entries(values)) {
    const field = screen.getByLabelText(new RegExp(label, 'i'));
    await userEvent.clear(field);
    await userEvent.type(field, value);
  }

  await userEvent.selectOptions(screen.getByLabelText(/branch/i), '101');
  await userEvent.type(screen.getByLabelText(/password/i), 'correct-horse-battery');
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listBranches.mockResolvedValue(BRANCHES);
  });

  it('never asks for a PAN', async () => {
    renderPage();

    await screen.findByLabelText(/full name/i);
    // A PAN here would be stored with no customer record to hang it on, which is
    // the reason the account-opening step exists at all.
    expect(screen.queryByLabelText(/pan/i)).not.toBeInTheDocument();
  });

  it('sends the password and the profile as separate top-level fields', async () => {
    registerCustomer.mockResolvedValue({
      username: 'asha.rao@example.com',
      fullName: 'Asha Rao',
      email: 'asha.rao@example.com',
    });

    renderPage();
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: /register customer/i }));

    await waitFor(() =>
      expect(registerCustomer).toHaveBeenCalledWith({
        password: 'correct-horse-battery',
        profile: {
          fullName: 'Asha Rao',
          dob: '1994-03-21',
          phoneNo: '9876543210',
          email: 'asha.rao@example.com',
          // A number, not the string the select produces: the backend's field is
          // an integer and a non-numeric body would not bind to it.
          branchCode: 101,
        },
      }),
    );
  });

  it('confirms a login rather than an account, because none is opened here', async () => {
    registerCustomer.mockResolvedValue({
      username: 'asha.rao@example.com',
      fullName: 'Asha Rao',
      email: 'asha.rao@example.com',
    });

    renderPage();
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: /register customer/i }));

    expect(await screen.findByText(/Welcome, Asha Rao/)).toBeInTheDocument();
    // Claiming an account number exists would be a small lie that costs a
    // support call when the customer goes looking for it.
    expect(screen.getByText(/No bank account has been opened yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/account number is/i)).not.toBeInTheDocument();
  });

  it('displays a server field error against the field it belongs to', async () => {
    registerCustomer.mockRejectedValue({
      status: 400,
      message: 'Request validation failed.',
      // The cascaded key the backend actually sends for a field inside profile.
      fieldErrors: { 'profile.email': 'That email address is already registered' },
    });

    renderPage();
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: /register customer/i }));

    // The whole point of matching the server's key: had the form keyed this
    // `email`, the message would be displayed nowhere and the user would be told
    // registration failed with no reason given.
    expect(
      await screen.findByText('That email address is already registered'),
    ).toBeInTheDocument();
  });

  it('shows a violation on the profile object itself, which has no input', async () => {
    registerCustomer.mockRejectedValue({
      status: 400,
      message: 'Request validation failed.',
      fieldErrors: { profile: 'Customer details are required' },
    });

    renderPage();
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: /register customer/i }));

    // There is no control named "profile", so this belongs at the top rather than
    // being dropped or painted over the wrong input.
    expect(await screen.findByText(/Customer details are required/)).toBeInTheDocument();
  });

  it('blocks submission on a client-side failure without calling the server', async () => {
    renderPage();
    await fillForm({ 'Phone number': '123' });
    await userEvent.click(screen.getByRole('button', { name: /register customer/i }));

    // The full message, not a fragment: the hint under the field also says
    // "Exactly 10 digits", so a loose match would pass against the wrong node.
    expect(await screen.findByText('Phone number must be exactly 10 digits')).toBeInTheDocument();
    expect(registerCustomer).not.toHaveBeenCalled();
  });

  it('reports a non-field failure, such as a duplicate login', async () => {
    registerCustomer.mockRejectedValue({
      status: 409,
      message: 'That email address is already registered.',
      fieldErrors: {},
    });

    renderPage();
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: /register customer/i }));

    expect(await screen.findByText(/Could not register/i)).toBeInTheDocument();
  });
});
