import { useRef, useState } from 'react';
import { useLoanDocuments, useUploadLoanDocument } from '../../hooks/useLoanDocuments.js';
import { downloadDocument, MAX_DOCUMENT_BYTES } from '../../api/documentService.js';
import { formatBytes, formatDate, formatStatus } from '../../lib/format.js';
import Field, { TextInput, inputClassName } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Badge, { statusTone } from '../../components/ui/Badge.jsx';
import Spinner from '../../components/ui/FullPageSpinner.jsx';
import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';

/**
 * Suggestions for the document description, and nothing more.
 *
 * The backend deliberately declares no vocabulary: `documentType` is free text,
 * refused only when blank or over 40 characters. So these cannot be a required
 * select - a customer with a document nobody thought of would be unable to
 * submit it at all, which is the opposite of what an advisory field is for. They
 * are offered through a datalist instead, so the common cases are one click and
 * anything else is still typeable.
 */
const SUGGESTED_TYPES = [
  'Salary slip',
  'Bank statement',
  'Proof of address',
  'Identity proof',
  'Income proof',
  'Property papers',
  'Existing loan statement',
];

/** Server-side rules, mirrored so the user is told before an upload is attempted. */
const MAX_TYPE_LENGTH = 40;

/**
 * Supporting documents for a loan that has just been created.
 *
 * Documents hang off the application, so this is only ever rendered once a loan
 * exists and it is always given that loan's id - never a customer id, because a
 * customer's documents are not a thing in this system; the documents are the
 * ones filed against one application.
 *
 * Uploading is optional. The backend enforces no set of required types, so there
 * is nothing here that has to be satisfied before the customer moves on, and the
 * panel says so rather than implying an upload is owed.
 */
export default function DocumentUploadPanel({ loanId, onFinish }) {
  const documents = useLoanDocuments(loanId);
  const upload = useUploadLoanDocument(loanId);

  const [file, setFile] = useState(null);
  const [documentType, setDocumentType] = useState('');
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const inputRef = useRef(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setFailure(null);

    const found = validate({ file, documentType });
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    try {
      await upload.mutateAsync({ file, documentType: documentType.trim() });
      // Cleared only on success, so a failed upload leaves the chosen file in
      // place to retry rather than making the user find it again.
      setFile(null);
      setDocumentType('');
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    } catch (error) {
      // Not field-keyed by the server: `file` and `documentType` arrive as
      // multipart parts rather than a JSON body, so a rejection comes back as a
      // message about the upload as a whole.
      setFailure(error.message ?? 'The document could not be uploaded.');
    }
  }

  async function handleDownload(document) {
    setFailure(null);
    try {
      const { blob, fileName } = await downloadDocument(document.documentId);
      // An object URL, revoked immediately after the click. The click has
      // already handed the blob to the browser by then, and leaving the URL
      // alive would pin the whole file in memory for the life of the page - and
      // these can be ten megabytes.
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = fileName ?? document.documentName;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setFailure(error.message ?? 'The document could not be downloaded.');
    }
  }

  const uploaded = documents.data ?? [];

  return (
    <Card>
      <CardHeader
        title="Supporting documents"
        description={`Optional. Anything you upload is attached to application #${loanId}.`}
      />
      <CardBody>
        {uploaded.length > 0 ? (
          <ul className="mb-6 flex flex-col divide-y divide-slate-200">
            {uploaded.map((document) => (
              <li
                key={document.documentId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {document.documentName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {document.documentType} · {formatBytes(document.sizeBytes)} ·{' '}
                    {formatDate(document.uploadedAt)}
                  </p>
                  {document.status === 'REJECTED' && document.rejectionReason ? (
                    <p className="mt-1 text-xs text-rose-700">
                      Rejected: {document.rejectionReason}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={statusTone(document.status)}>
                    {formatStatus(document.status)}
                  </Badge>
                  <Button variant="ghost" onClick={() => handleDownload(document)}>
                    Download
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : documents.isPending ? (
          <Spinner className="mx-auto my-6 size-6" label="Loading documents" />
        ) : (
          <p className="mb-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            No documents attached yet. This is optional - you can continue without uploading
            anything, and add documents later if they are asked for.
          </p>
        )}

        {failure ? (
          <Alert tone="danger" title="Upload problem" className="mb-4">
            {failure}
          </Alert>
        ) : null}

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Field
            label="Document"
            error={errors.file}
            hint={`PDF, image or spreadsheet, up to ${formatBytes(MAX_DOCUMENT_BYTES)}.`}
            required
          >
            {({ id, describedBy, invalid, required }) => (
              <input
                ref={inputRef}
                id={id}
                type="file"
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                aria-required={required}
                className={inputClassName(invalid)}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            )}
          </Field>

          <Field
            label="What is it?"
            error={errors.documentType}
            hint="A short description for the officer reviewing it, up to 40 characters."
            required
          >
            {({ id, describedBy, invalid, required }) => (
              <>
                <TextInput
                  id={id}
                  list="document-type-suggestions"
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  aria-required={required}
                  name="documentType"
                  maxLength={MAX_TYPE_LENGTH}
                  value={documentType}
                  invalid={invalid}
                  placeholder="Salary slip"
                  onChange={(e) => setDocumentType(e.target.value)}
                />
                <datalist id="document-type-suggestions">
                  {SUGGESTED_TYPES.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
              </>
            )}
          </Field>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" busy={upload.isPending}>
              {upload.isPending ? 'Uploading' : 'Upload document'}
            </Button>
            {onFinish ? (
              <Button variant="ghost" onClick={onFinish} disabled={upload.isPending}>
                {uploaded.length > 0 ? 'Done' : 'Continue without documents'}
              </Button>
            ) : null}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

/**
 * Client-side checks, so an obviously bad upload is refused with a sentence
 * rather than after a round trip. The server makes the same checks - these are
 * about where the message appears, not about whether the rule is enforced.
 */
function validate({ file, documentType }) {
  const found = {};
  if (!file) {
    found.file = 'Choose a file to upload.';
  } else if (file.size > MAX_DOCUMENT_BYTES) {
    found.file = `That file is ${formatBytes(file.size)}. Documents must be ${formatBytes(
      MAX_DOCUMENT_BYTES,
    )} or smaller.`;
  }

  if (!documentType.trim()) {
    found.documentType = 'Describe what kind of document this is.';
  } else if (documentType.trim().length > MAX_TYPE_LENGTH) {
    found.documentType = `Keep the description to ${MAX_TYPE_LENGTH} characters or fewer.`;
  }
  return found;
}
