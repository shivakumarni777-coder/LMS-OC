package com.bank.lms.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.time.LocalDate;

/**
 * A request to open a bank account for a login that has none.
 *
 * <p>Ownership is by {@code userId}, not by account number, because no account
 * number exists yet - that is the whole point of the request. Every other
 * {@link Customer} field is copied from the {@link AppUser}'s profile when the
 * request is approved; the PAN is the only thing the customer supplies here,
 * because it is the one piece of a customer record that is not collected at
 * registration.
 *
 * <p>No foreign key is declared. That matches the rest of the schema, where
 * {@code app_user.account_number}, {@code loan_application.cif_no} and
 * {@code loan_account.cif_number} are all unconstrained columns rather than
 * associations.
 */
@Entity
@Table(name = "account_opening_request")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class AccountOpeningRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "request_id")
    private Long requestId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "pan_no", nullable = false, length = 10)
    private String panNo;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private AccountOpeningStatus status;

    @Column(name = "review_notes", length = 500)
    private String reviewNotes;

    /** The account number minted on approval. Null until then. */
    @Column(name = "resulting_account_number")
    private Long resultingAccountNumber;

    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    /** The {@code app_user.user_id} of the officer who decided it. */
    @Column(name = "reviewed_by")
    private Long reviewedBy;

    /**
     * Stamps the submission time on the way into the database.
     *
     * <p>As with {@link AppUser#stampCreatedAt()}, this lives on the entity so
     * that a non-null column cannot be violated by a caller who forgets it.
     */
    @PrePersist
    void stampRequestedAt() {
        if (requestedAt == null) {
            requestedAt = Instant.now();
        }
    }
}
