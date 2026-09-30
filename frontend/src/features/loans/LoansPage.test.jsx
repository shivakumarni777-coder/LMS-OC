import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoansPage from './LoansPage.jsx';
import { listLoans } from '../../api/loanService.js';

vi.mock('../../api/loanService.js', () => ({
  listLoans: vi.fn(),
  approveLoan: vi.fn(),
  fetchLoanSummary: vi.fn(),
  applyForLoan: vi.fn(),
  getLoan: vi.fn(),
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
    // A pending loan's action is "Review", which opens the loan's own page.
    expect(screen.getByRole('link', { name: 'Review' })).toBeInTheDocument();
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

  it('sends the officer to the loan\'s own page rather than opening a dialog', async () => {
    listLoans.mockResolvedValue([PENDING_LOAN]);

    renderPage();

    // The review page, not a modal: deciding a loan means reading the applicant's
    // details and their documents, and a popover over a list has nowhere to put
    // either. Asserted on the href because that is the thing that changed.
    const review = await screen.findByRole('link', { name: 'Review' });
    expect(review).toHaveAttribute('href', '/loans/7');
  });

  it('still links a decided loan, so its details and documents stay reachable', async () => {
    listLoans.mockResolvedValue([
      { ...PENDING_LOAN, loanId: 8, loanStatus: 'APPROVED', tenureMonths: 240, monthlyEmi: 43391.16 },
    ]);

    renderPage();

    // Labelled "View" rather than "Review": there is nothing left to decide, but
    // the documents are still worth reading, and hiding the link would make them
    // unreachable from the list.
    expect(await screen.findByRole('link', { name: 'View' })).toHaveAttribute('href', '/loans/8');
    expect(screen.queryByRole('link', { name: 'Review' })).not.toBeInTheDocument();
  });

  it('offers no review link to a customer', async () => {
    ADMIN.isAdmin = false;
    listLoans.mockResolvedValue([PENDING_LOAN]);

    renderPage();

    await screen.findByText('Pending');
    // Approval is an officer's action. The column disappears entirely rather than
    // rendering an empty one.
    expect(screen.queryByRole('link', { name: 'Review' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View' })).not.toBeInTheDocument();
    ADMIN.isAdmin = true;
  });
});
