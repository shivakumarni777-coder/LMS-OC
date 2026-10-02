package com.bank.lms.security;

import com.bank.lms.entity.AccountOpeningRequest;
import com.bank.lms.entity.AccountOpeningStatus;
import com.bank.lms.entity.AppRole;
import com.bank.lms.entity.AppUser;
import com.bank.lms.repository.AccountOpeningRequestRepository;
import com.bank.lms.repository.AppUserRepository;
import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.time.LocalDate;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A state-changing request must present the token in the header, not merely carry
 * the cookie that publishes it.
 *
 * <p>The token is published twice on purpose: as a readable {@code XSRF-TOKEN}
 * cookie so the SPA can fetch it, and as the {@code X-XSRF-TOKEN} header the SPA
 * echoes back. Those are two different things, and the gap between them is what
 * this test pins down.
 *
 * <p>The reason it is not covered by
 * {@code AccountApprovalSessionRefreshTest#csrfIsStillRequiredOnTheGrantedAccount}
 * is that that test sends neither the cookie nor the header. With no cookie the
 * repository has nothing to load, generates a token and denies the request on the
 * spot - which looks like enforcement, but never reaches the case that actually
 * broke. Here the cookie is always present, so the only variable is the header.
 *
 * <p>Through the real filter chain rather than standalone MockMvc, because the
 * defect is in the interaction between the CSRF filter, the token repository and
 * the request handler. The session is hand-built under the repository's own key,
 * exactly as {@code HttpSessionSecurityContextRepository} keeps it, so the request
 * is authenticated by the real chain and rejected by the real filter - never by a
 * test shortcut.
 *
 * <p>Every case below passes against the configuration as it stands. The header is
 * already mandatory, and this file exists to keep it that way: it was reported as
 * optional during real-MySQL verification, and the client that reported it turned
 * out to be replaying a token it had been given earlier. A client that quietly
 * supplies the header looks exactly like a server that does not require it, from
 * the outside, so the only way to settle it is to drive the request through the
 * chain with the header deliberately withheld.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CsrfHeaderEnforcementTest {

    private static final String CSRF_COOKIE = "XSRF-TOKEN";
    private static final String CSRF_HEADER = "X-XSRF-TOKEN";

    private static final String FORGED_TOKEN =
            "11111111-2222-3333-4444-555555555555";

    /**
     * Prefix for the PANs this class approves accounts with.
     *
     * <p>Deliberately not {@code ABCDE}. Every {@code @SpringBootTest} on the test
     * profile shares one context and therefore one database, and nothing rolls back
     * between test methods, so a PAN minted here outlives the test that created it.
     * {@link AccountApprovalSessionRefreshTest} numbers its own PANs as
     * {@code ABCDE0001F} upwards from an independent static counter, so an
     * identically shaped scheme here restarts at 1, meets theirs partway, and the
     * approval fails with a 409 about a duplicate PAN that has nothing to do with
     * what is under test. A distinct prefix keeps the two namespaces disjoint.
     */
    private static final String PAN_PREFIX = "CSRFX";

    /** Static because JUnit builds a new instance per method; see the sibling test. */
    private static final AtomicInteger panSequence = new AtomicInteger();

    /** Keeps the KYC shape {@code [A-Z]{5}[0-9]{4}[A-Z]} the approval path expects. */
    private static String panFor(int index) {
        return PAN_PREFIX + String.format("%04d", index) + "F";
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AppUserRepository appUserRepository;

    @Autowired
    private AccountOpeningRequestRepository accountOpeningRequestRepository;

    /**
     * The account minted for the customer of the current test, so every mutating
     * request below carries a body the application will genuinely accept.
     */
    private Long accountNumber;

    // ------------------------------------------------------- the missing header

    @Test
    @DisplayName("a valid CSRF cookie is not a substitute for the header on a POST")
    void validCookieWithoutHeaderIsRejected() throws Exception {
        MockHttpSession session = signedInCustomerWithAccount("csrf.cookie.only@example.com");
        String token = issueToken();

        // The cookie is present and correct. The header is absent. This is the
        // request the real-MySQL probe answered 201 to.
        mockMvc.perform(applyForLoan(session)
                        .cookie(new Cookie(CSRF_COOKIE, token)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("the same request succeeds once the header carries the token")
    void validCookieWithHeaderSucceeds() throws Exception {
        MockHttpSession session = signedInCustomerWithAccount("csrf.cookie.header@example.com");
        String token = issueToken();

        mockMvc.perform(applyForLoan(session)
                        .cookie(new Cookie(CSRF_COOKIE, token))
                        .header(CSRF_HEADER, token))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.loanStatus").value("PENDING"));
    }

    @Test
    @DisplayName("a valid cookie with the wrong header is still rejected")
    void validCookieWithWrongHeaderIsRejected() throws Exception {
        MockHttpSession session = signedInCustomerWithAccount("csrf.cookie.wrong@example.com");
        String token = issueToken();

        mockMvc.perform(applyForLoan(session)
                        .cookie(new Cookie(CSRF_COOKIE, token))
                        .header(CSRF_HEADER, FORGED_TOKEN))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------- forged cookie

    @Test
    @DisplayName("a forged CSRF cookie with no header is rejected")
    void forgedCookieWithoutHeaderIsRejected() throws Exception {
        MockHttpSession session = signedInCustomerWithAccount("csrf.forged.none@example.com");

        mockMvc.perform(applyForLoan(session)
                        .cookie(new Cookie(CSRF_COOKIE, FORGED_TOKEN)))
                .andExpect(status().isForbidden());
    }

    // --------------------------------------------------------------- safe methods

    @Test
    @DisplayName("GET is unaffected and needs no token")
    void getRequestsRemainUnaffected() throws Exception {
        MockHttpSession session = signedInCustomerWithAccount("csrf.get.unaffected@example.com");

        mockMvc.perform(MockMvcRequestBuilders.get("/api/loans").session(session))
                .andExpect(status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.get("/api/account/status").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasBankAccount").value(true));

        // Even with a forged cookie attached, a safe method must not be refused.
        mockMvc.perform(MockMvcRequestBuilders.get("/api/loans").session(session)
                        .cookie(new Cookie(CSRF_COOKIE, FORGED_TOKEN)))
                .andExpect(status().isOk());
    }

    // ------------------------------------------------------------------- helpers

    /** A token exactly as the SPA obtains it: {@code GET /api/auth/csrf}. */
    private String issueToken() throws Exception {
        MvcResult primed = mockMvc.perform(MockMvcRequestBuilders.get("/api/auth/csrf"))
                .andExpect(status().isOk())
                .andReturn();
        String token = JsonPath.read(primed.getResponse().getContentAsString(), "$.token");
        assertNotNull(token, "the CSRF endpoint must publish a token");
        return token;
    }

    /**
     * A customer session holding a real account, so a request that passes CSRF has
     * a valid body to act on and the difference between 403 and 201 is the token
     * and nothing else.
     */
    private MockHttpSession signedInCustomerWithAccount(String username) throws Exception {
        AppUser customer = appUserRepository.save(AppUser.builder()
                .username(username)
                .passwordHash("{bcrypt}irrelevant")
                .role(AppRole.CUSTOMER)
                .fullName("Csrf Test Customer")
                .dob(LocalDate.of(1990, 1, 1))
                .phoneNo("9000000099")
                .branchCode(101)
                .enabled(true)
                .build());

        AccountOpeningRequest pending = accountOpeningRequestRepository.save(
                AccountOpeningRequest.builder()
                        .userId(customer.getUserId())
                        .panNo(panFor(panSequence.incrementAndGet()))
                        .status(AccountOpeningStatus.PENDING)
                        .build());

        Long minted = approveAsAdmin(pending);
        this.accountNumber = minted;
        return sessionFor(new AuthenticatedUser(AppUser.builder()
                .userId(customer.getUserId())
                .username(customer.getUsername())
                .passwordHash(null)
                .role(AppRole.CUSTOMER)
                .accountNumber(minted)
                .fullName(customer.getFullName())
                .dob(customer.getDob())
                .phoneNo(customer.getPhoneNo())
                .branchCode(customer.getBranchCode())
                .enabled(true)
                .build()));
    }

    /** Runs the officer's approval through the chain, CSRF included, as in production. */
    private Long approveAsAdmin(AccountOpeningRequest pending) throws Exception {        String token = issueToken();
        MvcResult approved = mockMvc.perform(MockMvcRequestBuilders
                        .put("/api/admin/accounts/requests/" + pending.getRequestId())
                        .session(adminSession())
                        .cookie(new Cookie(CSRF_COOKIE, token))
                        .header(CSRF_HEADER, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"decision": "APPROVED", "reviewNotes": "PAN and proof checked."}
                                """))
                .andReturn();

        // Asserted by hand rather than through andExpect so that the server's own
        // explanation ends up in the failure message. A bare 409 here means the
        // fixture broke, not that the behaviour under test is wrong, and the
        // difference is invisible without the body.
        assertEquals(HttpStatus.OK.value(), approved.getResponse().getStatus(),
                "officer approval must succeed for this fixture to be meaningful, but got "
                        + approved.getResponse().getStatus() + ": " + approved.getResponse().getContentAsString());
        assertEquals("APPROVED", JsonPath.read(approved.getResponse().getContentAsString(), "$.status"));

        return JsonPath.read(approved.getResponse().getContentAsString(), "$.resultingAccountNumber");
    }

    /**
     * The one mutating request every case above makes.
     *
     * <p>The account number comes from {@link #accountNumber}, set by the helper that
     * built the session, so the body always matches the session the request is made
     * with and the only thing varying between cases is the token.
     */
    private MockHttpServletRequestBuilder applyForLoan(MockHttpSession session) {
        return MockMvcRequestBuilders.post("/api/loans/apply")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"accountNumber": %d, "loanType": "HOME", "principalAmount": 500000}
                        """.formatted(accountNumber));
    }

    private static MockHttpSession adminSession() {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(
                HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,
                contextFor(new AuthenticatedUser(AppUser.builder()
                        .userId(1L)
                        .username("admin")
                        .passwordHash(null)
                        .role(AppRole.ADMIN)
                        .fullName("Bootstrap Administrator")
                        .enabled(true)
                        .build())));
        return session;
    }

    private static MockHttpSession sessionFor(AuthenticatedUser principal) {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(
                HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,
                contextFor(principal));
        return session;
    }

    private static SecurityContext contextFor(AuthenticatedUser principal) {
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new UsernamePasswordAuthenticationToken(
                principal, null, principal.getAuthorities()));
        return context;
    }
}
