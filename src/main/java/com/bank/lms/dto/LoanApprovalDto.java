package com.bank.lms.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * Loan approval payload.
 *
 * <p>The tenure bound matters: the EMI formula divides by
 * {@code (1 + r)^n - 1}, so a tenure of 0 would be a division by zero and a
 * negative tenure would silently produce a negative EMI.
 */
public record LoanApprovalDto(

        @NotNull(message = "Tenure is required")
        @Min(value = 1, message = "Tenure must be at least 1 month")
        @Max(value = 480, message = "Tenure cannot exceed 480 months (40 years)")
        Integer tenureMonths) {
}
