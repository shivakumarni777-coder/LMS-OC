package com.bank.lms.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A bank branch.
 *
 * <p>Read-only in this application: branches are reference data owned by the
 * bank, and nothing here creates, renames or closes one. It is mapped purely so
 * the branch list served to the registration form comes from the same table the
 * {@code customer.branch_code} foreign key points at. A hardcoded list in the UI
 * can only ever be a guess at what is in this table, and when the two disagree
 * every insert fails on the constraint.
 */
@Entity
@Table(name = "branch")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Branch {

    @Id
    @Column(name = "branch_code")
    private Integer branchCode;

    @Column(name = "branch_name", nullable = false, length = 50)
    private String branchName;

    @Column(name = "address", nullable = false, length = 200)
    private String address;
}
