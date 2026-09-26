package com.bank.lms.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "loan_account")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class LoanAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "account_number")
    private Long accountNumber;

    @NotNull
    @Column(name = "cif_number", nullable = false)
    private Integer cifNumber;

    @NotNull
    @Column(name = "application_id", unique = true, nullable = false)
    private Integer applicationId;

    @Column(name = "loan_type", length = 50)
    private String loanType;

    @NotNull
    @Column(name = "sanctioned_amount", precision = 12, scale = 2)
    private BigDecimal sanctionedAmount;

    @NotNull
    @Column(name = "sanctioned_date")
    private LocalDate sanctionedDate;

    @Column(name = "insurance_number", length = 50)
    private String insuranceNumber;

    @Column(name = "insurance_status", length = 20)
    private String insuranceStatus;

    @Column(name = "sanctioned_status")
    private Boolean sanctionedStatus;

    @Column(name = "loan_account_status", length = 20)
    private String loanAccountStatus; // STANDARD, SMA, NPA, CLOSED
}