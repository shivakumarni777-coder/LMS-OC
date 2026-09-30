package com.bank.lms.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * Who a person is: the details needed to create their login and profile.
 *
 * <p>There is deliberately no PAN here. A PAN is a customer-record field, and a
 * customer record does not exist until an account has been opened - the account
 * being what a loan is booked against. Asking for the PAN at registration would
 * mean either storing it somewhere with no customer to hang it on, or creating
 * the customer record early, which is the thing the account-opening step exists
 * to avoid. The customer supplies their PAN later, on the account-opening form.
 */
public record CustomerProfileDto(

        @NotBlank(message = "Full name cannot be blank")
        @Size(max = 100, message = "Full name cannot exceed 100 characters")
        String fullName,

        @NotNull(message = "Date of birth is required")
        @Past(message = "Date of birth must be in the past")
        LocalDate dob,

        @NotBlank(message = "Phone number is required")
        @Pattern(regexp = "\\d{10}", message = "Phone number must be exactly 10 digits")
        String phoneNo,

        @NotBlank(message = "Email is required")
        @Email(message = "Please provide a valid email format")
        @Size(max = 100, message = "Email cannot exceed 100 characters")
        String email,

        @NotNull(message = "Branch code must be selected")
        Integer branchCode) {
}
