package com.bank.lms.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Data
public class Loan {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long loanId;

    private String loanType; // e.g., "Home", "Personal", "Education"

    // We use BigDecimal for precise financial math, never standard doubles
    private BigDecimal principalAmount;

    private BigDecimal interestRate;

    private String loanStatus; // "PENDING", "APPROVED", "DISBURSED"

    private LocalDate applicationDate;

    //new fields were added here
    private Integer tenureMonths;
    private BigDecimal monthlyEmi;

    // The Foreign Key mapping many loans to one customer
    @ManyToOne(fetch = FetchType.LAZY)

    @JoinColumn(name = "account_number", referencedColumnName = "account_number")
    private Customer customer;


}