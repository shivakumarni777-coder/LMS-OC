package com.bank.lms.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import lombok.*;
import java.math.BigDecimal;

@Entity
@Table(name = "loan_application")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class LoanApplication {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "app_id")
    private Integer appId;

    @NotNull
    @Column(name = "cif_no", nullable = false)
    private Integer cifNo;

    @NotNull
    @Column(name = "loan_code", nullable = false)
    private Integer loanCode;

    @NotNull
    @Column(name = "branch_code", nullable = false)
    private Integer branchCode;

    @NotNull
    @DecimalMin(value = "1000.00")
    @Column(name = "requested_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal requestedAmount;

    @Column(name = "current_status", length = 30)
    private String currentStatus;
}