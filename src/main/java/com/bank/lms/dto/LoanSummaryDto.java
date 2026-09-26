package com.bank.lms.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Dashboard aggregate.
 *
 * <p>{@code byStatus} always carries an entry for every known status, including
 * those with a zero count, so the UI does not have to reason about missing keys.
 */
public record LoanSummaryDto(
        long totalLoans,
        BigDecimal totalPrincipal,
        BigDecimal totalOutstandingEmi,
        List<StatusBucket> byStatus) {

    /** One row per loan status. */
    public record StatusBucket(String status, long count, BigDecimal principal) {
    }
}
