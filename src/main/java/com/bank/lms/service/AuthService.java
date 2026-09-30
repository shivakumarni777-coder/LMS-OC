package com.bank.lms.service;

import com.bank.lms.dto.LoginRequestDto;
import com.bank.lms.security.AuthenticatedUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.time.Instant;

/**
 * Credential verification and session priming.
 *
 * <p>On success the authentication is written into the {@code SecurityContext}
 * and Spring Security persists it to the HTTP session. Nothing token-shaped is
 * ever returned to the browser.
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final AuthenticationManager authenticationManager;

    public AuthService(AuthenticationManager authenticationManager) {
        this.authenticationManager = authenticationManager;
    }

    /**
     * Verifies credentials and establishes the session.
     *
     * @throws BadCredentialsException for any failure, so an attacker cannot
     *                                 distinguish an unknown username from a
     *                                 wrong password or a disabled account
     */
    public LoginRequestDto.Identity authenticate(LoginRequestDto request) {
        try {
            Authentication authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.username(), request.password()));

            // Persist for this request; the session filter carries it onward.
            SecurityContextHolder.getContext().setAuthentication(authentication);

            AuthenticatedUser principal = (AuthenticatedUser) authentication.getPrincipal();
            log.info("Successful login for '{}' ({})", principal.getUsername(), principal.getRole());

            return toIdentity(principal);
        } catch (DisabledException ex) {
            throw new BadCredentialsException("Invalid username or password.", ex);
        } catch (AuthenticationException ex) {
            log.warn("Failed login attempt for '{}'", request.username());
            throw new BadCredentialsException("Invalid username or password.", ex);
        }
    }

    /** Identity of the caller, or {@code null} when not authenticated. */
    public LoginRequestDto.Identity currentIdentity() {
        if (SecurityContextHolder.getContext().getAuthentication() == null) {
            return null;
        }
        return toIdentity((AuthenticatedUser) SecurityContextHolder.getContext()
                .getAuthentication().getPrincipal());
    }

    private static LoginRequestDto.Identity toIdentity(AuthenticatedUser user) {
        return new LoginRequestDto.Identity(
                user.getUserId(),
                user.getUsername(),
                user.getFullName(),
                user.getRole(),
                user.getAccountNumber(),
                user.getDob(),
                user.getPhoneNo(),
                user.getBranchCode(),
                Instant.now());
    }
}
