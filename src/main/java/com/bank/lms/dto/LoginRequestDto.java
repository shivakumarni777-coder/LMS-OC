package com.bank.lms.dto;

import com.bank.lms.entity.AppRole;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;

/** Login payload and identity payload. */
public record LoginRequestDto(

        @NotBlank(message = "Username is required")
        @Size(max = 50, message = "Username cannot exceed 50 characters")
        String username,

        @NotBlank(message = "Password is required")
        @Size(max = 100, message = "Password cannot exceed 100 characters")
        String password) {

    /**
     * Identity of the caller, returned by login and by {@code /api/auth/me}.
     *
     * <p>{@code dob}, {@code phoneNo} and {@code branchCode} are the customer's
     * own profile details. They are here, rather than behind a separate fetch,
     * because the account-opening page has to show the customer exactly what the
     * bank already holds before it asks them for the one thing it does not: a
     * PAN. Reading them from the identity the SPA already holds costs no request
     * and cannot be a second source of truth that disagrees with who is signed
     * in. They are null for staff logins, which have no customer profile.
     */
    public record Identity(
            Long userId,
            String username,
            String fullName,
            AppRole role,
            Long accountNumber,
            LocalDate dob,
            String phoneNo,
            Integer branchCode,
            Instant issuedAt) {
    }
}
