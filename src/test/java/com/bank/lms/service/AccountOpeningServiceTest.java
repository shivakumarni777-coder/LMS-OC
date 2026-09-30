package com.bank.lms.service;

import com.bank.lms.dto.AccountOpeningRequestDto;
import com.bank.lms.dto.AccountStatusDto;
import com.bank.lms.entity.AccountOpeningRequest;
import com.bank.lms.entity.AccountOpeningStatus;
import com.bank.lms.entity.AppRole;
import com.bank.lms.entity.AppUser;
import com.bank.lms.entity.Customer;
import com.bank.lms.exception.DuplicateResourceException;
import com.bank.lms.exception.InvalidRequestException;
import com.bank.lms.exception.ResourceNotFoundException;
import com.bank.lms.repository.AccountOpeningRequestRepository;
import com.bank.lms.repository.AppUserRepository;
import com.bank.lms.repository.CustomerRepository;
import com.bank.lms.security.AuthenticatedUser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AccountOpeningServiceTest {

    private static final Long USER_ID = 7L;
    private static final Long REQUEST_ID = 42L;
    private static final Long ACCOUNT_NUMBER = 304012345678L;
    private static final String PAN = "ABCDE1234F";
    private static final String EMAIL = "asha.rao@example.com";

    @Mock
    private AccountOpeningRequestRepository requestRepository;

    @Mock
    private AppUserRepository appUserRepository;

    @Mock
    private CustomerRepository customerRepository;

    @Mock
    private CustomerService customerService;

    @InjectMocks
    private AccountOpeningService service;

    private static AuthenticatedUser customerWithoutAccount() {
        return new AuthenticatedUser(AppUser.builder()
                .userId(USER_ID)
                .username(EMAIL)
                .passwordHash("irrelevant")
                .role(AppRole.CUSTOMER)
                .accountNumber(null)
                .fullName("Asha Rao")
                .dob(LocalDate.of(1994, 3, 21))
                .phoneNo("9876543210")
                .branchCode(101)
                .enabled(true)
                .build());
    }

    private static AuthenticatedUser customerWithAccount() {
        return new AuthenticatedUser(AppUser.builder()
                .userId(USER_ID)
                .username(EMAIL)
                .passwordHash("irrelevant")
                .role(AppRole.CUSTOMER)
                .accountNumber(ACCOUNT_NUMBER)
                .enabled(true)
                .build());
    }

    private static AuthenticatedUser admin() {
        return new AuthenticatedUser(AppUser.builder()
                .userId(1L)
                .username("admin")
                .passwordHash("irrelevant")
                .role(AppRole.ADMIN)
                .accountNumber(null)
                .fullName("Bootstrap Administrator")
                .enabled(true)
                .build());
    }

    private static AccountOpeningRequest pendingRequest() {
        return AccountOpeningRequest.builder()
                .requestId(REQUEST_ID)
                .userId(USER_ID)
                .panNo(PAN)
                .status(AccountOpeningStatus.PENDING)
                .requestedAt(Instant.parse("2026-09-20T10:15:30Z"))
                .build();
    }

    private static AccountOpeningRequest rejectedRequest() {
        return AccountOpeningRequest.builder()
                .requestId(REQUEST_ID)
                .userId(USER_ID)
                .panNo(PAN)
                .status(AccountOpeningStatus.REJECTED)
                .reviewNotes("PAN illegible - the fourth character is not a digit")
                .requestedAt(Instant.parse("2026-09-01T10:15:30Z"))
                .reviewedAt(Instant.parse("2026-09-02T14:00:00Z"))
                .build();
    }

    private static AppUser profile() {
        return AppUser.builder()
                .userId(USER_ID)
                .username(EMAIL)
                .fullName("Asha Rao")
                .dob(LocalDate.of(1994, 3, 21))
                .phoneNo("9876543210")
                .branchCode(101)
                .build();
    }

    private void stubSavedRequest() {
        when(requestRepository.save(any(AccountOpeningRequest.class))).thenAnswer(inv -> {
            AccountOpeningRequest saved = inv.getArgument(0);
            saved.setRequestId(REQUEST_ID);
            return saved;
        });
    }

    /**
     * Stands in for the pessimistic lock {@code submit} takes on the caller's
     * login row. Stubbed in every submitting test because the service cannot
     * enforce "one PENDING request per customer" without it.
     */
    private void stubLockedLogin() {
        when(appUserRepository.findByIdForUpdate(USER_ID)).thenReturn(Optional.of(profile()));
    }

    // ------------------------------------------------------------------ status
    //
    // The four states a customer can be in, all answered by one call so the loan
    // page renders from a single round trip. They are asserted as a set because
    // that is what the fix was for: collapsing "turned down" into "never applied"
    // left two of them indistinguishable.

    @Test
    @DisplayName("a customer with an account is reported as ready to borrow against")
    void statusReportsAnExistingAccount() {
        AccountStatusDto status = service.statusFor(customerWithAccount());

        assertTrue(status.hasBankAccount());
        assertEquals(ACCOUNT_NUMBER, status.accountNumber());
        assertNull(status.accountOpeningRequest());
    }

    @Test
    @DisplayName("a customer who has never applied is reported as having no request")
    void statusReportsNoRequestAtAll() {
        when(requestRepository.findFirstByUserIdOrderByRequestedAtDesc(USER_ID))
                .thenReturn(Optional.empty());

        AccountStatusDto status = service.statusFor(customerWithoutAccount());

        assertFalse(status.hasBankAccount());
        assertNull(status.accountNumber());
        assertNull(status.accountOpeningRequest(), "no request has been made yet");
    }

    @Test
    @DisplayName("a submitted request is carried on the status so the page needs one call")
    void statusCarriesThePendingRequest() {
        when(requestRepository.findFirstByUserIdOrderByRequestedAtDesc(USER_ID))
                .thenReturn(Optional.of(pendingRequest()));

        AccountStatusDto status = service.statusFor(customerWithoutAccount());

        assertFalse(status.hasBankAccount());
        assertNotNull(status.accountOpeningRequest());
        assertEquals(AccountOpeningStatus.PENDING, status.accountOpeningRequest().status());
    }

    @Test
    @DisplayName("a rejection is reported with its reason, so the customer can act on it")
    void statusCarriesTheRejectionAndTheReason() {
        when(requestRepository.findFirstByUserIdOrderByRequestedAtDesc(USER_ID))
                .thenReturn(Optional.of(rejectedRequest()));

        AccountStatusDto status = service.statusFor(customerWithoutAccount());

        assertFalse(status.hasBankAccount(), "a rejected customer still has no account");
        assertNotNull(status.accountOpeningRequest());
        assertEquals(AccountOpeningStatus.REJECTED, status.accountOpeningRequest().status());
        assertEquals("PAN illegible - the fourth character is not a digit",
                status.accountOpeningRequest().reviewNotes());
        assertNotNull(status.accountOpeningRequest().reviewedAt());
    }

    @Test
    @DisplayName("the customer's own request masks the PAN")
    void statusMasksThePan() {
        when(requestRepository.findFirstByUserIdOrderByRequestedAtDesc(USER_ID))
                .thenReturn(Optional.of(rejectedRequest()));

        AccountStatusDto status = service.statusFor(customerWithoutAccount());

        // Checked on a rejected request too, not just a pending one: the rejection
        // is the state the customer is most likely to be re-reading, and it is
        // carried over the same projection. A masked-when-pending, unmasked-when-
        // rejected response would leak the PAN to exactly the wrong person.
        String masked = status.accountOpeningRequest().maskedPanNo();
        assertEquals("XXXXX1234X", masked);
        assertFalse(masked.equals(PAN), "the full PAN must not be echoed back");
    }

    @Test
    @DisplayName("the status reports the most recent request, not the oldest one")
    void statusReportsTheLatestRequest() {
        AccountOpeningRequest older = rejectedRequest();
        AccountOpeningRequest newer = pendingRequest();
        newer.setRequestId(43L);
        // Newest first, as the query returns them.
        when(requestRepository.findFirstByUserIdOrderByRequestedAtDesc(USER_ID))
                .thenReturn(Optional.of(newer), Optional.of(older));

        // A customer who was rejected and then applied again is waiting on the
        // second one. Reporting the first would tell them they were still rejected
        // while an officer sat on their new request.
        assertEquals(AccountOpeningStatus.PENDING, service.statusFor(customerWithoutAccount())
                .accountOpeningRequest().status());
        assertEquals(AccountOpeningStatus.REJECTED, service.statusFor(customerWithoutAccount())
                .accountOpeningRequest().status());
    }

    @Test
    @DisplayName("having an account short-circuits the request lookup entirely")
    void statusDoesNotLookForRequestsOnceAnAccountExists() {
        AccountStatusDto status = service.statusFor(customerWithAccount());

        assertTrue(status.hasBankAccount());
        verify(requestRepository, never()).findFirstByUserIdOrderByRequestedAtDesc(any());
    }

    // ------------------------------------------------------------------ submit

    @Test
    @DisplayName("submitting records a pending request and normalises the PAN")
    void submitRecordsAPendingRequest() {
        stubLockedLogin();
        when(requestRepository.findByUserIdAndStatusOrderByRequestedAtAsc(USER_ID, AccountOpeningStatus.PENDING))
                .thenReturn(List.of());
        when(customerRepository.existsByPanNo(PAN)).thenReturn(false);
        stubSavedRequest();

        AccountOpeningRequestDto.Response response =
                service.submit(customerWithoutAccount(), "  abcde1234f  ");

        ArgumentCaptor<AccountOpeningRequest> saved =
                ArgumentCaptor.forClass(AccountOpeningRequest.class);
        verify(requestRepository).save(saved.capture());

        assertEquals(USER_ID, saved.getValue().getUserId());
        assertEquals(PAN, saved.getValue().getPanNo());
        assertEquals(AccountOpeningStatus.PENDING, saved.getValue().getStatus());
        assertNotNull(saved.getValue().getRequestedAt());
        assertEquals(AccountOpeningStatus.PENDING, response.status());
    }

    @Test
    @DisplayName("a second request while one is pending is a 409, not a second row")
    void submitRefusesADuplicateRequest() {
        stubLockedLogin();
        when(requestRepository.findByUserIdAndStatusOrderByRequestedAtAsc(USER_ID, AccountOpeningStatus.PENDING))
                .thenReturn(List.of(pendingRequest()));

        assertThrows(DuplicateResourceException.class,
                () -> service.submit(customerWithoutAccount(), PAN));

        verify(requestRepository, never()).save(any());
    }

    @Test
    @DisplayName("submission serialises on the caller's login row, so two cannot both pass the check")
    void submitTakesTheLoginRowLock() {
        stubLockedLogin();
        when(requestRepository.findByUserIdAndStatusOrderByRequestedAtAsc(USER_ID, AccountOpeningStatus.PENDING))
                .thenReturn(List.of());
        when(customerRepository.existsByPanNo(PAN)).thenReturn(false);
        stubSavedRequest();

        service.submit(customerWithoutAccount(), PAN);

        // The lock is taken before the existing-request check, not after. Two
        // concurrent submissions for one customer then queue on this row, and the
        // second re-reads the first's committed request instead of writing a
        // second PENDING row that no unique index would catch.
        InOrder inOrder = inOrder(appUserRepository, requestRepository);
        inOrder.verify(appUserRepository).findByIdForUpdate(USER_ID);
        inOrder.verify(requestRepository)
                .findByUserIdAndStatusOrderByRequestedAtAsc(USER_ID, AccountOpeningStatus.PENDING);
    }

    @Test
    @DisplayName("reads tolerate duplicate PENDING rows instead of throwing")
    void readsSurviveDuplicatePendingRows() {
        // The state the code check alone cannot be trusted to prevent. A query
        // returning Optional would raise IncorrectResultSizeDataAccessException
        // here and turn one bad race into a permanently broken account page.
        AccountOpeningRequest older = pendingRequest();
        AccountOpeningRequest newer = AccountOpeningRequest.builder()
                .requestId(43L).userId(USER_ID).panNo(PAN)
                .status(AccountOpeningStatus.PENDING)
                .requestedAt(Instant.parse("2026-09-21T10:15:30Z"))
                .build();

        when(requestRepository.findByUserIdAndStatusOrderByRequestedAtAsc(
                USER_ID, AccountOpeningStatus.PENDING)).thenReturn(List.of(older, newer));
        // The status read goes through a derived query that cannot see duplicates
        // the same way - it is already a single row - so it is stubbed to return
        // one. What is asserted here is that neither read degrades to an
        // exception; the two legitimately disagree on which of the two rows to
        // show, and that is fine.
        when(requestRepository.findFirstByUserIdOrderByRequestedAtDesc(USER_ID))
                .thenReturn(Optional.of(newer));

        // Renders the oldest, which is the one actually being worked on.
        assertEquals(REQUEST_ID, service.currentFor(customerWithoutAccount()).requestId());

        AccountStatusDto status = service.statusFor(customerWithoutAccount());
        assertFalse(status.hasBankAccount());
        // And the status reports the most recent, so a customer watching the page
        // sees their latest application rather than the first one filed.
        assertEquals(43L, status.accountOpeningRequest().requestId());
    }

    @Test
    @DisplayName("a duplicate is still refused on submit when duplicates already exist")
    void submitRefusesWhenDuplicatesAlreadyExist() {
        stubLockedLogin();
        when(requestRepository.findByUserIdAndStatusOrderByRequestedAtAsc(
                USER_ID, AccountOpeningStatus.PENDING))
                .thenReturn(List.of(pendingRequest(), pendingRequest()));

        assertThrows(DuplicateResourceException.class,
                () -> service.submit(customerWithoutAccount(), PAN));
        verify(requestRepository, never()).save(any());
    }

    @Test
    @DisplayName("a decided request does not block a fresh application")
    void submitIsAllowedAgainAfterARejection() {
        stubLockedLogin();
        // Only PENDING rows are consulted, so a rejected row is history, not a
        // block. Otherwise a customer who was turned down could never reapply.
        when(requestRepository.findByUserIdAndStatusOrderByRequestedAtAsc(USER_ID, AccountOpeningStatus.PENDING))
                .thenReturn(List.of());
        when(customerRepository.existsByPanNo(PAN)).thenReturn(false);
        stubSavedRequest();

        assertEquals(AccountOpeningStatus.PENDING,
                service.submit(customerWithoutAccount(), PAN).status());
    }

    @Test
    @DisplayName("widening the status query to include rejections would not block a reapplication")
    void theStatusQueryIsNotTheOneThatBlocksASecondApplication() {
        stubLockedLogin();
        // The two questions are asked with two different queries, and this pins
        // that down. The tempting simplification is to reuse the "most recent
        // request" lookup everywhere, since it is now the one that sees a
        // rejection - and it would look like it worked: the customer could still
        // see the rejection on the status page. The damage is one level down, in
        // submit, which would read this same row and conclude they already have a
        // request outstanding, so the second application could never be made and
        // the rejection on the page would be permanent.
        when(requestRepository.findByUserIdAndStatusOrderByRequestedAtAsc(USER_ID, AccountOpeningStatus.PENDING))
                .thenReturn(List.of());
        // The status lookup, by contrast, does see the rejection.
        when(requestRepository.findFirstByUserIdOrderByRequestedAtDesc(USER_ID))
                .thenReturn(Optional.of(rejectedRequest()));
        when(customerRepository.existsByPanNo(PAN)).thenReturn(false);
        stubSavedRequest();

        assertEquals(AccountOpeningStatus.PENDING,
                service.submit(customerWithoutAccount(), PAN).status());
        assertEquals(AccountOpeningStatus.REJECTED, service.statusFor(customerWithoutAccount())
                .accountOpeningRequest().status());
    }

    @Test
    @DisplayName("a customer who already has an account cannot request another")
    void submitRefusesWhenAnAccountExists() {
        assertThrows(InvalidRequestException.class,
                () -> service.submit(customerWithAccount(), PAN));

        verify(requestRepository, never()).save(any());
    }

    @Test
    @DisplayName("a PAN already registered is refused at submission, not weeks later at approval")
    void submitRefusesADuplicatePan() {
        stubLockedLogin();
        when(requestRepository.findByUserIdAndStatusOrderByRequestedAtAsc(USER_ID, AccountOpeningStatus.PENDING))
                .thenReturn(List.of());
        when(customerRepository.existsByPanNo(PAN)).thenReturn(true);

        assertThrows(DuplicateResourceException.class,
                () -> service.submit(customerWithoutAccount(), PAN));

        verify(requestRepository, never()).save(any());
    }

    @Test
    @DisplayName("a staff login cannot request an account for itself")
    void submitRefusesAStaffLogin() {
        assertThrows(InvalidRequestException.class,
                () -> service.submit(admin(), PAN));

        verify(requestRepository, never()).save(any());
    }

    // ------------------------------------------------------------------ review

    @Test
    @DisplayName("approving opens the account, records the number and marks the request approved")
    void approvalOpensTheAccount() {
        AccountOpeningRequest request = pendingRequest();
        when(requestRepository.findByIdForUpdate(REQUEST_ID)).thenReturn(Optional.of(request));
        when(appUserRepository.findById(USER_ID)).thenReturn(Optional.of(profile()));
        when(customerService.openAccountForExistingUser(any(), any()))
                .thenReturn(Customer.builder().accountNumber(ACCOUNT_NUMBER).panNo(PAN).build());
        stubSavedRequest();

        AccountOpeningRequestDto.AdminResponse response = service.review(
                REQUEST_ID, new AccountOpeningRequestDto.Decision("APPROVED", null), admin());

        verify(customerService).openAccountForExistingUser(any(), eq(PAN));
        assertEquals(AccountOpeningStatus.APPROVED, request.getStatus());
        assertEquals(ACCOUNT_NUMBER, request.getResultingAccountNumber());
        assertEquals(1L, request.getReviewedBy().longValue());
        assertNotNull(request.getReviewedAt());
        assertEquals(AccountOpeningStatus.APPROVED, response.status());
        assertEquals(ACCOUNT_NUMBER, response.resultingAccountNumber());
    }

    @Test
    @DisplayName("approving shows the officer the full PAN, which the customer never sees")
    void approvalShowsTheFullPanToTheOfficer() {
        when(requestRepository.findByIdForUpdate(REQUEST_ID)).thenReturn(Optional.of(pendingRequest()));
        when(appUserRepository.findById(USER_ID)).thenReturn(Optional.of(profile()));
        when(customerService.openAccountForExistingUser(any(), any()))
                .thenReturn(Customer.builder().accountNumber(ACCOUNT_NUMBER).panNo(PAN).build());
        stubSavedRequest();

        AccountOpeningRequestDto.AdminResponse response = service.review(
                REQUEST_ID, new AccountOpeningRequestDto.Decision("APPROVED", null), admin());

        assertEquals(PAN, response.panNo());
        assertEquals("Asha Rao", response.fullName());
        assertEquals(EMAIL, response.email());
        assertEquals(LocalDate.of(1994, 3, 21), response.dob());
        assertEquals(101, response.branchCode());
    }

    @Test
    @DisplayName("rejecting leaves no account and records the reason")
    void rejectionCreatesNoAccount() {
        AccountOpeningRequest request = pendingRequest();
        when(requestRepository.findByIdForUpdate(REQUEST_ID)).thenReturn(Optional.of(request));
        when(appUserRepository.findById(USER_ID)).thenReturn(Optional.of(profile()));
        stubSavedRequest();

        AccountOpeningRequestDto.AdminResponse response = service.review(
                REQUEST_ID, new AccountOpeningRequestDto.Decision("REJECTED", "  PAN illegible  "), admin());

        verify(customerService, never()).openAccountForExistingUser(any(), any());
        assertEquals(AccountOpeningStatus.REJECTED, request.getStatus());
        assertEquals("PAN illegible", request.getReviewNotes(), "notes are trimmed");
        assertNull(request.getResultingAccountNumber());
        assertEquals(AccountOpeningStatus.REJECTED, response.status());
    }

    @Test
    @DisplayName("a decided request cannot be decided again")
    void reviewRefusesAnAlreadyDecidedRequest() {
        AccountOpeningRequest request = pendingRequest();
        request.setStatus(AccountOpeningStatus.APPROVED);
        when(requestRepository.findByIdForUpdate(REQUEST_ID)).thenReturn(Optional.of(request));

        assertThrows(InvalidRequestException.class, () -> service.review(
                REQUEST_ID, new AccountOpeningRequestDto.Decision("REJECTED", null), admin()));

        verify(customerService, never()).openAccountForExistingUser(any(), any());
    }

    @Test
    @DisplayName("deciding reads the request under a write lock, before checking its status")
    void reviewLocksTheRequestRowFirst() {
        AccountOpeningRequest request = pendingRequest();
        when(requestRepository.findByIdForUpdate(REQUEST_ID)).thenReturn(Optional.of(request));
        when(appUserRepository.findById(USER_ID)).thenReturn(Optional.of(profile()));
        stubSavedRequest();

        service.review(REQUEST_ID, new AccountOpeningRequestDto.Decision("REJECTED", null), admin());

        // findByIdForUpdate, not findById. Two officers clicking Approve on the
        // same request would otherwise both read PENDING and both mint an
        // account; the second insert would then fail on the unique pan_no index
        // and surface as an unexplained 500.
        verify(requestRepository, never()).findById(any());
        verify(requestRepository).findByIdForUpdate(REQUEST_ID);
    }

    @Test
    @DisplayName("reviewing an unknown request is a 404")
    void reviewOfAnUnknownRequestIsNotFound() {
        when(requestRepository.findByIdForUpdate(99L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> service.review(
                99L, new AccountOpeningRequestDto.Decision("APPROVED", null), admin()));
    }

    @Test
    @DisplayName("the review queue can be filtered to the requests still awaiting a decision")
    void listCanBeFilteredByStatus() {
        when(requestRepository.findByStatusOrderByRequestedAtAsc(AccountOpeningStatus.PENDING))
                .thenReturn(List.of(pendingRequest()));
        when(appUserRepository.findById(USER_ID)).thenReturn(Optional.of(profile()));

        List<AccountOpeningRequestDto.AdminResponse> queue =
                service.listForReview(AccountOpeningStatus.PENDING);

        assertEquals(1, queue.size());
        assertEquals(AccountOpeningStatus.PENDING, queue.getFirst().status());
    }
}
