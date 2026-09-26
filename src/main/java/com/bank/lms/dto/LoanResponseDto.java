package com.bank.lms.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class LoanResponseDto {
    private Long loanId;
    private String loanType;
    private BigDecimal principalAmount;
    private BigDecimal interestRate;
    private String loanStatus;
    private LocalDate applicationDate;

    // added later
    private Integer tenureMonths;
    private BigDecimal monthlyEmi;

}