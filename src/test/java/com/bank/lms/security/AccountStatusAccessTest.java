package com.bank.lms.security;

import com.bank.lms.entity.AccountOpeningRequest;
import com.bank.lms.entity.AccountOpeningStatus;
import com.bank.lms.entity.AppRole;
import com.bank.lms.entity.AppUser;
import com.bank.lms.repository.AccountOpeningRequestRepository;
import com.bank.lms.repository.AppUserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Who may read the account status, tested through the real filter chain.
 *
 * <p>The matcher in {@link SecurityConfig} already restricts
 * {@code /api/account/status} to {@code CUSTOMER}, so this test exists to keep
 * it that way rather than to establish it. Authorization rules are exactly the
 * kind of change that passes review: the endpoint is about a customer's own
 * record, everyone who can reach it is by definition a customer, and a widened
 * {@code authenticated()} would be invisible. This had already been read as
 * "falls through to anyRequest()" - in error - with nothing in the suite to
 * contradict it.
 *
 * <p>A full-context MockMvc rather than the standalone setup used by
 * {@code CustomerRegistrationWebTest}, because that one deliberately bypasses
 * the filter chain and so could not see a matcher at all. A GET is used
 * throughout so CSRF never enters into it: the point of interest is the
 * authorization decision, and a POST refused for a missing token would be a 403
 * for the wrong reason.
 *
 * <p>Sessions are built by hand because {@code spring-security-test} is not a
 * dependency. That is not a shortcut around the filter chain - the
 * {@code SecurityContext} is placed where {@code HttpSessionSecurityContextRepository}
 * keeps it, so the same loading and the same {@code AuthorizationFilter} run as
 * in production.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AccountStatusAccessTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AppUserRepository appUserRepository;

    @Autowired
    private AccountOpeningRequestRepository accountOpeningRequestRepository;

    @Test
    @DisplayName("an anonymous caller is turned away, not shown a customer-shaped answer")
    void anonymousCallersAreRefused() throws Exception {
        mockMvc.perform(get("/api/account/status"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Authentication required."));
    }

    @Test
    @DisplayName("an administrator is refused, because the question is about a customer")
    void administratorsAreRefused() throws Exception {
        // An admin asking this is asking a question with no valid answer: they
        // have no customer record, so the honest response would be hasBankAccount
        // false, which reads as "apply for an account" to anyone who saw it. A 403
        // says the question does not apply, which is the truth.
        mockMvc.perform(get("/api/account/status").session(adminSession()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message")
                        .value("You do not have permission to perform this action."));
    }

    @Test
    @DisplayName("a customer is let through, and told the truth about having no account")
    void customersAreLetThrough() throws Exception {
        // The same URL, the same filter chain, the same controller - reached by the
        // one role that owns the answer.
        mockMvc.perform(get("/api/account/status").session(customerSession(8801L, null)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasBankAccount").value(false));
    }

    @Test
    @DisplayName("never applied is reported by omission, not by a null")
    void neverAppliedIsReportedByOmission() throws Exception {
        // The two absent fields are the "never applied" case. Asserted explicitly
        // because the frontend branches on their presence: a null would be
        // indistinguishable from a bug, and Jackson omits nulls entirely, so the
        // key genuinely is not there.
        mockMvc.perform(get("/api/account/status").session(customerSession(8804L, null)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasBankAccount").value(false))
                .andExpect(jsonPath("$.accountNumber").doesNotExist())
                .andExpect(jsonPath("$.accountOpeningRequest").doesNotExist())
                // Guards the record's wire shape against a convenience accessor
                // leaking into it. A record is serialised from its accessors like
                // any other bean, so an isXxx() helper is not private detail - it
                // becomes a field on every response. One did: isAwaitingReview()
                // shipped as a stray "awaitingReview": false, false for a customer
                // with an account and one who has never applied alike.
                .andExpect(jsonPath("$.awaitingReview").doesNotExist());
    }


    @Test
    @DisplayName("a customer with an account gets the number and no request")
    void anExistingAccountIsReported() throws Exception {
        mockMvc.perform(get("/api/account/status").session(customerSession(8805L, 304012345678L)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasBankAccount").value(true))
                .andExpect(jsonPath("$.accountNumber").value(304012345678L))
                .andExpect(jsonPath("$.accountOpeningRequest").doesNotExist());
    }

    @Test
    @DisplayName("the refusal is specific to this endpoint, not to administrators")
    void administratorsAreNotLockedOutOfTheirOwnEndpoints() throws Exception {
        // The control for the test above. A 403 there is only evidence of a
        // working matcher if administrators can still reach what is theirs;
        // otherwise it would be equally consistent with a filter chain that
        // refuses everyone.
        mockMvc.perform(get("/api/admin/accounts/requests").session(adminSession()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }

    @Test
    @DisplayName("a rejection reaches the customer with its reason, and no unmasked PAN")
    void aRejectionIsReportedWithItsReasonAndAMaskedPan() throws Exception {
        // Seeded rather than mocked, so this is the real projection the real
        // mapper produces - the requirement is about what is on the wire, and a
        // mocked service would only be asserting what the DTO was told to say.
        AppUser user = appUserRepository.save(AppUser.builder()
                .username("rejected.customer@example.com")
                .passwordHash("{bcrypt}irrelevant")
                .role(AppRole.CUSTOMER)
                .fullName("Rejected Customer")
                .dob(LocalDate.of(1991, 5, 5))
                .phoneNo("9000000009")
                .branchCode(101)
                .enabled(true)
                .build());
        accountOpeningRequestRepository.save(AccountOpeningRequest.builder()
                .userId(user.getUserId())
                .panNo("ABCDE1234F")
                .status(AccountOpeningStatus.REJECTED)
                .reviewNotes("PAN illegible - the fourth character is not a digit")
                .requestedAt(Instant.parse("2026-09-20T09:15:00Z"))
                .reviewedAt(Instant.parse("2026-09-21T14:00:00Z"))
                .build());

        String body = mockMvc.perform(get("/api/account/status")
                        .session(customerSession(user.getUserId(), null)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasBankAccount").value(false))
                .andExpect(jsonPath("$.accountOpeningRequest.status").value("REJECTED"))
                .andExpect(jsonPath("$.accountOpeningRequest.reviewNotes")
                        .value("PAN illegible - the fourth character is not a digit"))
                .andExpect(jsonPath("$.accountOpeningRequest.reviewedAt")
                        .value("2026-09-21T14:00:00Z"))
                .andExpect(jsonPath("$.accountOpeningRequest.maskedPanNo").value("XXXXX1234X"))
                .andReturn().getResponse().getContentAsString();

        // Asserted on the raw body rather than through jsonPath, because
        // jsonPath("$.panNo").doesNotExist() would also pass if the whole request
        // object were null and every path beneath it missing. This is the check
        // that the full PAN is not in the response at all, anywhere - it was
        // typed in by the customer, so echoing it tells them nothing they do not
        // know, but it is data the officer's copy is derived from and it should
        // not be the customer's to see.
        assertFalse(body.contains("ABCDE1234F"), body);
    }

    // ----------------------------------------------------------------- sessions

    private static AuthenticatedUser principal(Long userId, String username, AppRole role,
                                                Long accountNumber) {
        return new AuthenticatedUser(AppUser.builder()
                .userId(userId)
                .username(username)
                // Null in a real session: Spring Security erases it once
                // authentication succeeds, and the filter chain never reads it.
                .passwordHash(null)
                .role(role)
                .accountNumber(accountNumber)
                .fullName("Test User")
                .dob(LocalDate.of(1990, 1, 1))
                .phoneNo("9000000000")
                .branchCode(101)
                .enabled(true)
                .build());
    }

    private static MockHttpSession adminSession() {
        return sessionFor(principal(1L, "admin", AppRole.ADMIN, null));
    }

    private static MockHttpSession customerSession(Long userId, Long accountNumber) {
        return sessionFor(principal(userId, "customer" + userId + "@example.com",
                AppRole.CUSTOMER, accountNumber));
    }

    /**
     * Places the principal where the filter chain will look for it.
     *
     * <p>Under the repository's own key, so {@code SecurityContextHolderFilter}
     * loads it through the configured
     * {@link org.springframework.security.web.context.DelegatingSecurityContextRepository}
     * exactly as it loads one written by a real login. Nothing here reaches past
     * the filter chain: the authorization decision is still made by
     * {@code hasRole("CUSTOMER")} against these authorities.
     */
    private static MockHttpSession sessionFor(AuthenticatedUser principal) {
        MockHttpSession session = new MockHttpSession();
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new UsernamePasswordAuthenticationToken(
                principal, null, principal.getAuthorities()));
        session.setAttribute(
                HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
        return session;
    }
}
