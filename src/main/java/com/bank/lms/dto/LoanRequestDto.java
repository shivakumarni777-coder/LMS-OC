package com.bank.lms.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.math.BigDecimal;

/** Loan application payload. */
public record LoanRequestDto(

        @NotNull(message = "Account number is required")
        Long accountNumber,

        @NotBlank(message = "Loan type is required")
        @Pattern(regexp = "HOME|EDUCATION|PERSONAL", message = "Loan type must be HOME, EDUCATION or PERSONAL")
        String loanType,

        @NotNull(message = "Principal amount is required")
        @DecimalMin(value = "1000.00", message = "Principal amount must be at least 1,000")
        @Digits(integer = 12, fraction = 2, message = "Principal amount supports up to 12 digits and 2 decimals")
        BigDecimal principalAmount) {
}
