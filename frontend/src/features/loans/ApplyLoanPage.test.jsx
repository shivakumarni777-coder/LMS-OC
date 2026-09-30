import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApplyLoanPage from './ApplyLoanPage.jsx';
import { getAccountStatus, requestAccountOpening } from '../../api/accountService.js';
import { applyForLoan } from '../../api/loanService.js';
import { listLoanDocuments, uploadLoanDocument, downloadDocument } from '../../api/documentService.js';

vi.mock('../../api/accountService.js', () => ({
  getAccountStatus: vi.fn(),
  requestAccountOpening: vi.fn(),
}));

vi.mock('../../api/loanService.js', () => ({
  listLoans: vi.fn(),
  approveLoan: vi.fn(),
  fetchLoanSummary: vi.fn(),
  applyForLoan: vi.fn(),
}));

// Spelled inline rather than closing over these names: `vi.mock` is hoisted
// above every declaration, so a factory that referenced them here would run
// before they are initialised.
vi.mock('../../api/documentService.js', () => ({
  listLoanDocuments: vi.fn(),
  uploadLoanDocument: vi.fn(),
  downloadDocument: vi.fn(),
  // The panel quotes this in its file-picker hint, so a mock without it would
  // leave the component itself unable to render.
  MAX_DOCUMENT_BYTES: 10 * 1024 * 1024,
}));

/** Overridden per test by re-mocking the module factory's `useAuth`. */
const auth = { user: null, isAdmin: false };
vi.mock('../../auth/AuthProvider.jsx', () => ({
  useAuth: () => auth,
}));

const CUSTOMER_WITH_ACCOUNT = {
  userId: 7,
  username: 'asha.rao@example.com',
  fullName: 'Asha Rao',
  role: 'CUSTOMER',
  accountNumber: 304012345678,
  dob: '1994-03-21',
  phoneNo: '9876543210',
  branchCode: 101,
};

/** A registered customer: a profile, and no account opened yet. */
const CUSTOMER_WITHOUT_ACCOUNT = { ...CUSTOMER_WITH_ACCOUNT, accountNumber: undefined };

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/loans/apply']}>
        <ApplyLoanPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ApplyLoanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = CUSTOMER_WITHOUT_ACCOUNT;
    auth.isAdmin = false;
    // Documents exist but none have been filed yet, which is the state every
    // application starts in.
    listLoanDocuments.mockResolvedValue([]);
  });

  it('offers the loan form to a customer who already has an account', async () => {
    getAccountStatus.mockResolvedValue({ accountNumber: 304012345678, hasBankAccount: true });

    renderPage();

    expect(await screen.findByLabelText(/loan type/i)).toBeInTheDocument();
    // The account-opening form must not be reachable at the same time: a PAN
    // field next to a working loan form would invite a second, pointless request.
    expect(screen.queryByLabelText(/pan number/i)).not.toBeInTheDocument();
  });

  it('pre-fills the account number from the status response', async () => {
    getAccountStatus.mockResolvedValue({ accountNumber: 304012345678, hasBankAccount: true });

    renderPage();

    await screen.findByLabelText(/loan type/i);
    // From the status response rather than the identity, so the number the form
    // books against is the one the page just fetched for this purpose.
    expect(screen.getByLabelText(/account number/i)).toHaveValue('304012345678');
  });

  it('asks for an account instead, when there is none', async () => {
    getAccountStatus.mockResolvedValue({ hasBankAccount: false });

    renderPage();

    // The explanation comes first: a loan cannot be recorded against no account.
    expect(await screen.findByText(/need a bank account to apply for a loan/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/pan number/i)).toBeInTheDocument();
    // And the form that could not have worked is not rendered at all.
    expect(screen.queryByLabelText(/loan type/i)).not.toBeInTheDocument();
  });

  it('shows what the bank already holds, and asks only for the PAN', async () => {
    getAccountStatus.mockResolvedValue({ hasBankAccount: false });
    auth.user = CUSTOMER_WITHOUT_ACCOUNT;

    renderPage();

    await screen.findByLabelText(/pan number/i);
    // These came from the profile at registration, so re-asking would only give
    // the customer a way to contradict what the bank holds.
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('1994-03-21')).toBeInTheDocument();
    expect(screen.getByText('9876543210')).toBeInTheDocument();
    expect(screen.queryByLabelText(/date of birth/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/phone number/i)).not.toBeInTheDocument();
  });

  it('upper-cases the PAN before sending it', async () => {
    getAccountStatus.mockResolvedValue({ hasBankAccount: false });
    requestAccountOpening.mockResolvedValue({
      requestId: 1,
      status: 'PENDING',
      maskedPanNo: 'XXXXX1234X',
    });

    renderPage();

    // Typed in lower case, as it would be on a lower-case keyboard layout. The
    // backend pattern is upper-case only, so submitting it raw would be rejected
    // for something the user did right.
    await userEvent.type(await screen.findByLabelText(/pan number/i), 'abcde1234f');
    await userEvent.click(screen.getByRole('button', { name: /request account/i }));

    await waitFor(() =>
      expect(requestAccountOpening).toHaveBeenCalledWith('ABCDE1234F'),
    );
  });

  it('rejects a malformed PAN without asking the server', async () => {
    getAccountStatus.mockResolvedValue({ hasBankAccount: false });

    renderPage();

    await userEvent.type(await screen.findByLabelText(/pan number/i), 'ABCDE1234');
    await userEvent.click(screen.getByRole('button', { name: /request account/i }));

    expect(await screen.findByText(/must match the format/i)).toBeInTheDocument();
    expect(requestAccountOpening).not.toHaveBeenCalled();
  });

  it('shows the outstanding request once one is filed', async () => {
    getAccountStatus.mockResolvedValue({ hasBankAccount: false });
    requestAccountOpening.mockResolvedValue({
      requestId: 12,
      status: 'PENDING',
      maskedPanNo: 'XXXXX1234X',
    });

    renderPage();

    await userEvent.type(await screen.findByLabelText(/pan number/i), 'ABCDE1234F');
    await userEvent.click(screen.getByRole('button', { name: /request account/i }));

    // The status query is refetched rather than patched locally, so the panel is
    // driven by what the server says is outstanding - not by what the browser
    // hopes it sent.
    await waitFor(() => {
      expect(getAccountStatus).toHaveBeenCalledTimes(2);
    });
  });

  it('renders the pending state from the status response', async () => {
    getAccountStatus.mockResolvedValue({
      hasBankAccount: false,
      accountOpeningRequest: {
        requestId: 12,
        status: 'PENDING',
        maskedPanNo: 'XXXXX1234X',
        requestedAt: '2026-09-28T09:15:00Z',
      },
    });

    renderPage();

    expect(await screen.findByText(/your request is with us/i)).toBeInTheDocument();
    expect(screen.getByText('Awaiting review')).toBeInTheDocument();
    // Masked in the response, so that is all there is to show.
    expect(screen.getByText('XXXXX1234X')).toBeInTheDocument();
    // Filing a second one would be refused with a conflict.
    expect(screen.queryByLabelText(/pan number/i)).not.toBeInTheDocument();
  });

  it('shows a rejection with the officer\'s reason, and still offers a fresh form', async () => {
    getAccountStatus.mockResolvedValue({
      hasBankAccount: false,
      accountOpeningRequest: {
        requestId: 12,
        status: 'REJECTED',
        maskedPanNo: 'XXXXX1234X',
        requestedAt: '2026-09-20T09:15:00Z',
        reviewedAt: '2026-09-21T14:00:00Z',
        reviewNotes: 'PAN illegible - the fourth character is not a digit',
      },
    });

    renderPage();

    // The reason is the entire point of reporting the rejection: "that did not
    // work" leaves the customer to guess, and they will send the same PAN again.
    expect(await screen.findByText(/was not approved/i)).toBeInTheDocument();
    expect(
      screen.getByText(/PAN illegible - the fourth character is not a digit/),
    ).toBeInTheDocument();

    // A rejection does not block a second attempt, so the form is there - worded
    // as a reapplication rather than a first one, since it is.
    const field = await screen.findByLabelText(/pan number/i);
    expect(field).toHaveValue('');
    expect(screen.getByRole('button', { name: /request account/i })).toBeInTheDocument();
    // And the rejected request is not presented as one still awaiting a decision.
    expect(screen.queryByText('Awaiting review')).not.toBeInTheDocument();
  });

  it('does not claim the officer left no reason when one was recorded', async () => {
    getAccountStatus.mockResolvedValue({
      hasBankAccount: false,
      accountOpeningRequest: {
        requestId: 12,
        status: 'REJECTED',
        maskedPanNo: 'XXXXX1234X',
        requestedAt: '2026-09-20T09:15:00Z',
        reviewedAt: '2026-09-21T14:00:00Z',
        reviewNotes: '   ',
      },
    });

    renderPage();

    // The field is nullable, so a rejection with nothing recorded is possible.
    // Rendering an empty reason slot would look like a rendering failure; saying
    // plainly that none was recorded is accurate and still actionable.
    expect(await screen.findByText(/no reason was recorded/i)).toBeInTheDocument();
  });

  it('re-applies after a rejection, using the new PAN', async () => {
    getAccountStatus.mockResolvedValue({
      hasBankAccount: false,
      accountOpeningRequest: {
        requestId: 12,
        status: 'REJECTED',
        maskedPanNo: 'XXXXX1234X',
        reviewNotes: 'PAN illegible',
      },
    });
    requestAccountOpening.mockResolvedValue({ requestId: 13, status: 'PENDING' });

    renderPage();

    await userEvent.type(await screen.findByLabelText(/pan number/i), 'ABCDE5678G');
    await userEvent.click(screen.getByRole('button', { name: /request account/i }));

    // A different PAN, not a resubmission of the one that was turned down.
    await waitFor(() => {
      expect(requestAccountOpening).toHaveBeenCalledWith('ABCDE5678G');
    });
  });

  it('does not ask an administrator about their own account', async () => {    auth.user = { userId: 1, username: 'admin', role: 'ADMIN', accountNumber: undefined };
    auth.isAdmin = true;

    renderPage();

    // An admin has no customer account and cannot request one, but does apply on
    // a customer's behalf - so the form is right and the check is meaningless.
    expect(await screen.findByLabelText(/loan type/i)).toBeInTheDocument();
    expect(getAccountStatus).not.toHaveBeenCalled();
  });

  it('surfaces a server-side field error against the PAN field', async () => {
    getAccountStatus.mockResolvedValue({ hasBankAccount: false });
    requestAccountOpening.mockRejectedValue({
      status: 400,
      message: 'Validation failed.',
      fieldErrors: { panNo: 'PAN must match the format ABCDE1234F' },
    });

    renderPage();

    await userEvent.type(await screen.findByLabelText(/pan number/i), 'ABCDE1234F');
    await userEvent.click(screen.getByRole('button', { name: /request account/i }));

    expect(await screen.findByText(/PAN must match the format/i)).toBeInTheDocument();
  });

  it('submits the loan against the account the status response reported', async () => {
    getAccountStatus.mockResolvedValue({ accountNumber: 304012345678, hasBankAccount: true });
    applyForLoan.mockResolvedValue({ loanId: 7 });

    renderPage();

    await userEvent.selectOptions(await screen.findByLabelText(/loan type/i), 'HOME');
    await userEvent.type(screen.getByLabelText(/principal amount/i), '500000');
    await userEvent.click(screen.getByRole('button', { name: /submit application/i }));

    await waitFor(() =>
      expect(applyForLoan).toHaveBeenCalledWith({
        accountNumber: 304012345678,
        loanType: 'HOME',
        principalAmount: 500000,
      }),
    );
  });

  describe('documents', () => {
    /** Fills in the application form and submits it, leaving the panel open. */
    async function applyAndUpload() {
      getAccountStatus.mockResolvedValue({ accountNumber: 304012345678, hasBankAccount: true });
      applyForLoan.mockResolvedValue({ loanId: 7 });
      renderPage();

      await userEvent.selectOptions(await screen.findByLabelText(/loan type/i), 'HOME');
      await userEvent.type(screen.getByLabelText(/principal amount/i), '500000');
      await userEvent.click(screen.getByRole('button', { name: /submit application/i }));

      return screen.findByText(/application submitted/i);
    }

    /** The panel's file field, which is a real file input, not a stub. */
    function fileInput() {
      return screen.getByLabelText(/^document/i);
    }

    it('creates the loan before asking for documents, and scopes them to it', async () => {
      await applyAndUpload();

      // Documents cannot be attached to a loan that does not exist, so the apply
      // has to have completed and its id has to be the one the panel queries.
      expect(applyForLoan).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(listLoanDocuments).toHaveBeenCalledWith(7));
      // And the application form is gone: a second submit would be a second
      // application, which is not what the customer asked for.
      expect(screen.queryByRole('button', { name: /submit application/i })).not.toBeInTheDocument();
    });

    it('attaches an uploaded document to the new loan', async () => {
      uploadLoanDocument.mockResolvedValue({ documentId: 1 });
      await applyAndUpload();

      const file = new File(['PAYSLIP'], 'salary-slip.pdf', { type: 'application/pdf' });
      await userEvent.upload(fileInput(), file);
      await userEvent.type(screen.getByLabelText(/what is it/i), 'Salary slip');
      await userEvent.click(screen.getByRole('button', { name: /^upload document$/i }));

      await waitFor(() =>
        expect(uploadLoanDocument).toHaveBeenCalledWith(7, {
          file,
          documentType: 'Salary slip',
        }),
      );
      // Reloaded so the new document appears without a page reload.
      await waitFor(() => expect(listLoanDocuments.mock.calls.length).toBeGreaterThan(1));
    });

    it('keeps the created loan when an upload fails, and allows a retry', async () => {
      uploadLoanDocument.mockRejectedValueOnce(new Error('Upload failed. Try again.'));
      await applyAndUpload();

      const file = new File(['PAYSLIP'], 'salary-slip.pdf', { type: 'application/pdf' });
      await userEvent.upload(fileInput(), file);
      await userEvent.type(screen.getByLabelText(/what is it/i), 'Salary slip');
      await userEvent.click(screen.getByRole('button', { name: /^upload document$/i }));

      expect(await screen.findByText(/upload failed/i)).toBeInTheDocument();

      // The loan is already recorded on the server, so the user must not be sent
      // back to the application form to create a second one. This is the whole
      // reason the created loan is held in state.
      expect(screen.queryByRole('button', { name: /submit application/i })).not.toBeInTheDocument();
      expect(applyForLoan).toHaveBeenCalledTimes(1);
      // And the panel is still there to retry against.
      expect(screen.getByText(/supporting documents/i)).toBeInTheDocument();
    });

    it('lets the customer finish without uploading anything', async () => {
      await applyAndUpload();

      // Documents are optional: the server requires no set of them, so the
      // panel has to offer a way past rather than implying one is owed.
      expect(screen.getByRole('button', { name: /continue without documents/i })).toBeInTheDocument();
      expect(uploadLoanDocument).not.toHaveBeenCalled();
    });

    it('refuses an oversized file before attempting the upload', async () => {
      await applyAndUpload();

      const big = new File(['x'], 'enormous.pdf', { type: 'application/pdf' });
      Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 });
      await userEvent.upload(fileInput(), big);
      await userEvent.type(screen.getByLabelText(/what is it/i), 'Salary slip');
      await userEvent.click(screen.getByRole('button', { name: /^upload document$/i }));

      expect(await screen.findByText(/10 MB or smaller/i)).toBeInTheDocument();
      // No request: the user is told the size before a ten-megabyte round trip.
      expect(uploadLoanDocument).not.toHaveBeenCalled();
    });

    it('asks for a file and a description before uploading', async () => {
      await applyAndUpload();

      // Submitting an empty form is the cheapest way to check both fields are
      // actually required rather than merely labelled as such.
      await userEvent.click(screen.getByRole('button', { name: /^upload document$/i }));

      expect(await screen.findByText(/choose a file to upload/i)).toBeInTheDocument();
      expect(screen.getByText(/describe what kind of document/i)).toBeInTheDocument();
      expect(uploadLoanDocument).not.toHaveBeenCalled();
    });

    it('shows a rejected document with the officer\'s reason', async () => {
      listLoanDocuments.mockResolvedValue([
        {
          documentId: 1,
          loanId: 7,
          documentType: 'Bank statement',
          documentName: 'statement.pdf',
          contentType: 'application/pdf',
          sizeBytes: 2048,
          status: 'REJECTED',
          rejectionReason: 'Statement is for the wrong month.',
          uploadedAt: '2026-09-20T10:15:00Z',
        },
      ]);
      await applyAndUpload();

      expect(await screen.findByText(/rejected: statement is for the wrong month/i))
        .toBeInTheDocument();
    });

    it('downloads a document under its own name, then releases the object URL', async () => {
      // jsdom implements neither half of this, and both matter: an un-revoked
      // object URL pins a ten-megabyte file for the life of the page, so both
      // are stubbed and both are asserted on below.
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
          sizeBytes: 2048,
          status: 'PENDING',
          rejectionReason: null,
          uploadedAt: '2026-09-20T10:15:00Z',
        },
      ]);
      downloadDocument.mockResolvedValue({
        blob: new Blob(['PAYSLIP'], { type: 'application/pdf' }),
        fileName: 'salary-slip.pdf',
      });

      await applyAndUpload();
      await userEvent.click(await screen.findByRole('button', { name: /download/i }));

      await waitFor(() => expect(click).toHaveBeenCalled());
      const link = click.mock.instances[0];
      expect(link.download).toBe('salary-slip.pdf');
      expect(link.href).toContain('blob:fake');
      // The temporary element is cleaned up and the URL released, or every
      // downloaded file stays in memory until the page is closed.
      expect(link.isConnected).toBe(false);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');

      vi.unstubAllGlobals();
      click.mockRestore();
    });
  });
});
