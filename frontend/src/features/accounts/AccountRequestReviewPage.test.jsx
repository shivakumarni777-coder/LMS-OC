import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountRequestReviewPage from './AccountRequestReviewPage.jsx';
import { getAccountRequest, reviewAccountRequest } from '../../api/accountService.js';

vi.mock('../../api/accountService.js', () => ({
  getAccountRequest: vi.fn(),
  reviewAccountRequest: vi.fn(),
  listAccountRequests: vi.fn(),
  getAccountStatus: vi.fn(),
  requestAccountOpening: vi.fn(),
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
  status: 'REJECTED',
  reviewedAt: '2026-09-22T11:00:00Z',
  reviewNotes: 'The PAN could not be matched against any record.',
};

function renderPage(requestId = '11') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/accounts/requests/${requestId}`]}>
        <Routes>
          <Route path="/accounts/requests/:requestId" element={<AccountRequestReviewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AccountRequestReviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAccountRequest.mockResolvedValue(PENDING_REQUEST);
  });

  it('shows the applicant in full, and says why they can see it', async () => {
    renderPage();

    expect(await screen.findByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('ABCDE1234F')).toBeInTheDocument();
    expect(screen.getByText('21 Mar 1994')).toBeInTheDocument();
    expect(screen.getByText('9876543210')).toBeInTheDocument();
    expect(screen.getByText('101')).toBeInTheDocument();
    // The screen itself states the rule, so the unmasked PAN is not a surprise.
    expect(screen.getByText('Shown in full to administrators only.')).toBeInTheDocument();
  });

  it('shows the request timeline, including that it is undecided', async () => {
    renderPage();

    await screen.findByText('Asha Rao');
    // en-GB spells September with four letters; asserted as rendered rather than
    // as "Sep" so the test fails for a real formatting change and not a
    // difference in what the ICU data abbreviates it to.
    expect(screen.getByText('20 Sept 2026')).toBeInTheDocument();
    // Not a dash: "nobody has looked at this" is different from "unknown".
    expect(screen.getByText('Not yet reviewed')).toBeInTheDocument();
  });

  describe('approving', () => {
    it('approves and shows the account number that was opened', async () => {
      reviewAccountRequest.mockResolvedValue({
        ...PENDING_REQUEST,
        status: 'APPROVED',
        reviewedAt: '2026-09-23T10:00:00Z',
        reviewNotes: 'Verified against the submitted documents.',
        resultingAccountNumber: 304055550002,
      });

      renderPage();
      await screen.findByText('Asha Rao');

      await userEvent.click(screen.getByRole('button', { name: /approve and open account/i }));

      await waitFor(() =>
        expect(reviewAccountRequest).toHaveBeenCalledWith('11', {
          decision: 'APPROVED',
          reviewNotes: undefined,
        }),
      );
      // The account number comes from the server's response, not a guess: it is
      // the one thing the applicant will be told, so inventing it here would be
      // inventing the outcome.
      expect(await screen.findByText(/Account 304055550002 is now open/i)).toBeInTheDocument();
      expect(screen.getByText('304055550002')).toBeInTheDocument();
    });

    it('sends review notes when they are written', async () => {
      reviewAccountRequest.mockResolvedValue({
        ...PENDING_REQUEST,
        status: 'APPROVED',
        resultingAccountNumber: 304055550002,
      });

      renderPage();
      await screen.findByText('Asha Rao');

      await userEvent.type(screen.getByLabelText(/review notes/i), 'Documents checked.');
      await userEvent.click(screen.getByRole('button', { name: /approve and open account/i }));

      await waitFor(() =>
        expect(reviewAccountRequest).toHaveBeenCalledWith('11', {
          decision: 'APPROVED',
          reviewNotes: 'Documents checked.',
        }),
      );
    });
  });

  describe('rejecting', () => {
    it('insists on a reason, because the applicant only ever sees this', async () => {
      renderPage();
      await screen.findByText('Asha Rao');

      await userEvent.click(screen.getByRole('button', { name: 'Reject' }));

      expect(
        await screen.findByText('Give the applicant a reason for rejecting the request.'),
      ).toBeInTheDocument();
      // Not a server rule, so nothing is sent: this is refused client-side
      // because a rejection with no reason leaves the applicant with nothing to
      // act on.
      expect(reviewAccountRequest).not.toHaveBeenCalled();
    });

    it('rejects with the reason once one is given', async () => {
      reviewAccountRequest.mockResolvedValue({
        ...PENDING_REQUEST,
        status: 'REJECTED',
        reviewedAt: '2026-09-23T10:00:00Z',
        reviewNotes: 'The PAN could not be matched.',
      });

      renderPage();
      await screen.findByText('Asha Rao');

      await userEvent.type(screen.getByLabelText(/review notes/i), 'The PAN could not be matched.');
      await userEvent.click(screen.getByRole('button', { name: 'Reject' }));

      await waitFor(() =>
        expect(reviewAccountRequest).toHaveBeenCalledWith('11', {
          decision: 'REJECTED',
          reviewNotes: 'The PAN could not be matched.',
        }),
      );
      expect(await screen.findByText(/can apply again/i)).toBeInTheDocument();
    });
  });

  describe('a request that is already decided', () => {
    it('offers no decision controls at all', async () => {
      getAccountRequest.mockResolvedValue(REJECTED_REQUEST);

      renderPage();

      expect(
        await screen.findByText(/already rejected.*cannot be reviewed again/is),
      ).toBeInTheDocument();
      // The server refuses a second decision, so the control is absent rather
      // than present and guaranteed to fail after a reason has been typed.
      expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/review notes/i)).not.toBeInTheDocument();
    });

    it('shows the note the previous officer left, which is what the applicant saw', async () => {
      getAccountRequest.mockResolvedValue(REJECTED_REQUEST);

      renderPage();

      expect(
        await screen.findByText('The PAN could not be matched against any record.'),
      ).toBeInTheDocument();
    });

    it('reports the server refusal when the screen was left open past a decision', async () => {
      // The screen is read-only once decided, so this is only reachable by a page
      // that was opened while the request was still pending and is now stale.
      // Another officer got there first, and the 400 has to be legible.
      reviewAccountRequest.mockRejectedValue(
        new Error('This request has already been approved.'),
      );

      renderPage();
      await screen.findByText('Asha Rao');

      await userEvent.type(screen.getByLabelText(/review notes/i), 'Documents checked.');
      await userEvent.click(screen.getByRole('button', { name: /approve and open account/i }));

      expect(await screen.findByText('Decision not recorded')).toBeInTheDocument();
      expect(screen.getByText('This request has already been approved.')).toBeInTheDocument();
      // And the request is still shown as pending, because nothing was changed -
      // the form is not left claiming a decision succeeded.
      expect(screen.queryByText(/is now open/i)).not.toBeInTheDocument();
    });
  });

  it('reports a request that could not be loaded', async () => {
    getAccountRequest.mockRejectedValue(new Error('Not found.'));

    renderPage('99');

    expect(await screen.findByText('Could not load this request')).toBeInTheDocument();
    expect(screen.getByText('Not found.')).toBeInTheDocument();
  });

  it('links back to the queue', async () => {
    renderPage();

    expect(await screen.findByRole('link', { name: /back to queue/i })).toHaveAttribute(
      'href',
      '/accounts/requests',
    );
  });
});
