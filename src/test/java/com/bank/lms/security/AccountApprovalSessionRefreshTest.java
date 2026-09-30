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
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * An account granted mid-session has to reach the session that asked for it.
 *
 * <p>An {@link AuthenticatedUser} is a snapshot of an {@code app_user} row taken at
 * login. Opening an account writes the account number to that row from the
 * officer's session, so afterwards the database and the customer's session
 * disagree - and the session is the one every ownership check reads. This test
 * pins the whole consequence of that, through the real filter chain, for the one
 * session that has to keep working: the customer's, opened before the approval and
 * never rebuilt.
 *
 * <p>Reachable only through the real chain, not standalone MockMvc. The defect is
 * in the interaction between {@code SecurityContextHolderFilter} and the session,
 * and a standalone setup has no session and no filter chain to get wrong, so it
 * would pass against the unfixed code. Sessions are therefore hand-built, placed
 * under the repository's own key exactly as
 * {@code HttpSessionSecurityContextRepository} keeps them.
 *
 * <p>The approval is driven through the officer's endpoint rather than by calling
 * the service, so the thing under test is the sequence a user actually performs.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AccountApprovalSessionRefreshTest {

    private static final String CSRF_COOKIE = "XSRF-TOKEN";
    private static final String CSRF_HEADER = "X-XSRF-TOKEN";

    // Static because JUnit builds a new instance per test method: an instance field
    // would restart at 1 in each of them and hand every test the same PAN.
    private static final AtomicInteger panSequence = new AtomicInteger();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AppUserRepository appUserRepository;

    @Autowired
    private AccountOpeningRequestRepository accountOpeningRequestRepository;

    @Test
    @DisplayName("an account approved while the customer is signed in reaches that same session")
    void anApprovedAccountReachesTheOpenSession() throws Exception {
        AppUser customer = registeredCustomer("approved.midflight@example.com");
        AccountOpeningRequest pending = pendingRequestFor(customer);

        // The session as login leaves it: authenticated, and holding no account
        // because the row had none a moment ago.
        MockHttpSession customerSession = customerSession(customer, null);

        Long accountNumber = approveAsAdmin(pending);

        // Everything below reuses that one session object. Nothing signs the customer
        // out, nothing rebuilds the principal, and no session is recreated.

        mockMvc.perform(MockMvcRequestBuilders.get("/api/account/status").session(customerSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasBankAccount").value(true))
                .andExpect(jsonPath("$.accountNumber").value(accountNumber))
                // The account-opening page branches on this: with a request still
                // reported alongside hasBankAccount, an approved customer matches
                // neither the "awaiting review" nor the "apply again" branch and is
                // shown the submission form for an account they already hold.
                .andExpect(jsonPath("$.accountOpeningRequest").doesNotExist());

        mockMvc.perform(MockMvcRequestBuilders.get("/api/auth/me").session(customerSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountNumber").value(accountNumber))
                .andExpect(jsonPath("$.role").value("CUSTOMER"));

        mockMvc.perform(MockMvcRequestBuilders.get("/api/loans").session(customerSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());

        mockMvc.perform(MockMvcRequestBuilders.get("/api/loans/summary").session(customerSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalLoans").value(0));

        mockMvc.perform(MockMvcRequestBuilders.get("/api/customers/" + accountNumber)
                        .session(customerSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountNumber").value(accountNumber));

        // The step the stale principal used to make impossible: the account exists
        // only in the database and in the session the officer created, and this
        // session never saw it.
        MvcResult applied = mockMvc.perform(withCsrf(MockMvcRequestBuilders.post("/api/loans/apply")
                        .session(customerSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"accountNumber": %d, "loanType": "HOME", "principalAmount": 500000}
                                """.formatted(accountNumber))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accountNumber").value(accountNumber))
                .andReturn();

        assertEquals("PENDING", JsonPath.read(applied.getResponse().getContentAsString(), "$.loanStatus"));

        // And it persists: the second list read, on the same session, sees the loan.
        mockMvc.perform(MockMvcRequestBuilders.get("/api/loans").session(customerSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    @DisplayName("the session itself is corrected, not just the response that was being answered")
    void theStoredPrincipalIsReplaced() throws Exception {
        AppUser customer = registeredCustomer("stored.principal@example.com");
        AccountOpeningRequest pending = pendingRequestFor(customer);
        MockHttpSession customerSession = customerSession(customer, null);

        Long accountNumber = approveAsAdmin(pending);

        // Any request at all is enough to trigger it.
        mockMvc.perform(MockMvcRequestBuilders.get("/api/account/status").session(customerSession))
                .andExpect(status().isOk());

        // Asserted on the session rather than on a response, because a filter that
        // merely re-read the row for the request in flight would make every assertion
        // above pass while leaving the session stale - and the repeated-read cost,
        // and the behaviour on the next request, would be wrong.
        SecurityContext stored = (SecurityContext) customerSession.getAttribute(
                HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
        AuthenticatedUser principal = assertInstanceOf(
                AuthenticatedUser.class, stored.getAuthentication().getPrincipal());

        assertEquals(accountNumber, principal.getAccountNumber());
        assertEquals(customer.getUserId(), principal.getUserId());
        assertEquals(AppRole.CUSTOMER, principal.getRole());
        // The hash must not ride along in the session; the login path erases it and
        // a refreshed principal has to end in the same state.
        assertNull(principal.getPassword());
    }

    @Test
    @DisplayName("refreshing one session does not let anyone else reach the new account")
    void ownershipIsNotWidenedByTheRefresh() throws Exception {
        AppUser owner = registeredCustomer("the.owner@example.com");
        AccountOpeningRequest pending = pendingRequestFor(owner);
        MockHttpSession ownerSession = customerSession(owner, null);

        Long accountNumber = approveAsAdmin(pending);

        AppUser stranger = registeredCustomer("a.stranger@example.com");
        MockHttpSession strangerSession = customerSession(stranger, null);

        // A second pre-approval customer must not be handed the first one's account,
        // and the stranger's own status must still be their own.
        mockMvc.perform(MockMvcRequestBuilders.get("/api/customers/" + accountNumber)
                        .session(strangerSession))
                .andExpect(status().isNotFound());

        mockMvc.perform(MockMvcRequestBuilders.get("/api/account/status").session(strangerSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasBankAccount").value(false))
                .andExpect(jsonPath("$.accountNumber").doesNotExist());

        // And the owner still has theirs, which is the point of the whole filter.
        mockMvc.perform(MockMvcRequestBuilders.get("/api/account/status").session(ownerSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountNumber").value(accountNumber));
    }

    @Test
    @DisplayName("the refresh does not become a way around CSRF")
    void csrfIsStillRequiredOnTheGrantedAccount() throws Exception {
        AppUser customer = registeredCustomer("csrf.still.on@example.com");
        AccountOpeningRequest pending = pendingRequestFor(customer);
        MockHttpSession customerSession = customerSession(customer, null);

        Long accountNumber = approveAsAdmin(pending);

        // Same request as the passing case above, with the token left off. 403 is the
        // CSRF filter refusing it, before the controller is reached at all.
        mockMvc.perform(MockMvcRequestBuilders.post("/api/loans/apply")
                        .session(customerSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"accountNumber": %d, "loanType": "HOME", "principalAmount": 500000}
                                """.formatted(accountNumber)))
                .andExpect(status().isForbidden());

        mockMvc.perform(MockMvcRequestBuilders.get("/api/loans").session(customerSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ------------------------------------------------------------------ helpers

    /**
     * Runs the approval an officer performs, and returns the account number minted.
     *
     * <p>CSRF included, so the decision is made through the same protection every
     * other mutating request is subject to. The token is fetched the way the SPA
     * fetches it and then replayed as the cookie/header pair, because MockMvc keeps
     * no cookie jar between calls.
     */
    private Long approveAsAdmin(AccountOpeningRequest pending) throws Exception {
        MvcResult approved = mockMvc.perform(withCsrf(MockMvcRequestBuilders
                        .put("/api/admin/accounts/requests/" + pending.getRequestId())
                        .session(adminSession())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"decision": "APPROVED", "reviewNotes": "PAN and proof checked."}
                                """)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andReturn();

        return JsonPath.read(approved.getResponse().getContentAsString(), "$.resultingAccountNumber");
    }

    /** Pairs a freshly issued CSRF token as both the cookie and the echoed header. */
    private MockHttpServletRequestBuilder withCsrf(MockHttpServletRequestBuilder builder) throws Exception {
        MvcResult primed = mockMvc.perform(MockMvcRequestBuilders.get("/api/auth/csrf"))
                .andExpect(status().isOk())
                .andReturn();

        String token = JsonPath.read(primed.getResponse().getContentAsString(), "$.token");
        return builder.cookie(new Cookie(CSRF_COOKIE, token)).header(CSRF_HEADER, token);
    }

    private AppUser registeredCustomer(String username) {
        return appUserRepository.save(AppUser.builder()
                .username(username)
                // Never verified by anything under test; the refresh re-reads the row
                // and compares against the enabled flag, nothing else.
                .passwordHash("{bcrypt}irrelevant")
                .role(AppRole.CUSTOMER)
                .fullName("Session Test Customer")
                .dob(LocalDate.of(1990, 1, 1))
                .phoneNo("9000000011")
                .branchCode(101)
                .enabled(true)
                .build());
    }

    private AccountOpeningRequest pendingRequestFor(AppUser customer) {
        // A distinct PAN per request. Nothing rolls back between test methods in a
        // full-context test, so a shared literal would collide on the unique
        // customer.pan_no index and fail the approval with a 409 that has nothing to
        // do with what is under test.
        String pan = "ABCDE" + String.format("%04d", panSequence.incrementAndGet()) + "F";
        return accountOpeningRequestRepository.save(AccountOpeningRequest.builder()
                .userId(customer.getUserId())
                .panNo(pan)
                .status(AccountOpeningStatus.PENDING)
                .build());
    }

    // ----------------------------------------------------------------- sessions

    /**
     * A session holding the given principal, under the key the filter chain reads.
     *
     * <p>{@code accountNumber} is passed in rather than read from the row on purpose:
     * reproducing this defect requires a session that is <em>behind</em> the
     * database, which is precisely the state a login taken before the approval
     * leaves behind.
     */
    private static MockHttpSession customerSession(AppUser customer, Long accountNumber) {
        return sessionFor(new AuthenticatedUser(AppUser.builder()
                .userId(customer.getUserId())
                .username(customer.getUsername())
                .passwordHash(null)
                .role(AppRole.CUSTOMER)
                .accountNumber(accountNumber)
                .fullName(customer.getFullName())
                .dob(customer.getDob())
                .phoneNo(customer.getPhoneNo())
                .branchCode(customer.getBranchCode())
                .enabled(true)
                .build()));
    }

    private static MockHttpSession adminSession() {
        return sessionFor(new AuthenticatedUser(AppUser.builder()
                .userId(1L)
                .username("admin")
                .passwordHash(null)
                .role(AppRole.ADMIN)
                .fullName("Bootstrap Administrator")
                .enabled(true)
                .build()));
    }

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
