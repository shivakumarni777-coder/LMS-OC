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

/**
 * A login that can authenticate against the system.
 *
 * <p>{@code accountNumber} links a login to the customer it belongs to. It is
 * {@code null} for staff accounts such as the bootstrap administrator, which is
 * why ownership checks must tolerate a null rather than assume every principal
 * owns a customer record.
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
