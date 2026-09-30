package com.bank.lms.security;

import com.bank.lms.entity.AppRole;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Re-reads a customer session's principal from the database, so an account
 * granted while they were signed in becomes visible to the session that asked
 * for it.
 *
 * <p>{@link AuthenticatedUser} is a snapshot of an {@code app_user} row taken once,
 * at login, and then carried in the session. Opening an account writes the new
 * account number to that row from a completely different session - the officer's
 * - so the row and the customer's snapshot disagree, and the session is the one
 * every ownership check reads. Before this filter existed, a customer whose
 * account had just been approved still held a principal with a null account
 * number, and therefore: {@code GET /api/account/status} reported no account,
 * {@code GET /api/loans} and {@code /loans/summary} answered 404, and
 * {@code POST /api/loans/apply} was refused as an unknown account. The only
 * recovery was to sign out and sign in again, which is not something a customer
 * can be expected to know to do, and which the account-opening page gives them no
 * hint of. Re-logging in is also the one recovery that would work, which is what
 * makes this a staleness bug rather than a modelling one.
 *
 * <p>The refresh is deliberately narrow. It runs only for a principal that is a
 * customer with no account number, which is exactly the window between
 * registering and being approved. Once refreshed, the replacement principal
 * carries the account number and the condition stops matching, so the steady
 * state costs one indexed primary-key read that a pre-approval customer's
 * requests already imply, and nothing at all afterwards. An administrator is
 * never touched: a staff login has a null account number permanently, so
 * refreshing on that basis would put a query in front of every request an
 * officer ever makes.
 *
 * <p>Authority is not widened by any of this. The replacement is built by
 * {@link AppUserDetailsService#loadUserByUsername(String)} - the same code path
 * the login itself goes through, reading the same row and applying the same
 * enabled check - so a refresh can only ever make the session agree with what the
 * database currently says, never agree with something more. Role, ownership and
 * the CSRF token are untouched; nothing here grants, and a principal that cannot
 * be reloaded is left alone rather than replaced or terminated.
 *
 * <p>Sits immediately after {@code SecurityContextHolderFilter}, so the context is
 * loaded before it is read and every authorization decision downstream sees the
 * refreshed value.
 */
public class SessionPrincipalRefreshFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(SessionPrincipalRefreshFilter.class);

    private final AppUserDetailsService userDetailsService;
    private final SecurityContextRepository securityContextRepository;

    public SessionPrincipalRefreshFilter(AppUserDetailsService userDetailsService,
                                         SecurityContextRepository securityContextRepository) {
        this.userDetailsService = userDetailsService;
        this.securityContextRepository = securityContextRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        Authentication current = SecurityContextHolder.getContext().getAuthentication();
        if (current != null && current.getPrincipal() instanceof AuthenticatedUser sessionUser
                && needsRefresh(sessionUser)) {
            refresh(sessionUser, request, response);
        }

        filterChain.doFilter(request, response);
    }

    /** True only for the pre-approval window a customer actually passes through. */
    private static boolean needsRefresh(AuthenticatedUser user) {
        return user.getRole() == AppRole.CUSTOMER && !user.isCustomerWithAccount();
    }

    private void refresh(AuthenticatedUser sessionUser,
                         HttpServletRequest request,
                         HttpServletResponse response) {

        AuthenticatedUser fresh;
        try {
            fresh = (AuthenticatedUser) userDetailsService.loadUserByUsername(sessionUser.getUsername());
        } catch (UsernameNotFoundException ex) {
            // The login is gone, or has since been disabled. Nothing is refreshed and
            // the session is left exactly as it was: whether a disabled login should be
            // able to keep an open session is a separate question from this one, and
            // answering it here would be a behaviour change nobody asked for. The
            // principal is left as-is rather than cleared, because a stale principal is
            // the defect being fixed and inventing a second one mid-request is not.
            log.warn("Skipped the session refresh for '{}': the login is unknown or disabled",
                    sessionUser.getUsername());
            return;
        }

        if (!fresh.isCustomerWithAccount()) {
            // Still no account: nothing to correct, and re-saving would only churn the
            // session id for a value identical to the one it already holds.
            return;
        }

        // Erased before the token is built, so the hash never reaches the session - the
        // same end state the authentication provider leaves behind after a successful
        // login, and the reason a stored principal has a null password.
        fresh.eraseCredentials();
        Authentication refreshed = UsernamePasswordAuthenticationToken.authenticated(
                fresh, null, fresh.getAuthorities());

        SecurityContextHolder.getContext().setAuthentication(refreshed);

        // Saved explicitly, for the same reason AuthController saves it after a login:
        // SecurityContextHolderFilter persists the context it loaded on the way in, so
        // a context replaced during the request would otherwise not reach the session
        // and every subsequent request would repeat this lookup. If a future version
        // were to save the newer context on the way out instead, this call is simply
        // redundant - the flow does not depend on it, because the filter would re-read
        // the row on the next request either way.
        securityContextRepository.saveContext(
                SecurityContextHolder.getContext(), request, response);

        log.info("Refreshed the session for '{}', which was signed in before account {} was opened",
                sessionUser.getUsername(), fresh.getAccountNumber());
    }
}
