package com.bank.lms.dto;

import com.bank.lms.entity.Loan;

import java.math.BigDecimal;
import java.time.LocalDate;

/** Loan projection returned to clients. */
public record LoanResponseDto(
        Long loanId,
        Long accountNumber,
        String loanType,
        BigDecimal principalAmount,
        BigDecimal interestRate,
        String loanStatus,
        LocalDate applicationDate,
        Integer tenureMonths,
        BigDecimal monthlyEmi) {

    /**
     * Maps a {@link Loan} to its wire representation.
     *
     * <p>Must be called while the persistence context is open: the
     * {@code customer} association is {@code LAZY} and open-in-view is off.
     */
    public static LoanResponseDto from(Loan loan) {
        return new LoanResponseDto(
                loan.getLoanId(),
                loan.getCustomer() == null ? null : loan.getCustomer().getAccountNumber(),
                loan.getLoanType(),
                loan.getPrincipalAmount(),
                loan.getInterestRate(),
                loan.getLoanStatus(),
                loan.getApplicationDate(),
                loan.getTenureMonths(),
                loan.getMonthlyEmi());
    }
}
