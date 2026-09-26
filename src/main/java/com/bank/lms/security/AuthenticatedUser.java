package com.bank.lms.security;

import com.bank.lms.entity.AppRole;
import com.bank.lms.entity.AppUser;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

/**
 * Authenticated principal.
 *
 * <p>Carries the caller's account number so ownership checks need no second
 * database round trip. It is {@code null} for staff logins such as the
 * bootstrap administrator, which is why {@link #canAccess(Long)} must tolerate
 * a null rather than assume every principal owns a customer record.
 *
 * <p>The password hash is held only for the duration of authentication:
 * {@link #eraseCredentials()} is invoked by Spring Security once the
 * comparison succeeds, so the hash is null in anything that reaches the
 * session store.
 */
public final class AuthenticatedUser implements UserDetails {

    private final Long userId;
    private final String username;
    private final String fullName;
    private final AppRole role;
    private final Long accountNumber;
    private final boolean enabled;

    private String passwordHash;

    public AuthenticatedUser(AppUser user) {
        this.userId = user.getUserId();
        this.username = user.getUsername();
        this.fullName = user.getFullName();
        this.role = user.getRole();
        this.accountNumber = user.getAccountNumber();
        this.enabled = user.isEnabled();
        this.passwordHash = user.getPasswordHash();
    }

    public Long getUserId() {
        return userId;
    }

    public String getFullName() {
        return fullName;
    }

    public Long getAccountNumber() {
        return accountNumber;
    }

    public AppRole getRole() {
        return role;
    }

    public boolean isAdmin() {
        return role == AppRole.ADMIN;
    }

    /** True when this principal may act on the given customer account. */
    public boolean canAccess(Long customerAccountNumber) {
        return isAdmin() || customerAccountNumber != null && customerAccountNumber.equals(accountNumber);
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return username;
    }

    @Override
    public boolean isEnabled() {
        return enabled;
    }

    /** Drops the hash once authentication has succeeded. */
    public void eraseCredentials() {
        this.passwordHash = null;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public String toString() {
        // Never let a credential reach a log line through an accidental toString.
        return "AuthenticatedUser[username=%s, role=%s, accountNumber=%s]"
                .formatted(username, role, accountNumber);
    }
}
