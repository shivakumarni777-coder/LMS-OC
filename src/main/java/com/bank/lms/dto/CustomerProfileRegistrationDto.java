package com.bank.lms.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Registration payload: a person's profile plus the credential to create.
 *
 * <p>The login username is the customer's email address, so there is no second
 * identifier for a user to invent and remember. Credentials live in their own
 * nested object rather than being mixed into {@link CustomerProfileDto}, which
 * keeps the profile contract reusable for an officer-entered enquiry that has no
 * password attached.
 *
 * <p>Registering creates a login and a profile only. It does not open a bank
 * account: the account is opened by a separate account-opening request, which the
 * customer submits once they are signed in and which an officer approves.
 */
public record CustomerProfileRegistrationDto(

    @NotBlank(message = "Password is required")
    @Size(min = 10, message = "Password must be at least 10 characters")
    @Size(max = 72, message = "Password cannot exceed 72 characters")
    String password,

    /**
     * {@code @NotNull} as well as {@code @Valid}, and the two are not
     * interchangeable: {@code @Valid} cascades into the nested object and does
     * nothing at all when that object is null, so a request carrying only a
     * password would pass validation and then fail on a dereference inside the
     * service. Being a nullability question, it is {@code @NotNull}'s to answer.
     */
    @NotNull(message = "Customer details are required")
    @Valid
    CustomerProfileDto profile) {

    /**
     * Result of a successful registration.
     *
     * <p>{@code accountNumber} is null. It cannot be anything else, because no
     * account exists until the account-opening request is approved.
     */
    public record Result(
            String username,
            String fullName,
            String email,
            Long accountNumber) {
    }
}
