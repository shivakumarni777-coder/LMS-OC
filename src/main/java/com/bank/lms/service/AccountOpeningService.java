package com.bank.lms.service;

import com.bank.lms.dto.AccountOpeningMapper;
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
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * Opening a bank account for a login that has no account.
 *
 * <p>The customer contributes exactly one thing: their PAN. Everything else in
 * the resulting {@link Customer} is copied from their profile by
 * {@link CustomerService#openAccountForExistingUser}, so an approved request
 * cannot produce a customer record that disagrees with the login behind it.
 *
 * <p>Approving is a single transaction covering the account, the link back onto
 * the login, and the request's own status. Splitting them would allow a
 * committed account with a request still marked PENDING, which is the state that
 * leaves an officer unable to tell whether the work has been done.
 *
 * <p><b>On concurrent requests.</b> "At most one PENDING request per customer"
 * is a read followed by an insert, so the schema alone cannot enforce it - there
 * is no migration tooling here to add a partial unique index and MySQL has no
 * partial indexes. Two things stand in for it. Writes that could create a second
 * PENDING row take a pessimistic lock on the customer's own login row first
 * ({@code submit}), or on the request being decided ({@code review}), so the
 * second of two racing callers waits and then sees the committed state. Reads
 * take the first row rather than assuming there is exactly one, so even if
 * duplicates somehow exist they render as a single request instead of throwing.
 * Decided requests are kept, not overwritten, so a customer who is rejected can
 * apply again and their history remains auditable - which is why the status
 * page can report a rejection while the "may I apply again" check still ignores
 * it.
 */
@Service
@RequiredArgsConstructor
public class AccountOpeningService {

    private static final Logger log = LoggerFactory.getLogger(AccountOpeningService.class);

    private final AccountOpeningRequestRepository requestRepository;
    private final AppUserRepository appUserRepository;
    private final CustomerRepository customerRepository;
    private final CustomerService customerService;

    // ---------------------------------------------------------------- customer

    /**
     * Whether the caller can be booked against, and where their request stands.
     *
     * <p>The loan application page asks this before it renders, because the loan
     * flow records an application against an account. Answering it here is what
     * turns "you have no account" into something the user can act on rather than
     * a 404 from the apply endpoint.
     *
     * <p>Reports the most recent request, not the outstanding one. Both states a
     * customer can be stuck in - waiting, and turned down - have to come back
     * distinctly, and a rejected customer needs to be able to see the reason
     * before deciding whether to apply again. See {@link AccountStatusDto} for
     * the four cases this distinguishes.
     */
    @Transactional(readOnly = true)
    public AccountStatusDto statusFor(AuthenticatedUser caller) {
        if (caller == null) {
            throw new ResourceNotFoundException("Authentication required.");
        }
        if (caller.getAccountNumber() != null) {
            return AccountStatusDto.withAccount(caller.getAccountNumber());
        }
        return AccountStatusDto.withoutAccount(latestRequestFor(caller.getUserId()));
    }

    /**
     * The caller's outstanding request, or null if they have not applied.
     *
     * <p>Deliberately narrower than {@link #statusFor}, and not interchangeable
     * with it: this answers "is one waiting on an officer?", which is what
     * decides whether the customer may apply, whereas the status endpoint answers
     * "where has this customer got to?", which includes being turned down. The
     * difference is the whole point - a rejected customer must not be told they
     * have an outstanding request, or they can never apply again.
     */
    @Transactional(readOnly = true)
    public AccountOpeningRequestDto.Response currentFor(AuthenticatedUser caller) {
        return pendingRequestFor(requireCustomerId(caller))
                .map(AccountOpeningMapper::toResponse)
                .orElse(null);
    }

    /**
     * Records a request to open an account.
     *
     * <p>Rejects rather than overwrites when one is already outstanding, so a
     * double-clicked Submit button cannot produce two requests competing to
     * mint the same account number.
     *
     * <p>The caller's login row is locked for the duration, which is what makes
     * that check safe against a genuinely concurrent second submission rather
     * than only against a double-click. The second caller blocks until this
     * transaction commits, re-reads, finds the row this one just wrote, and gets
     * a conflict - instead of two PENDING rows that would later break every
     * read of this customer's requests.
     */
    @Transactional
    public AccountOpeningRequestDto.Response submit(AuthenticatedUser caller, String panNo) {
        Long userId = requireCustomerId(caller);

        if (caller.getAccountNumber() != null) {
            throw new InvalidRequestException(
                    "This login already has a bank account, so there is nothing to open.");
        }

        // The serialisation point. Every submission for this customer has to
        // touch this row, so holding it makes the check below effectively atomic
        // with respect to other submissions.
        appUserRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Authentication required."));

        if (pendingRequestFor(userId).isPresent()) {
            throw new DuplicateResourceException(
                    "You already have an account-opening request awaiting review.");
        }

        String pan = CustomerService.normalisePan(panNo);
        // Checked at submission, not only at approval. Discovering the clash days
        // later, after the officer has already read and assessed the request, is a
        // worse experience for the customer and wastes the officer's time.
        if (customerRepository.existsByPanNo(pan)) {
            throw new DuplicateResourceException(
                    "A customer with this PAN number is already registered.");
        }

        AccountOpeningRequest saved = requestRepository.save(AccountOpeningRequest.builder()
                .userId(caller.getUserId())
                .panNo(pan)
                .status(AccountOpeningStatus.PENDING)
                .requestedAt(Instant.now())
                .build());

        log.info("Account-opening request {} submitted by user {}", saved.getRequestId(), caller.getUserId());
        return AccountOpeningMapper.toResponse(saved);
    }

    // ------------------------------------------------------------------- admin

    @Transactional(readOnly = true)
    public List<AccountOpeningRequestDto.AdminResponse> listForReview(AccountOpeningStatus status) {
        List<AccountOpeningRequest> requests = status == null
                ? requestRepository.findAllByOrderByRequestedAtDesc()
                : requestRepository.findByStatusOrderByRequestedAtAsc(status);

        return requests.stream().map(this::toAdminResponse).toList();
    }

    @Transactional(readOnly = true)
    public AccountOpeningRequestDto.AdminResponse getForReview(Long requestId) {
        return toAdminResponse(requireRequest(requestId));
    }

    /**
     * Approves or rejects a request.
     *
     * <p>Approval creates the bank account and links it to the login, then marks
     * the request. All of it in one transaction: a committed account with a
     * request still marked PENDING would leave the officer unable to tell whether
     * the work had been done, and would invite a second approval that then failed
     * on the unique account number.
     */
    @Transactional
    public AccountOpeningRequestDto.AdminResponse review(
            Long requestId, AccountOpeningRequestDto.Decision decision, AuthenticatedUser reviewer) {

        AccountOpeningRequest request = requireRequestForUpdate(requestId);

        if (request.getStatus() != AccountOpeningStatus.PENDING) {
            throw new InvalidRequestException(
                    "This request has already been " + request.getStatus().name().toLowerCase(Locale.ROOT) + ".");
        }

        AppUser user = appUserRepository.findById(request.getUserId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No login found for this request."));

        AccountOpeningStatus outcome = AccountOpeningStatus.valueOf(decision.decision());

        if (outcome == AccountOpeningStatus.APPROVED) {
            Customer customer = customerService.openAccountForExistingUser(user, request.getPanNo());
            request.setResultingAccountNumber(customer.getAccountNumber());
            log.info("Account {} opened for user {} on request {}",
                    customer.getAccountNumber(), user.getUserId(), requestId);
        } else {
            log.info("Account-opening request {} rejected by {}", requestId, reviewerName(reviewer));
        }

        request.setStatus(outcome);
        request.setReviewNotes(trimToNull(decision.reviewNotes()));
        request.setReviewedAt(Instant.now());
        request.setReviewedBy(reviewer == null ? null : reviewer.getUserId());

        return AccountOpeningMapper.toAdminResponse(requestRepository.save(request), user);
    }

    // ----------------------------------------------------------------- helpers

    /**
     * The customer's outstanding request, if any.
     *
     * <p>Asks for a list and takes the oldest entry. The "at most one" is a
     * property the schema does not guarantee, so a query that assumed it would
     * turn any duplicate into a 500 on every subsequent page load. Taking the
     * first row means duplicates - however they arose - render as a single
     * request awaiting review, which is what the customer would see anyway.
     */
    private Optional<AccountOpeningRequest> pendingRequestFor(Long userId) {
        return userId == null
                ? Optional.empty()
                : requestRepository
                        .findByUserIdAndStatusOrderByRequestedAtAsc(userId, AccountOpeningStatus.PENDING)
                        .stream()
                        .findFirst();
    }

    /**
     * The customer's most recent request of any status, if they have ever applied.
     *
     * <p>What the status page needs, and the reason it is separate from
     * {@link #pendingRequestFor} rather than a widened version of it. Widening
     * would have been the smaller change, and wrong: the "may I apply again" check
     * in {@code submit} reads the same helper, and a customer whose last request
     * was rejected has to come back empty from it or the second application can
     * never be made. Two different questions, two different queries.
     */
    private AccountOpeningRequest latestRequestFor(Long userId) {
        return userId == null
                ? null
                : requestRepository.findFirstByUserIdOrderByRequestedAtDesc(userId).orElse(null);
    }

    private AccountOpeningRequest requireRequest(Long requestId) {
        return requestRepository.findById(requestId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Account-opening request not found with ID: " + requestId));
    }

    /**
     * The request being decided, locked against concurrent decisions.
     *
     * <p>Two officers approving the same request at once would otherwise both
     * read PENDING and both mint an account. The second insert would be stopped
     * by the unique index on {@code customer.pan_no}, so no duplicate customer
     * is created - but the officer would be shown an unexplained 500 for
     * clicking Approve. Holding the row means the second caller waits, re-reads
     * the committed APPROVED row, and is told the request has already been
     * decided.
     */
    private AccountOpeningRequest requireRequestForUpdate(Long requestId) {
        return requestRepository.findByIdForUpdate(requestId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Account-opening request not found with ID: " + requestId));
    }

    private AccountOpeningRequestDto.AdminResponse toAdminResponse(AccountOpeningRequest request) {
        AppUser user = appUserRepository.findById(request.getUserId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No login found for request " + request.getRequestId() + "."));
        return AccountOpeningMapper.toAdminResponse(request, user);
    }

    /**
     * A staff login has no profile, so the officer is identified by name where
     * there is one and by id otherwise. Only ever written to a log line.
     */
    private static String reviewerName(AuthenticatedUser reviewer) {
        if (reviewer == null) {
            return "an unknown reviewer";
        }
        return reviewer.getFullName() != null ? reviewer.getFullName() : reviewer.getUsername();
    }

    private static Long requireCustomerId(AuthenticatedUser caller) {
        if (caller == null || caller.getUserId() == null) {
            throw new ResourceNotFoundException("Authentication required.");
        }
        if (caller.getRole() != AppRole.CUSTOMER) {
            throw new InvalidRequestException(
                    "Only a customer login can request a bank account.");
        }
        return caller.getUserId();
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
