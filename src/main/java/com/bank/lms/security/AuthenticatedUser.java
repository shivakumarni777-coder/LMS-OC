package com.bank.lms.security;

import com.bank.lms.entity.AppRole;
import com.bank.lms.entity.AppUser;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

/**
 * Authenticated principal.
 *
 * <p>Carries the caller's account number so ownership checks need no second
 * database round trip. It is {@code null} for staff logins such as the
 * bootstrap administrator, and for a customer who has registered a profile but
 * not yet had an account opened, which is why {@link #canAccess(Long)} must
 * tolerate a null rather than assume every principal owns a customer record.
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
    private final LocalDate dob;
    private final String phoneNo;
    private final Integer branchCode;
    private final boolean enabled;

    private String passwordHash;

    public AuthenticatedUser(AppUser user) {
        this.userId = user.getUserId();
        this.username = user.getUsername();
        this.fullName = user.getFullName();
        this.role = user.getRole();
        this.accountNumber = user.getAccountNumber();
        this.dob = user.getDob();
        this.phoneNo = user.getPhoneNo();
        this.branchCode = user.getBranchCode();
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

    /** Null for staff logins, which have no customer profile. */
    public LocalDate getDob() {
        return dob;
    }

    /** Null for staff logins, which have no customer profile. */
    public String getPhoneNo() {
        return phoneNo;
    }

    /** Null for staff logins, which have no customer profile. */
    public Integer getBranchCode() {
        return branchCode;
    }

    /**
     * True when this login is a customer whose bank account has been opened.
     *
     * <p>Distinguishes the two reasons {@link #getAccountNumber()} can be null:
     * a staff login, which is not a customer at all and will never have an
     * account, and a customer who has registered but has not yet been approved.
     * The account number alone cannot tell those apart, and code that needs to
     * know the difference has to look at the role as well.
     *
     * <p>Not part of any request path. Ownership checks go through
     * {@link #canAccess(Long)}, which the loan and document flows use; the
     * account-opening page reads {@code GET /api/account/status} instead, since
     * that also reports where a pending request has got to. This is here for the
     * narrow case of a caller that has to tell the two kinds of null apart on a
     * principal it already holds.
     */
    public boolean isCustomerWithAccount() {
        return role == AppRole.CUSTOMER && accountNumber != null;
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
