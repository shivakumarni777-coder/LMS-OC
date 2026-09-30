package com.bank.lms.service;

import com.bank.lms.dto.LoanDocumentDto;
import com.bank.lms.entity.Loan;
import com.bank.lms.entity.LoanDocument;
import com.bank.lms.exception.InvalidRequestException;
import com.bank.lms.exception.ResourceNotFoundException;
import com.bank.lms.repository.LoanDocumentRepository;
import com.bank.lms.repository.LoanRepository;
import com.bank.lms.security.AuthenticatedUser;
import com.bank.lms.service.storage.DocumentStorage;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.util.List;

/**
 * Supporting documents attached to one loan application.
 *
 * <p>Every entry point resolves the loan first and checks the caller against the
 * loan's own customer, rather than trusting the loan id in the path. Documents
 * hang off the application they support, so the same rule that governs the loan
 * governs its paperwork.
 */
@Service
@RequiredArgsConstructor
public class LoanDocumentService {

    private static final Logger log = LoggerFactory.getLogger(LoanDocumentService.class);

    /**
     * Upload ceiling. Spring's own multipart limit is larger; this is set well
     * below it so an oversized file is refused with a clear message instead of
     * filling the disk before anyone notices.
     */
    private static final long MAX_BYTES = 10L * 1024 * 1024;

    private final LoanRepository loanRepository;
    private final LoanDocumentRepository loanDocumentRepository;
    private final DocumentStorage documentStorage;

    // ----------------------------------------------------------------- upload

    /**
     * Attaches a document to a loan.
     *
     * <p>Uploads are the one place in this flow where the write and the metadata
     * row cannot share a transaction: the bytes go to storage outside the
     * database, and a rollback would not undo them. So the bytes are written
     * first and the row second, and a failure in between deletes the bytes. That
     * leaves the failure mode being an orphaned file with no row - invisible and
     * reclaimable - rather than a row pointing at a file that does not exist,
     * which would surface to a customer as a document that cannot be opened.
     */
    @Transactional
    public LoanDocumentDto.Response upload(
            Long loanId, MultipartFile file, String documentType, AuthenticatedUser caller) {

        Loan loan = requireAccessibleLoan(loanId, caller);
        requireUsableFile(file);
        String type = normaliseType(documentType);

        String key;
        try (InputStream content = file.getInputStream()) {
            key = documentStorage.store(loansDirectory(loanId), contentTypeOf(file), content);
        } catch (IOException e) {
            log.error("Failed to store a document for loan {}", loanId, e);
            throw new InvalidRequestException("The document could not be stored. Please try again.");
        }

        try {
            LoanDocument saved = loanDocumentRepository.save(LoanDocument.builder()
                    .loanId(loan.getLoanId())
                    .documentType(type)
                    .documentName(fileNameOf(file))
                    .storageKey(key)
                    .contentType(contentTypeOf(file))
                    .sizeBytes(file.getSize())
                    .build());
            log.info("Document {} attached to loan {}", saved.getDocumentId(), loanId);
            return LoanDocumentDto.Response.from(saved);
        } catch (RuntimeException e) {
            // The row is the thing customers and officers see. Without it the file
            // is inert, so dropping the bytes is the tidier of the two failures.
            deleteQuietly(key);
            throw e;
        }
    }

    // ------------------------------------------------------------------ reads

    @Transactional(readOnly = true)
    public List<LoanDocumentDto.Response> listForLoan(Long loanId, AuthenticatedUser caller) {
        Loan loan = requireAccessibleLoan(loanId, caller);
        return loanDocumentRepository.findByLoanIdOrderByUploadedAtAsc(loan.getLoanId()).stream()
                .map(LoanDocumentDto.Response::from)
                .toList();
    }

    /**
     * A document's bytes, for the owner of its loan or an officer reviewing it.
     *
     * <p>The loan is fetched through the document rather than the other way
     * round, so the ownership check is made against the application the document
     * actually belongs to and cannot be influenced by a second id in the path.
     */
    @Transactional(readOnly = true)
    public Download download(Long documentId, AuthenticatedUser caller) {
        LoanDocument document = loanDocumentRepository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Document not found with ID: " + documentId));

        requireAccessibleLoan(document.getLoanId(), caller);

        try {
            InputStream content = documentStorage.read(document.getStorageKey());
            return new Download(
                    new InputStreamResource(content),
                    document.getContentType(),
                    document.getDocumentName(),
                    document.getSizeBytes());
        } catch (IOException e) {
            // The row exists but the bytes do not. Reported as absent rather
            // than as a server error, because that is the situation: the document
            // is not available, whatever the reason.
            log.error("Document {} is recorded but its bytes could not be read", documentId, e);
            throw new ResourceNotFoundException("The document file is no longer available.");
        }
    }

    // ----------------------------------------------------------------- checks

    /**
     * Loads the loan and confirms the caller may act on it.
     *
     * <p>Answers 404 for a caller who may not see the loan, as elsewhere in this
     * system, so a wrong owner cannot be used to discover that a loan id exists.
     */
    private Loan requireAccessibleLoan(Long loanId, AuthenticatedUser caller) {
        Loan loan = loanRepository.findById(loanId)
                .orElseThrow(() -> new ResourceNotFoundException("Loan not found with ID: " + loanId));

        if (caller == null || !caller.canAccess(loan.getCustomer().getAccountNumber())) {
            throw new ResourceNotFoundException("Loan not found with ID: " + loanId);
        }
        return loan;
    }

    private static void requireUsableFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new InvalidRequestException("Choose a file to upload.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new InvalidRequestException(
                    "Documents must be 10 MB or smaller.");
        }
    }

    /**
     * The document type is free text by design - nothing in the system declares
     * a mandatory set - but blank is still refused, because an unclassified
     * document is one an officer cannot triage.
     */
    private static String normaliseType(String documentType) {
        if (documentType == null || documentType.isBlank()) {
            throw new InvalidRequestException("Describe what kind of document this is.");
        }
        String trimmed = documentType.trim();
        if (trimmed.length() > 40) {
            throw new InvalidRequestException("The document description is too long.");
        }
        return trimmed;
    }

    /** Kept server-side and stable, so a customer's file set is browsable on disk. */
    private static Path loansDirectory(Long loanId) {
        return Path.of("loans", String.valueOf(loanId));
    }

    /**
     * A multipart part that arrived without a type is reported as a binary
     * stream. Guessing from the extension would mean trusting the client's
     * filename, which is exactly the value the storage layer refuses to trust.
     */
    private static String contentTypeOf(MultipartFile file) {
        String type = file.getContentType();
        return type == null || type.isBlank() ? "application/octet-stream" : type;
    }

    /**
     * The name the file was uploaded under, reduced to something safe to echo
     * into a header or a page. Not used as a path anywhere.
     */
    private static String fileNameOf(MultipartFile file) {
        String name = file.getOriginalFilename();
        if (name == null || name.isBlank()) {
            return "document";
        }
        // Strip any directory component a client may have included, so a name
        // cannot read as a path in a Content-Disposition header.
        String base = Path.of(name.replace('\\', '/')).getFileName().toString();
        return base.length() > 255 ? base.substring(0, 255) : base;
    }

    private void deleteQuietly(String key) {
        try {
            documentStorage.delete(key);
        } catch (IOException | RuntimeException cleanupFailure) {
            // Nothing useful can be reported to the caller here: the operation
            // they asked for has already failed. Log it so the orphaned file is
            // at least traceable.
            log.error("Failed to clean up orphaned document {}", key, cleanupFailure);
        }
    }

    /** A document's bytes plus what a response needs to describe them. */
    public record Download(Resource resource, String contentType, String fileName, Long sizeBytes) {
    }
}
