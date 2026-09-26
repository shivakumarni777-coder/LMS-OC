package com.bank.lms.dto;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class LoanRequestDto {
    private Long accountNumber; // To link the loan to the specific customer
    private String loanType;
    private BigDecimal principalAmount;
}