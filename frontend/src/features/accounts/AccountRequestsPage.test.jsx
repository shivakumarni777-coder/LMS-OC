import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountRequestsPage from './AccountRequestsPage.jsx';
import { listAccountRequests } from '../../api/accountService.js';

vi.mock('../../api/accountService.js', () => ({
  listAccountRequests: vi.fn(),
  getAccountRequest: vi.fn(),
  reviewAccountRequest: vi.fn(),
  getAccountStatus: vi.fn(),
  requestAccountOpening: vi.fn(),
  // A value the page imports, so a mock that omits it leaves the filter row
  // unable to render at all.
  ACCOUNT_REQUEST_STATUSES: ['PENDING', 'APPROVED', 'REJECTED'],
}));

const PENDING_REQUEST = {
  requestId: 11,
  status: 'PENDING',
  panNo: 'ABCDE1234F',
  fullName: 'Asha Rao',
  email: 'asha.rao@example.com',
  phoneNo: '9876543210',
  dob: '1994-03-21',
  branchCode: 101,
  requestedAt: '2026-09-20T09:15:00Z',
};

const REJECTED_REQUEST = {
  ...PENDING_REQUEST,
  requestId: 12,
  status: 'REJECTED',
  panNo: 'ZXCVB9876K',
  fullName: 'Bilal Khan',
  email: 'bilal.khan@example.com',
  reviewedAt: '2026-09-22T11:00:00Z',
  reviewNotes: 'The PAN could not be matched against any record.',
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/accounts/requests']}>
        <AccountRequestsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AccountRequestsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the queue with the applicant details an officer needs', async () => {
    listAccountRequests.mockResolvedValue([PENDING_REQUEST, REJECTED_REQUEST]);

    renderPage();

    expect(await screen.findByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('asha.rao@example.com')).toBeInTheDocument();
    // Unmasked. /api/admin/** is the only place the backend sends a full PAN,
    // because checking it against a document is the task that needs it.
    expect(screen.getByText('ABCDE1234F')).toBeInTheDocument();
    expect(screen.getByText('Bilal Khan')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('asks for the whole list when no status is chosen', async () => {
    listAccountRequests.mockResolvedValue([]);

    renderPage();
    await screen.findByText('No requests to show');

    // No status argument at all, rather than an explicit "all": the backend's
    // default is the whole list, and asking for it that way keeps the two in step.
    // `null` is the "All" filter, which the service turns into no query parameter.
    expect(listAccountRequests).toHaveBeenCalledWith(null);
  });

  it('asks the server for a filtered queue rather than filtering the rows itself', async () => {
    listAccountRequests.mockResolvedValue([PENDING_REQUEST]);

    renderPage();
    await screen.findByText('Asha Rao');

    await userEvent.click(screen.getByRole('button', { name: 'PENDING' }));

    // A client-side filter over an already-fetched list would look identical and
    // quietly differ: the server also decides the order, and it holds requests
    // this page has never been sent.
    await waitFor(() => expect(listAccountRequests).toHaveBeenCalledWith('PENDING'));
  });

  it('marks the chosen filter as pressed', async () => {
    listAccountRequests.mockResolvedValue([PENDING_REQUEST]);

    renderPage();
    await screen.findByText('Asha Rao');

    const pending = screen.getByRole('button', { name: 'PENDING' });
    expect(pending).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(pending);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'PENDING' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
  });

  it('names the status when a filtered queue is empty', async () => {
    listAccountRequests.mockResolvedValue([]);

    renderPage();
    await screen.findByText('No requests to show');

    await userEvent.click(screen.getByRole('button', { name: 'REJECTED' }));

    expect(await screen.findByText(/currently rejected/i)).toBeInTheDocument();
  });

  it('sends the officer to the request\'s own review page', async () => {
    listAccountRequests.mockResolvedValue([PENDING_REQUEST]);

    renderPage();

    // A decision means reading the PAN, date of birth and branch, which a link
    // has room for and a dialog in a list does not.
    const review = await screen.findByRole('link', { name: 'Review' });
    expect(review).toHaveAttribute('href', '/accounts/requests/11');
  });

  it('reports a queue that could not be loaded', async () => {
    listAccountRequests.mockRejectedValue(new Error('Forbidden.'));

    renderPage();

    expect(await screen.findByText('Could not load account requests')).toBeInTheDocument();
    expect(screen.getByText('Forbidden.')).toBeInTheDocument();
  });
});
