package com.bank.lms.dto;

import com.bank.lms.entity.LoanDocument;
import com.bank.lms.entity.LoanDocumentStatus;

import java.time.Instant;

/**
 * What a document upload and list look like on the wire.
 *
 * <p>No {@code storageKey} on the way out. The key is an internal pointer to a
 * file on the server's disk; exposing it would invite clients to build their own
 * paths against it, and the download endpoint already accepts a document id
 * instead.
 */
public final class LoanDocumentDto {

    private LoanDocumentDto() {
    }

    /** The result of a successful upload, and each row of the document list. */
    public record Response(
            Long documentId,
            Long loanId,
            String documentType,
            String documentName,
            String contentType,
            Long sizeBytes,
            LoanDocumentStatus status,
            String rejectionReason,
            Instant uploadedAt) {

        public static Response from(LoanDocument document) {
            return new Response(
                    document.getDocumentId(),
                    document.getLoanId(),
                    document.getDocumentType(),
                    document.getDocumentName(),
                    document.getContentType(),
                    document.getSizeBytes(),
                    document.getStatus(),
                    document.getRejectionReason(),
                    document.getUploadedAt());
        }
    }
}
