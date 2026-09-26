package com.bank.lms.dto;

import jakarta.validation.constraints.*;
import lombok.Data;
import java.time.LocalDate;

@Data // Lombok annotation that generates Getters, Setters, toString, etc.
public class CustomerEnquiryDto {

    @NotBlank(message = "PAN number is strictly mandatory for KYC")
    @Size(min = 10, max = 10, message = "PAN number must be exactly 10 characters")
    private String panNo;

    @NotBlank(message = "Full name cannot be blank")
    private String fullName;

    @NotBlank(message = "Phone number is required")
    @Pattern(regexp = "^\\d{10}$", message = "Phone number must be exactly 10 digits")
    private String phoneNo;

    @Email(message = "Please provide a valid email format")
    @NotBlank
    private String email;

    @NotNull(message = "Date of Birth is required")
    private LocalDate dob;

    @NotNull(message = "Branch Code must be selected")
    private Integer branchCode;
}