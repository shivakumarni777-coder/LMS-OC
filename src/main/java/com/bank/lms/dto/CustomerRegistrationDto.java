package com.bank.lms.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Registration payload: KYC details plus the credential to create.
 *
 * <p>The login username is the customer's email address, so there is no second
 * identifier for a user to invent and remember. Credentials live in their own
 * nested object rather than being mixed into {@link CustomerEnquiryDto}, which
 * keeps the KYC contract reusable for staff-entered enquiries that have no
 * password attached.
 */
public record CustomerRegistrationDto(

        @NotBlank(message = "Password is required")
        @Size(min = 10, message = "Password must be at least 10 characters")
        @Size(max = 72, message = "Password cannot exceed 72 characters")
        String password,

        @Valid
        CustomerEnquiryDto customer) {

    /** Result of a successful registration. */
    public record Result(
            CustomerResponseDto customer,
            String username) {
    }
}
