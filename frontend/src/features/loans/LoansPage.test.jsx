import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoansPage from './LoansPage.jsx';
import { approveLoan, listLoans } from '../../api/loanService.js';

vi.mock('../../api/loanService.js', () => ({
  listLoans: vi.fn(),
  approveLoan: vi.fn(),
  fetchLoanSummary: vi.fn(),
  applyForLoan: vi.fn(),
}));

const ADMIN = { user: { role: 'ADMIN', accountNumber: null }, isAdmin: true };

vi.mock('../../auth/AuthProvider.jsx', () => ({
  useAuth: () => ADMIN,
}));

const PENDING_LOAN = {
  loanId: 7,
  accountNumber: 304012345678,
  loanType: 'HOME',
  principalAmount: 5000000,
  interestRate: 8.5,
  loanStatus: 'PENDING',
  applicationDate: '2026-09-20',
  tenureMonths: null,
  monthlyEmi: null,
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/loans']}>
        <LoansPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoansPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the loans the caller is allowed to see', async () => {
    listLoans.mockResolvedValue([PENDING_LOAN]);

    renderPage();

    // Indian digit grouping: 5,000,000 renders as 50,00,000.
    expect(await screen.findByText('₹50,00,000.00')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('shows an empty state rather than a bare table when there is nothing', async () => {
    listLoans.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('No loans to show')).toBeInTheDocument();
  });

  it('filters to pending applications when asked for the approval queue', async () => {
    listLoans.mockResolvedValue([
      PENDING_LOAN,
      { ...PENDING_LOAN, loanId: 8, loanStatus: 'APPROVED', monthlyEmi: 43391.16, tenureMonths: 240 },
    ]);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/loans/pending']}>
          <LoansPage pendingOnly />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText('Awaiting decision');
    // The approved loan is filtered out, so only one row remains.
    expect(screen.getAllByRole('row')).toHaveLength(2); // header + one loan
  });

  it('previews the EMI as the tenure is chosen, then approves', async () => {
    const user = userEvent.setup();
    listLoans.mockResolvedValue([PENDING_LOAN]);
    approveLoan.mockResolvedValue({
      ...PENDING_LOAN,
      loanStatus: 'APPROVED',
      tenureMonths: 240,
      monthlyEmi: 43391.16,
    });

    renderPage();
    await screen.findByRole('button', { name: 'Approve' });
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    // The preset buttons make the tenure easy to set in a test and in use.
    await user.click(screen.getByRole('button', { name: '240m' }));

    expect(await screen.findByText('₹43,391.16')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm approval' }));

    await waitFor(() => {
      expect(approveLoan).toHaveBeenCalledWith(7, { tenureMonths: 240 });
    });
    expect(await screen.findByText(/Loan 7 approved/)).toBeInTheDocument();
  });

  it('surfaces a server-side validation message on the tenure field', async () => {
    const user = userEvent.setup();
    listLoans.mockResolvedValue([PENDING_LOAN]);
    approveLoan.mockRejectedValue(
      Object.assign(new Error('Tenure is required'), {
        status: 400,
        fieldErrors: { tenureMonths: 'Tenure must be at least 1 month' },
      }),
    );

    renderPage();
    await screen.findByRole('button', { name: 'Approve' });
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await user.type(screen.getByLabelText(/Tenure in months/), '240');
    await user.click(screen.getByRole('button', { name: 'Confirm approval' }));

    expect(await screen.findByText('Tenure must be at least 1 month')).toBeInTheDocument();
  });

  it('offers no approval control to a customer', async () => {
    ADMIN.isAdmin = false;
    listLoans.mockResolvedValue([PENDING_LOAN]);

    renderPage();

    await screen.findByText('Pending');
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    ADMIN.isAdmin = true;
  });
});
