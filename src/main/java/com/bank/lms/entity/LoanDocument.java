package com.bank.lms.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;

/**
 * A supporting document submitted against one loan application.
 *
 * <p>Ownership is by {@code loanId}, not by account number. A document belongs to
 * the application it was submitted with, and that is what an officer reviews: the
 * question is "does this document support <em>this</em> application", not "does
 * this person hold this document". Keying by account number would make a
 * customer's document set accumulate across every loan they ever apply for, so
 * one application's supporting evidence would quietly become another's.
 *
 * <p>{@code documentType} is a free string. No set of document types is
 * mandatory anywhere in this system, so nothing here constrains the value and
 * there is no reference table to fall out of step with the business.
 *
 * <p>{@code storageKey} is deliberately the only pointer to the bytes. The
 * document itself lives behind
 * {@link com.bank.lms.service.storage.DocumentStorage}, so swapping the backing
 * store is a configuration change and not a schema migration.
 *
 * <p>As elsewhere in this schema, no foreign key is declared; the association to
 * {@code loan.loan_id} is by convention.
 */
@Entity
@Table(name = "loan_document")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class LoanDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "document_id")
    private Long documentId;

    @Column(name = "loan_id", nullable = false)
    private Long loanId;

    @Column(name = "document_type", nullable = false, length = 40)
    private String documentType;

    /** The name the file was uploaded under, shown to the officer. */
    @Column(name = "document_name", nullable = false, length = 255)
    private String documentName;

    @Column(name = "storage_key", nullable = false, length = 500)
    private String storageKey;

    @Column(name = "content_type", nullable = false, length = 100)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private Long sizeBytes;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private LoanDocumentStatus status = LoanDocumentStatus.PENDING;

    @Column(name = "rejection_reason", length = 500)
    private String rejectionReason;

    @Column(name = "uploaded_at", nullable = false)
    private Instant uploadedAt;

    /** Stamps the upload time so a non-null column cannot be violated by a caller. */
    @PrePersist
    void stampUploadedAt() {
        if (uploadedAt == null) {
            uploadedAt = Instant.now();
        }
    }
}
