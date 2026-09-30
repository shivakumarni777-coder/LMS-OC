package com.bank.lms.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.time.LocalDate;

/**
 * A login that can authenticate against the system.
 *
 * <p>{@code accountNumber} links a login to the customer it belongs to. It is
 * {@code null} in two cases: for staff accounts such as the bootstrap
 * administrator, and for a customer who has registered a profile but has not yet
 * had a bank account opened for them. Ownership checks must tolerate a null
 * rather than assume every principal owns a customer record.
 *
 * <p>{@code dob}, {@code phoneNo} and {@code branchCode} are the profile fields a
 * customer supplies when they register, before any account exists. They exist so
 * that opening an account later needs nothing but the PAN the customer types on
 * the account-opening form: without them, {@link Customer}'s mandatory
 * date-of-birth, phone and branch columns would have no source and the approval
 * step would have to invent values. They are nullable because staff logins have
 * no customer profile at all.
 */
@Entity
@Table(name = "app_user")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AppUser {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "username", nullable = false, unique = true, length = 50)
    private String username;

    /** BCrypt hash. Never the plaintext. */
    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 20)
    private AppRole role;

    @Column(name = "account_number", unique = true)
    private Long accountNumber;

    @Column(name = "full_name", length = 100)
    private String fullName;

    /** Profile fields, captured at registration. Nullable: staff logins have none. */
    @Column(name = "dob")
    private LocalDate dob;

    @Column(name = "phone_no", length = 15)
    private String phoneNo;

    @Column(name = "branch_code")
    private Integer branchCode;

    @Column(name = "enabled", nullable = false)
    @Builder.Default
    private boolean enabled = true;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    /**
     * Stamps the creation time on the way into the database.
     *
     * <p>This is deliberately on the entity rather than in the callers. Every
     * login is built with {@code AppUser.builder()}, and there is more than one
     * place that does it (the bootstrap administrator, customer registration),
     * so relying on each caller to remember the timestamp is how
     * {@code created_at NOT NULL} ends up violated in production. Assigning it
     * here makes the column's constraint impossible to break.
     */
    @PrePersist
    void stampCreatedAt() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
