import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.fn();
const get = vi.fn();

vi.mock('../lib/httpClient.js', () => ({
  http: { post, get },
}));

const { downloadDocument, listLoanDocuments, uploadLoanDocument, MAX_DOCUMENT_BYTES } = await import(
  './documentService.js'
);

const FILE = new File(['PAYSLIP'], 'salary-slip.pdf', { type: 'application/pdf' });

describe('documentService', () => {
  beforeEach(() => {
    post.mockReset();
    get.mockReset();
  });

  describe('uploadLoanDocument', () => {
    it('posts a multipart body with a file part and a documentType part', async () => {
      post.mockResolvedValue({ data: { documentId: 3 } });

      await uploadLoanDocument(42, { file: FILE, documentType: 'Salary slip' });

      const [url, body] = post.mock.calls[0];
      expect(url).toBe('/loans/42/documents');
      // A real FormData, not a JSON object with a base64 string in it: the
      // server reads multipart parts and the boundary is not ours to invent.
      expect(body).toBeInstanceOf(FormData);
      expect(body.get('file')).toBe(FILE);
      expect(body.get('documentType')).toBe('Salary slip');
    });

    it('never sets Content-Type by hand', async () => {
      post.mockResolvedValue({ data: {} });

      await uploadLoanDocument(42, { file: FILE, documentType: 'Salary slip' });

      // Not a header check but an argument check: `http.post` is called with
      // just a url and a body, so there is no config object in which a
      // hand-written Content-Type could hide. A multipart boundary is the
      // browser's to generate, and setting the type ourselves without one makes
      // the server unable to parse the body we just built.
      expect(post.mock.calls[0]).toHaveLength(2);
    });

    it('scopes the upload to the loan it was given', async () => {
      post.mockResolvedValue({ data: {} });

      await uploadLoanDocument(7, { file: FILE, documentType: 'Bank statement' });
      await uploadLoanDocument(9, { file: FILE, documentType: 'Bank statement' });

      expect(post.mock.calls[0][0]).toBe('/loans/7/documents');
      expect(post.mock.calls[1][0]).toBe('/loans/9/documents');
    });

    it('exports the same 10 MB ceiling the server enforces', () => {
      // One constant, quoted in the file picker hint and checked before the
      // request, so the user is told the size before a ten-megabyte round trip.
      expect(MAX_DOCUMENT_BYTES).toBe(10 * 1024 * 1024);
    });
  });

  describe('listLoanDocuments', () => {
    it('returns the documents filed against a loan', async () => {
      const documents = [{ documentId: 1, loanId: 42, status: 'PENDING' }];
      get.mockResolvedValue({ data: documents });

      await expect(listLoanDocuments(42)).resolves.toEqual(documents);
      expect(get.mock.calls[0][0]).toBe('/loans/42/documents');
    });
  });

  describe('downloadDocument', () => {
    it('requests the bytes and reports the server\'s file name', async () => {
      const blob = new Blob(['PAYSLIP'], { type: 'application/pdf' });
      get.mockResolvedValue({
        data: blob,
        headers: { 'content-disposition': "attachment; filename*=UTF-8''salary%20slip.pdf" },
      });

      const result = await downloadDocument(3);

      expect(get.mock.calls[0][0]).toBe('/documents/3/download');
      expect(result.blob).toBe(blob);
      // Spring percent-encodes under RFC 5987, and the name is decoded here so
      // the saved file is called what the uploader called it.
      expect(result.fileName).toBe('salary slip.pdf');
    });

    it('falls back to no file name when the server sends no header', async () => {
      get.mockResolvedValue({ data: new Blob(['x']), headers: {} });

      const result = await downloadDocument(3);

      // The caller supplies a name from the document list in this case, so
      // returning null rather than "undefined" keeps the caller from writing a
      // file literally called undefined.
      expect(result.fileName).toBeNull();
    });
  });
});
