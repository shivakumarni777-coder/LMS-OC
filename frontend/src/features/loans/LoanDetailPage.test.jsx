import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoanDetailPage from './LoanDetailPage.jsx';
import { approveLoan, getLoan } from '../../api/loanService.js';
import { getCustomerByAccount } from '../../api/customerService.js';
import { downloadDocument, listLoanDocuments } from '../../api/documentService.js';

vi.mock('../../api/loanService.js', () => ({
  getLoan: vi.fn(),
  approveLoan: vi.fn(),
  listLoans: vi.fn(),
  fetchLoanSummary: vi.fn(),
  applyForLoan: vi.fn(),
}));

vi.mock('../../api/customerService.js', () => ({
  getCustomerByAccount: vi.fn(),
  getCustomerLoans: vi.fn(),
  registerCustomer: vi.fn(),
  listBranches: vi.fn(),
}));

vi.mock('../../api/documentService.js', () => ({
  listLoanDocuments: vi.fn(),
  downloadDocument: vi.fn(),
  uploadLoanDocument: vi.fn(),
  MAX_DOCUMENT_BYTES: 10 * 1024 * 1024,
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

const APPLICANT = {
  accountNumber: 304012345678,
  fullName: 'Asha Rao',
  email: 'asha.rao@example.com',
  phoneNo: '9876543210',
  branchCode: 101,
};

function renderPage(loanId = '7') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/loans/${loanId}`]}>
        <Routes>
          <Route path="/loans/:loanId" element={<LoanDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoanDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLoan.mockResolvedValue(PENDING_LOAN);
    getCustomerByAccount.mockResolvedValue(APPLICANT);
    listLoanDocuments.mockResolvedValue([]);
  });

  describe('the application', () => {
    it('shows the applicant, the account and the loan terms', async () => {
      renderPage();

      // Applicant, read from the account the loan is booked against.
      expect(await screen.findByText('Asha Rao')).toBeInTheDocument();
      expect(getCustomerByAccount).toHaveBeenCalledWith(304012345678);
      // Bank account, in the grouped form the rest of the app uses, and branch.
      expect(screen.getByText('3040 1234 5678')).toBeInTheDocument();
      expect(screen.getByText('101')).toBeInTheDocument();
      // Loan terms.
      expect(screen.getByText('HOME')).toBeInTheDocument();
      // Indian digit grouping.
      expect(screen.getByText('₹50,00,000.00')).toBeInTheDocument();
      expect(screen.getByText('8.50%')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('reads the loan from the owner-or-admin endpoint, not an admin-only one', async () => {
      renderPage();

      await screen.findByText('Asha Rao');
      // There is no `GET /api/admin/loans/{id}`; the existing endpoint already
      // admits an officer, so the page uses it rather than a second contract.
      expect(getLoan).toHaveBeenCalledWith('7');
    });

    it('still renders the loan when the applicant cannot be loaded', async () => {
      getCustomerByAccount.mockRejectedValue(new Error('Customer not found.'));

      renderPage();

      // The loan is the subject; a failed secondary read must not blank the page
      // or lose the account number, which comes from the loan itself.
      expect(await screen.findByText(/Could not load the applicant/i)).toBeInTheDocument();
      expect(screen.getByText('3040 1234 5678')).toBeInTheDocument();
      expect(screen.getByText('₹50,00,000.00')).toBeInTheDocument();
    });

    it('reports a loan that could not be loaded', async () => {
      getLoan.mockRejectedValue(new Error('Loan not found with ID: 99.'));

      renderPage('99');

      expect(await screen.findByText('Could not load this loan')).toBeInTheDocument();
    });
  });

  describe('documents', () => {
    it('says so plainly when the applicant attached none', async () => {
      renderPage();

      // Not an error: the system requires no documents, so an empty list is a
      // legitimate state and must not read as a failure.
      expect(await screen.findByText(/attached no documents/i)).toBeInTheDocument();
      expect(listLoanDocuments).toHaveBeenCalledWith('7');
    });

    it('distinguishes a failed document load from an applicant who sent none', async () => {
      listLoanDocuments.mockRejectedValue(new Error('Document service unavailable.'));

      renderPage();

      // An officer deciding a "0 attached" application has to be able to tell
      // "there are none" from "I could not look", so the empty-state wording is
      // not reused for a failure.
      expect(await screen.findByText('Could not load the documents')).toBeInTheDocument();
      expect(screen.getByText('Document service unavailable.')).toBeInTheDocument();
      expect(screen.queryByText(/attached no documents/i)).not.toBeInTheDocument();
      // The count is withheld too, rather than asserting a 0 that was never
      // established.
      expect(screen.getByText('Attached to this application')).toBeInTheDocument();
      expect(screen.queryByText(/^\d+ attached/)).not.toBeInTheDocument();
    });

    it('lists each document with its type, size and review status', async () => {
      listLoanDocuments.mockResolvedValue([
        {
          documentId: 1,
          loanId: 7,
          documentType: 'Salary slip',
          documentName: 'salary-slip.pdf',
          contentType: 'application/pdf',
          sizeBytes: 204800,
          status: 'VERIFIED',
          rejectionReason: null,
          uploadedAt: '2026-09-21T10:15:00Z',
        },
        {
          documentId: 2,
          loanId: 7,
          documentType: 'Bank statement',
          documentName: 'statement.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1048576,
          status: 'REJECTED',
          rejectionReason: 'Statement is for the wrong month.',
          uploadedAt: '2026-09-22T09:00:00Z',
        },
      ]);

      renderPage();

      expect(await screen.findByText('salary-slip.pdf')).toBeInTheDocument();
      expect(screen.getByText('Verified')).toBeInTheDocument();
      // The officer has to be able to see why a document was turned down, or the
      // rejection is not actionable.
      expect(screen.getByText(/Rejected: statement is for the wrong month/i)).toBeInTheDocument();
      // Bytes rendered for a human, not raw.
      expect(screen.getByText(/200 KB/)).toBeInTheDocument();
      expect(screen.getByText(/1 MB/)).toBeInTheDocument();
    });

    it('downloads a document and releases the object URL', async () => {
      // jsdom implements neither call, and both matter: an object URL left alive
      // pins the file in memory for the life of the page.
      const createObjectURL = vi.fn(() => 'blob:fake');
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(function noop() {});

      listLoanDocuments.mockResolvedValue([
        {
          documentId: 4,
          loanId: 7,
          documentType: 'Salary slip',
          documentName: 'salary-slip.pdf',
          contentType: 'application/pdf',
          sizeBytes: 204800,
          status: 'PENDING',
          rejectionReason: null,
          uploadedAt: '2026-09-21T10:15:00Z',
        },
      ]);
      downloadDocument.mockResolvedValue({
        blob: new Blob(['PAYSLIP'], { type: 'application/pdf' }),
        fileName: 'salary-slip.pdf',
      });

      renderPage();
      await userEvent.click(await screen.findByRole('button', { name: /download/i }));

      await waitFor(() => expect(downloadDocument).toHaveBeenCalledWith(4));
      const link = click.mock.instances[0];
      expect(link.download).toBe('salary-slip.pdf');
      expect(link.href).toContain('blob:fake');
      expect(link.isConnected).toBe(false);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');

      vi.unstubAllGlobals();
      click.mockRestore();
    });

    it('surfaces a failed download without losing the list', async () => {
      listLoanDocuments.mockResolvedValue([
        {
          documentId: 4,
          loanId: 7,
          documentType: 'Salary slip',
          documentName: 'salary-slip.pdf',
          contentType: 'application/pdf',
          sizeBytes: 204800,
          status: 'PENDING',
          rejectionReason: null,
          uploadedAt: '2026-09-21T10:15:00Z',
        },
      ]);
      downloadDocument.mockRejectedValue(new Error('Document not found.'));

      renderPage();
      await userEvent.click(await screen.findByRole('button', { name: /download/i }));

      expect(await screen.findByText('Download problem')).toBeInTheDocument();
      // The document is still listed, so the officer can try again.
      expect(screen.getByText('salary-slip.pdf')).toBeInTheDocument();
    });
  });

  describe('approval', () => {
    it('previews the EMI as the tenure is chosen, then approves', async () => {
      approveLoan.mockResolvedValue({
        ...PENDING_LOAN,
        loanStatus: 'APPROVED',
        tenureMonths: 240,
        monthlyEmi: 43391.16,
      });

      renderPage();
      await screen.findByText('Asha Rao');

      // The preset buttons make the tenure easy to set in a test and in use.
      await userEvent.click(screen.getByRole('button', { name: '240m' }));
      expect(await screen.findByText('₹43,391.16')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));

      await waitFor(() => expect(approveLoan).toHaveBeenCalledWith('7', { tenureMonths: 240 }));
      expect(await screen.findByText('Loan 7 approved')).toBeInTheDocument();
      // The server's own figures are shown back, not the estimate - so the
      // instalment and the tenure both come from the response.
      expect(screen.getByText(/^Monthly instalment/)).toHaveTextContent(
        '₹43,391.16 over 240 months',
      );
    });

    it('requires a tenure before calling the server', async () => {
      renderPage();
      await screen.findByText('Asha Rao');

      await userEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));

      expect(await screen.findByText('Tenure is required')).toBeInTheDocument();
      expect(approveLoan).not.toHaveBeenCalled();
    });

    it('refuses a tenure outside 1-480 before calling the server', async () => {
      renderPage();
      await screen.findByText('Asha Rao');

      await userEvent.type(screen.getByLabelText(/Tenure in months/), '900');
      await userEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));

      expect(await screen.findByText(/cannot exceed 480 months/i)).toBeInTheDocument();
      expect(approveLoan).not.toHaveBeenCalled();
    });

    it('puts a server-side tenure error on the field', async () => {
      approveLoan.mockRejectedValue(
        Object.assign(new Error('Validation failed'), {
          status: 400,
          fieldErrors: { tenureMonths: 'Tenure must be at least 1 month' },
        }),
      );

      renderPage();
      await screen.findByText('Asha Rao');
      await userEvent.type(screen.getByLabelText(/Tenure in months/), '240');
      await userEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));

      expect(await screen.findByText('Tenure must be at least 1 month')).toBeInTheDocument();
    });

    it('offers no approval control for a loan that is not pending', async () => {
      getLoan.mockResolvedValue({
        ...PENDING_LOAN,
        loanStatus: 'APPROVED',
        tenureMonths: 240,
        monthlyEmi: 43391.16,
      });

      renderPage();

      // The rule is the server's, so the control is simply absent rather than
      // present and guaranteed to fail with a 400.
      expect(await screen.findByText(/cannot be approved again/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Confirm approval' })).not.toBeInTheDocument();
      // The decided loan's terms are still shown.
      expect(screen.getByText('240 months')).toBeInTheDocument();
      expect(screen.getByText('₹43,391.16')).toBeInTheDocument();
    });

    it('reports the conflict when a loan is approved by someone else first', async () => {
      // The screen was left open on a pending loan while another officer
      // approved it. The server refuses, and the refusal has to be legible.
      approveLoan.mockRejectedValue(
        Object.assign(new Error('Loan 7 has already been APPROVED.'), { status: 400 }),
      );

      renderPage();
      await screen.findByText('Asha Rao');
      await userEvent.click(screen.getByRole('button', { name: '240m' }));
      await userEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));

      expect(await screen.findByText('Approval not recorded')).toBeInTheDocument();
      expect(screen.getByText('Loan 7 has already been APPROVED.')).toBeInTheDocument();
    });
  });
});
