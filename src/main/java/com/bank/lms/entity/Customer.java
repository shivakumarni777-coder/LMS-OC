package com.bank.lms.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import lombok.*;
import java.time.LocalDate;

@Entity
@Table(name = "customer")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Customer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "cif_no")
    private Integer cifNo;

    @NotNull
    @Column(name = "account_number", unique = true, nullable = false)
    private Long accountNumber;

    @NotBlank
    @Size(min = 10, max = 10)
    @Column(name = "pan_no", unique = true, nullable = false, length = 10)
    private String panNo;

    @NotBlank
    @Column(name = "full_name", nullable = false, length = 100)
    private String fullName;

    @NotBlank
    @Column(name = "phone_no", nullable = false, length = 15)
    private String phoneNo;

    @NotNull
    @Column(name = "dob", nullable = false)
    private LocalDate dob;

    @Email
    @NotBlank
    @Column(name = "email", unique = true, nullable = false, length = 100)
    private String email;

    @Column(name = "branch_code", nullable = false)
    private Integer branchCode;
}