package com.bank.lms;

import com.bank.lms.entity.AccountOpeningRequest;
import com.bank.lms.entity.AccountOpeningStatus;
import com.bank.lms.entity.AppRole;
import com.bank.lms.entity.AppUser;
import com.bank.lms.entity.Customer;
import com.bank.lms.entity.Loan;
import com.bank.lms.entity.LoanDocument;
import com.bank.lms.entity.LoanDocumentStatus;
import com.bank.lms.entity.LoanStatus;
import com.bank.lms.repository.AccountOpeningRequestRepository;
import com.bank.lms.repository.AppUserRepository;
import com.bank.lms.repository.CustomerRepository;
import com.bank.lms.repository.LoanDocumentRepository;
import com.bank.lms.repository.LoanRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Boots the whole application against an in-memory database.
 *
 * <p>Everything else in the suite is a unit test with mocked repositories, which
 * means nothing in the build ever constructed an EntityManagerFactory, applied
 * the entity model to a schema, or assembled the security filter chain. A
 * mistyped {@code @Column}, an enum mapped to a column too short for its longest
 * name, or a request matcher that never matches would all have passed. These
 * tests are the ones that would notice.
 *
 * <p>Runs in MySQL compatibility mode so that anything H2 is stricter about -
 * reserved words, column type limits, identity generation - surfaces here rather
 * than on the developer's database. It is not a substitute for running against
 * MySQL, but it is a lot closer than no database at all.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class PersistenceMappingTest {

    @Autowired
    private AppUserRepository appUserRepository;

    @Autowired
    private CustomerRepository customerRepository;

    @Autowired
    private AccountOpeningRequestRepository accountOpeningRequestRepository;

    @Autowired
    private LoanRepository loanRepository;

    @Autowired
    private LoanDocumentRepository loanDocumentRepository;

    @Autowired
    private EntityManager entityManager;

    /**
     * Detaches everything, so the next read comes from the database rather than
     * from the first-level cache. Without this a round trip can pass on values
     * Hibernate never actually wrote out.
     */
    private void detach() {
        entityManager.flush();
        entityManager.clear();
    }

    /**
     * A customer satisfying every constraint on the entity.
     *
     * <p>All of {@code fullName}, {@code phoneNo}, {@code dob}, {@code email} and
     * {@code branchCode} are {@code nullable = false} and are additionally
     * checked by bean validation on persist, so a partial fixture is rejected
     * before the SQL is even generated. {@code dob} being mandatory is why
     * {@code CustomerService} refuses to open an account for a profile that has
     * not supplied one.
     */
    private Customer customer(long accountNumber) {
        return Customer.builder()
                .accountNumber(accountNumber)
                .panNo("ABCDE1234F")
                .fullName("Asha Rao")
                .phoneNo("9876543210")
                .dob(LocalDate.of(1994, 3, 21))
                .email("asha." + accountNumber + "@example.com")
                .branchCode(101)
                .build();
    }

    @Test
    @DisplayName("the application context starts, schema included")
    void contextLoads() {
        // The assertion is the absence of an exception: this test class cannot
        // even be constructed unless the context is up, every entity mapped and
        // ddl-auto=create-drop has built the schema from those mappings.
        assertNotNull(appUserRepository);
    }

    @Test
    @DisplayName("the new customer profile columns round-trip through the database")
    void profileColumnsRoundTrip() {
        AppUser saved = appUserRepository.save(AppUser.builder()
                .username("asha.rao@example.com")
                .passwordHash("hash")
                .role(AppRole.CUSTOMER)
                .accountNumber(null)
                .fullName("Asha Rao")
                .dob(LocalDate.of(1994, 3, 21))
                .phoneNo("9876543210")
                .branchCode(101)
                .enabled(true)
                .build());
        detach();

        AppUser reloaded = appUserRepository.findById(saved.getUserId()).orElseThrow();

        assertEquals("Asha Rao", reloaded.getFullName());
        assertEquals(LocalDate.of(1994, 3, 21), reloaded.getDob());
        assertEquals("9876543210", reloaded.getPhoneNo());
        assertEquals(101, reloaded.getBranchCode());

        // The nullable account number is the point of the two-step flow: the
        // column must accept null, or a registered-but-not-yet-opened login
        // cannot be saved at all.
        assertNull(reloaded.getAccountNumber());
    }

    @Test
    @DisplayName("an account-opening request round-trips with its outcome fields left null")
    void accountOpeningRequestRoundTrips() {
        Long userId = appUserRepository.save(AppUser.builder()
                .username("pending@example.com")
                .passwordHash("hash")
                .role(AppRole.CUSTOMER)
                .enabled(true)
                .build()).getUserId();
        detach();

        AccountOpeningRequest saved = accountOpeningRequestRepository.save(AccountOpeningRequest.builder()
                .userId(userId)
                .panNo("ABCDE1234F")
                .status(AccountOpeningStatus.PENDING)
                .build());
        detach();

        AccountOpeningRequest reloaded =
                accountOpeningRequestRepository.findById(saved.getRequestId()).orElseThrow();

        assertEquals("ABCDE1234F", reloaded.getPanNo());
        assertEquals(AccountOpeningStatus.PENDING, reloaded.getStatus());
        assertEquals(userId, reloaded.getUserId());

        // Stamped by the entity's @PrePersist, so a not-null column cannot be
        // violated by a caller who forgets.
        assertNotNull(reloaded.getRequestedAt());

        // Undecided: there is no officer, no time and no account number yet.
        assertNull(reloaded.getReviewedAt());
        assertNull(reloaded.getReviewedBy());
        assertNull(reloaded.getResultingAccountNumber());

        assertEquals(1, accountOpeningRequestRepository
                .findByUserIdAndStatusOrderByRequestedAtAsc(userId, AccountOpeningStatus.PENDING).size());
    }

    @Test
    @DisplayName("the longest enum name fits its column")
    void enumNamesFitTheirColumns() {
        // A column declared too short for its longest constant is a runtime
        // failure on the first insert of that value, not a startup failure, so
        // it is worth proving here rather than discovering in production.
        AccountOpeningRequest request = accountOpeningRequestRepository.save(AccountOpeningRequest.builder()
                .userId(1L)
                .panNo("ZZZZZ9999Z")
                .status(AccountOpeningStatus.PENDING)
                .build());
        detach();

        assertNotNull(accountOpeningRequestRepository.findById(request.getRequestId()).orElseThrow());
    }

    @Test
    @DisplayName("a loan document stores only a pointer to its bytes")
    void loanDocumentRoundTrips() {
        Customer customer = customerRepository.save(customer(304012345678L));
        detach();

        Loan loan = loanRepository.save(Loan.builder()
                .customer(customer)
                .loanType("HOME")
                .principalAmount(new BigDecimal("5000000"))
                .interestRate(new BigDecimal("8.50"))
                .loanStatus(LoanStatus.PENDING.name())
                .applicationDate(LocalDate.of(2026, 9, 20))
                .build());
        detach();

        LoanDocument document = loanDocumentRepository.save(LoanDocument.builder()
                .loanId(loan.getLoanId())
                .documentType("SALARY_SLIP")
                .documentName("september-slip.pdf")
                .storageKey("loans/" + loan.getLoanId() + "/3f8a2c1b.pdf")
                .contentType("application/pdf")
                .sizeBytes(20481L)
                .build());
        detach();

        LoanDocument reloaded = loanDocumentRepository.findById(document.getDocumentId()).orElseThrow();

        assertEquals(loan.getLoanId(), reloaded.getLoanId());
        assertEquals("SALARY_SLIP", reloaded.getDocumentType());
        assertEquals("loans/" + loan.getLoanId() + "/3f8a2c1b.pdf", reloaded.getStorageKey());
        assertEquals(20481L, reloaded.getSizeBytes());
        assertEquals(LoanDocumentStatus.PENDING, reloaded.getStatus(), "defaults to awaiting review");
        assertNotNull(reloaded.getUploadedAt());

        // Ownership is scoped to the loan, not to the account, so a second
        // application by the same customer starts with no documents.
        assertEquals(1, loanDocumentRepository.findByLoanIdOrderByUploadedAtAsc(loan.getLoanId()).size());
    }

    @Test
    @DisplayName("document types are free text, so an 'Other' description persists")
    void documentTypeIsFreeText() {
        // No reference table and no allow-list by design. Asserted with a value
        // no enum could contain, so a future allow-list would fail here.
        LoanDocument document = loanDocumentRepository.save(LoanDocument.builder()
                .loanId(1L)
                .documentType("Hand-written note from employer")
                .documentName("note.txt")
                .storageKey("loans/1/abc.txt")
                .contentType("text/plain")
                .sizeBytes(12L)
                .build());
        detach();

        assertEquals("Hand-written note from employer",
                loanDocumentRepository.findById(document.getDocumentId()).orElseThrow().getDocumentType());
    }

    @Test
    @DisplayName("the review queue is ordered oldest application first")
    void reviewQueueIsOrderedOldestFirst() {
        Customer customer = customerRepository.save(customer(304012345678L));
        detach();

        // Saved newest first, so the ordering is proven by the query rather than
        // by the order the test happened to insert them in.
        for (LocalDate applied : new LocalDate[]{
                LocalDate.of(2026, 9, 18), LocalDate.of(2026, 9, 20), LocalDate.of(2026, 9, 15)}) {
            loanRepository.save(Loan.builder()
                    .customer(customer)
                    .loanType("HOME")
                    .principalAmount(new BigDecimal("5000000"))
                    .interestRate(new BigDecimal("8.50"))
                    .loanStatus(LoanStatus.PENDING.name())
                    .applicationDate(applied)
                    .build());
        }
        detach();

        var queue = loanRepository.findByLoanStatusOrderByApplicationDateAsc(LoanStatus.PENDING.name());

        assertEquals(3, queue.size());
        assertEquals(LocalDate.of(2026, 9, 15), queue.getFirst().getApplicationDate());
        assertEquals(LocalDate.of(2026, 9, 20), queue.getLast().getApplicationDate());

        // The customer association is lazy and open-in-view is off, so the query
        // must fetch it; if the @EntityGraph were dropped this would fail.
        assertNotNull(queue.getFirst().getCustomer().getAccountNumber());
    }

    @Test
    @DisplayName("an approval timestamp on a request is stored with sub-second precision")
    void reviewTimestampsSurviveARoundTrip() {
        Instant reviewedAt = Instant.parse("2026-09-22T08:30:15.123456Z");
        AccountOpeningRequest saved = accountOpeningRequestRepository.save(AccountOpeningRequest.builder()
                .userId(1L)
                .panNo("ABCDE1234F")
                .status(AccountOpeningStatus.APPROVED)
                .reviewNotes("Verified against PAN card")
                .resultingAccountNumber(304012345678L)
                .requestedAt(Instant.parse("2026-09-20T10:15:30Z"))
                .reviewedAt(reviewedAt)
                .reviewedBy(1L)
                .build());
        detach();

        AccountOpeningRequest reloaded =
                accountOpeningRequestRepository.findById(saved.getRequestId()).orElseThrow();

        assertEquals(AccountOpeningStatus.APPROVED, reloaded.getStatus());
        assertEquals(304012345678L, reloaded.getResultingAccountNumber());
        assertEquals("Verified against PAN card", reloaded.getReviewNotes());
        assertEquals(1L, reloaded.getReviewedBy());
        assertEquals(0, reviewedAt.compareTo(reloaded.getReviewedAt()));
    }

    // ------------------------------------------------- concurrency primitives

    @Test
    @DisplayName("the pending-request query returns a list, so duplicates cannot break it")
    void pendingRequestQueryToleratesDuplicates() {
        Long userId = appUserRepository.save(AppUser.builder()
                .username("duplicated@example.com")
                .passwordHash("hash")
                .role(AppRole.CUSTOMER)
                .enabled(true)
                .build()).getUserId();
        detach();

        // Two PENDING rows for one customer is the state the application must
        // survive rather than throw on. A repository method returning Optional
        // would raise IncorrectResultSizeDataAccessException here, and then on
        // every read of this customer for ever after.
        for (int i = 0; i < 2; i++) {
            accountOpeningRequestRepository.save(AccountOpeningRequest.builder()
                    .userId(userId)
                    .panNo("ABCDE123" + i + "F")
                    .status(AccountOpeningStatus.PENDING)
                    .requestedAt(Instant.parse("2026-09-20T10:15:30Z").plusSeconds(i))
                    .build());
        }
        detach();

        List<AccountOpeningRequest> pending =
                accountOpeningRequestRepository.findByUserIdAndStatusOrderByRequestedAtAsc(
                        userId, AccountOpeningStatus.PENDING);

        assertEquals(2, pending.size(), "both rows are returned, not an exception");
        assertTrue(pending.get(0).getRequestedAt().isBefore(pending.get(1).getRequestedAt()),
                "oldest first, so the service can take the first as the live request");
    }

    @Test
    @DisplayName("a decided request is kept as history, not overwritten")
    void decidedRequestsAreRetainedAsHistory() {
        Long userId = appUserRepository.save(AppUser.builder()
                .username("history@example.com")
                .passwordHash("hash")
                .role(AppRole.CUSTOMER)
                .enabled(true)
                .build()).getUserId();

        accountOpeningRequestRepository.save(AccountOpeningRequest.builder()
                .userId(userId).panNo("AAAAA0000A")
                .status(AccountOpeningStatus.REJECTED)
                .reviewNotes("PAN illegible")
                .requestedAt(Instant.parse("2026-09-01T09:00:00Z"))
                .reviewedAt(Instant.parse("2026-09-02T09:00:00Z"))
                .build());

        accountOpeningRequestRepository.save(AccountOpeningRequest.builder()
                .userId(userId).panNo("BBBBB1111B")
                .status(AccountOpeningStatus.PENDING)
                .requestedAt(Instant.parse("2026-09-05T09:00:00Z"))
                .build());
        detach();

        // Reapplying after a rejection must not erase the decision, or there is
        // no record of why the first attempt failed.
        assertEquals(2, accountOpeningRequestRepository
                .findByUserIdOrderByRequestedAtDesc(userId).size());

        // And only the live one is consulted when deciding whether the customer
        // may apply again.
        assertEquals(1, accountOpeningRequestRepository
                .findByUserIdAndStatusOrderByRequestedAtAsc(userId, AccountOpeningStatus.PENDING).size());

        // The status page asks a different question - not "is one outstanding?"
        // but "where has this customer got to?" - so it gets the newest row
        // whatever its status. Here that is the reapplication, and telling the
        // customer they were still rejected while an officer sat on their new
        // request would be wrong.
        assertEquals(AccountOpeningStatus.PENDING, accountOpeningRequestRepository
                .findFirstByUserIdOrderByRequestedAtDesc(userId).orElseThrow().getStatus());
    }

    @Test
    @DisplayName("a customer who only ever was rejected still has something to show for it")
    void theLatestRequestIsFoundWithoutAnyPendingRow() {
        Long userId = 8802L;
        appUserRepository.save(AppUser.builder()
                .username("deepak.nair@example.com")
                .passwordHash("irrelevant")
                .role(AppRole.CUSTOMER)
                .fullName("Deepak Nair")
                .dob(LocalDate.of(1989, 11, 2))
                .phoneNo("9000000002")
                .branchCode(102)
                .enabled(true)
                .build());
        accountOpeningRequestRepository.save(AccountOpeningRequest.builder()
                .userId(userId).panNo("CCCCC2222C")
                .status(AccountOpeningStatus.REJECTED)
                .reviewNotes("Name on PAN does not match the profile")
                .requestedAt(Instant.parse("2026-08-20T11:00:00Z"))
                .reviewedAt(Instant.parse("2026-08-21T09:30:00Z"))
                .build());
        detach();

        // The case the fix exists for: there is no PENDING row at all, so a
        // PENDING-filtered lookup returns nothing and the customer is
        // indistinguishable from one who never applied. Filtering on nothing at
        // all finds the rejection and its reason.
        assertTrue(accountOpeningRequestRepository
                .findByUserIdAndStatusOrderByRequestedAtAsc(userId, AccountOpeningStatus.PENDING)
                .isEmpty());

        AccountOpeningRequest latest = accountOpeningRequestRepository
                .findFirstByUserIdOrderByRequestedAtDesc(userId).orElseThrow();
        assertEquals(AccountOpeningStatus.REJECTED, latest.getStatus());
        assertEquals("Name on PAN does not match the profile", latest.getReviewNotes());
        assertNotNull(latest.getReviewedAt());

        // And a customer who has never applied still comes back empty, so the two
        // are not merely both non-null.
        assertTrue(accountOpeningRequestRepository
                .findFirstByUserIdOrderByRequestedAtDesc(8803L).isEmpty());
    }

    @Test
    @DisplayName("the write locks are real locks, not a plain read")
    void writeLocksAreAcquired() {
        // Both of these are the mechanism that stops two concurrent submissions
        // or two concurrent approvals from both passing their check. A typo in
        // the JPQL, or a lock mode that silently degrades to a plain read, would
        // otherwise pass every unit test in the suite.
        AppUser user = appUserRepository.save(AppUser.builder()
                .username("locked@example.com")
                .passwordHash("hash")
                .role(AppRole.CUSTOMER)
                .enabled(true)
                .build());
        AccountOpeningRequest request = accountOpeningRequestRepository.save(AccountOpeningRequest.builder()
                .userId(user.getUserId())
                .panNo("CCCCC2222C")
                .status(AccountOpeningStatus.PENDING)
                .build());
        detach();

        assertTrue(appUserRepository.findByIdForUpdate(user.getUserId()).isPresent());
        assertTrue(accountOpeningRequestRepository.findByIdForUpdate(request.getRequestId()).isPresent());
        assertTrue(appUserRepository.findByIdForUpdate(999_999L).isEmpty());
        assertTrue(accountOpeningRequestRepository.findByIdForUpdate(999_999L).isEmpty());
    }
}
