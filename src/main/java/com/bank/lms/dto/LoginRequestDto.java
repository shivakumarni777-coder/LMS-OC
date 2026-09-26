package com.bank.lms.dto;

import com.bank.lms.entity.AppRole;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;

/** Login payload and identity payload. */
public record LoginRequestDto(

        @NotBlank(message = "Username is required")
        @Size(max = 50, message = "Username cannot exceed 50 characters")
        String username,

        @NotBlank(message = "Password is required")
        @Size(max = 100, message = "Password cannot exceed 100 characters")
        String password) {

    /** Identity of the caller, returned by login and by {@code /api/auth/me}. */
    public record Identity(
            Long userId,
            String username,
            String fullName,
            AppRole role,
            Long accountNumber,
            Instant issuedAt) {
    }
}
