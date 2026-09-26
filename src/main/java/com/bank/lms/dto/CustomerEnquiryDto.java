package com.bank.lms.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/** Registration payload for a new bank customer. */
public record CustomerEnquiryDto(

        @NotBlank(message = "Full name cannot be blank")
        @Size(max = 100, message = "Full name cannot exceed 100 characters")
        String fullName,

        @NotNull(message = "Date of birth is required")
        @Past(message = "Date of birth must be in the past")
        LocalDate dob,

        @NotBlank(message = "PAN number is strictly mandatory for KYC")
        @Pattern(regexp = "[A-Z]{5}[0-9]{4}[A-Z]",
                message = "PAN must match the format ABCDE1234F")
        String panNo,

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
