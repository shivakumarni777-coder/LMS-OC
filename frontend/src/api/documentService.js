import { http } from '../lib/httpClient.js';

/**
 * Loan-scoped supporting documents.
 *
 * Documents belong to a loan, not to a customer: the backend keys them by
 * `loan_id` and authorises every read and write against the loan's own customer.
 * That is why nothing here takes an account number or a customer id - the loan
 * is the only handle a caller needs, and the one the server authorises on.
 *
 * The contract is free text for the document type. The server declares no
 * mandatory set of types, so there is no list to fetch and nothing to validate
 * against - see `DOCUMENT_TYPE_SUGGESTIONS` in the panel, which is advice rather
 * than a vocabulary.
 */

/** The server's own ceiling, mirrored so an oversized file is caught before the upload starts. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/**
 * Attaches one document to a loan.
 *
 * The body is `FormData` and the `Content-Type` header is deliberately not set.
 * A multipart body needs a boundary that the browser generates per request and
 * that only it knows; writing `multipart/form-data` by hand replaces it with a
 * bare media type the server cannot parse, and the upload fails in a way that
 * reads like a server problem rather than a client one. Letting axios attach the
 * header to the `FormData` is the only version of this that works.
 */
export async function uploadLoanDocument(loanId, { file, documentType }) {
  const body = new FormData();
  body.append('file', file);
  // Both parts are sent, matching the two @RequestParam names the controller
  // binds. A missing `documentType` is rejected server-side, so it is always
  // sent even when the caller passes an empty string, to keep the failure a
  // readable validation message rather than a confusing parameter-binding one.
  body.append('documentType', documentType ?? '');

  const { data } = await http.post(`/loans/${loanId}/documents`, body);
  return data;
}

/** Every document attached to a loan, oldest first, as the server orders them. */
export async function listLoanDocuments(loanId) {
  const { data } = await http.get(`/loans/${loanId}/documents`);
  return data;
}

/**
 * Fetches a document's bytes and hands them to the browser as a download.
 *
 * Keyed by document id because the stored filename is generated server-side and
 * the client has no way to know it. Returns the filename as well as the blob so
 * the caller can name the download from the server's own metadata rather than
 * inventing one.
 *
 * `responseType: 'blob'` is required: without it axios parses the body as text
 * and a PDF comes back as corrupted characters.
 */
export async function downloadDocument(documentId) {
  const { data, headers } = await http.get(`/documents/${documentId}/download`, {
    responseType: 'blob',
  });
  return { blob: data, fileName: fileNameFrom(headers) };
}

/**
 * Pulls the filename out of the Content-Disposition header.
 *
 * `filename*=UTF-8''...` is the form the server sends, because it builds the
 * header with an explicit UTF-8 charset. Read in preference to the plain
 * `filename="..."` because the plain one is lossy for non-ASCII names, which is
 * the case the server went to the trouble of encoding.
 */
function fileNameFrom(headers) {
  const disposition = headers?.['content-disposition'] ?? '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) {
    return decodeURIComponent(encoded[1].trim());
  }
  const plain = disposition.match(/filename="([^"]*)"/i);
  return plain ? plain[1] : null;
}
