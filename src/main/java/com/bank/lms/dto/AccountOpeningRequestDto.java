package com.bank.lms.dto;

import com.bank.lms.entity.AccountOpeningStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;

/**
 * A request to open a bank account.
 *
 * <p>The request carries a PAN and nothing else. Every other field of the
 * eventual customer record is copied from the customer's own profile when an
 * officer approves, so there is nothing here for a customer to get out of step
 * with the details they registered with.
 */
public final class AccountOpeningRequestDto {

    private AccountOpeningRequestDto() {
    }

    /**
     * What the customer submits. PAN is the only question asked.
     *
     * <p>The pattern admits either case. Validation runs on the raw body, before
     * {@code CustomerService.normalisePan} ever sees the value, so an upper-case-only
     * pattern here rejected a perfectly good PAN typed on a lower-case keyboard
     * and made the service's own tolerance unreachable over HTTP - the two
     * disagreed about whether {@code abcde1234f} was a valid PAN, and the one
     * that ran first won. Widening the character class is the whole fix: the
     * service upper-cases before the value is stored or compared, so the stored
     * PAN is upper-case either way and the format is unchanged.
     *
     * <p>Re-tightening this to {@code [A-Z]} would reintroduce that disagreement.
     * The upper-case invariant belongs to the service and the column, not to the
     * input check.
     */
    public record Request(

            @NotBlank(message = "PAN is required")
            @Pattern(regexp = "[A-Za-z]{5}[0-9]{4}[A-Za-z]", message = "PAN must match the format ABCDE1234F")
            String panNo) {
    }

    /**
     * What a customer sees about their own request.
     *
     * <p>The PAN comes back masked. It is a KYC identifier, and echoing it to a
     * page that merely reports "we have your request" would put it on the wire
     * for no benefit; the customer typed it seconds earlier, and the officer's
     * review screen is where an unmasked value is actually needed.
     */
    public record Response(
            Long requestId,
            AccountOpeningStatus status,
            String maskedPanNo,
            Instant requestedAt,
            Instant reviewedAt,
            String reviewNotes,
            Long resultingAccountNumber) {
    }

    /**
     * What an officer sees about someone else's request.
     *
     * <p>Deliberately the only customer-facing projection in the system that
     * carries a full PAN and date of birth, because verifying an application
     * against the documents is the one task that needs them. Reached only
     * through {@code /api/admin/**}, which the security filter chain restricts
     * to {@link com.bank.lms.entity.AppRole#ADMIN}.
     */
    public record AdminResponse(
            Long requestId,
            AccountOpeningStatus status,
            String panNo,
            String fullName,
            String email,
            String phoneNo,
            LocalDate dob,
            Integer branchCode,
            Instant requestedAt,
            Instant reviewedAt,
            String reviewNotes,
            Long resultingAccountNumber) {
    }

    /** An officer's decision. */
    public record Decision(

            @NotNull(message = "A decision is required")
            @Pattern(regexp = "APPROVED|REJECTED", message = "Decision must be APPROVED or REJECTED")
            String decision,

            @Size(max = 500, message = "Review notes cannot exceed 500 characters")
            String reviewNotes) {
    }
}
