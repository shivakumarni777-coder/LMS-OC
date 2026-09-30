package com.bank.lms.repository;

import com.bank.lms.entity.AccountOpeningRequest;
import com.bank.lms.entity.AccountOpeningStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AccountOpeningRequestRepository extends JpaRepository<AccountOpeningRequest, Long> {

    /**
     * The caller's outstanding requests, oldest first.
     *
     * <p>Returns a {@code List} rather than an {@code Optional} on purpose.
     * Nothing below this method guarantees there is at most one PENDING row per
     * customer: the check that enforces it is a read followed by an insert, and
     * two concurrent submissions can both pass the read. A method returning
     * {@code Optional} would then throw
     * {@code IncorrectResultSizeDataAccessException} on every later read of that
     * customer - turning a race into a permanently broken account page. A list
     * degrades to "here is the oldest one" instead, so a customer whose rows
     * were duplicated by an earlier race is still served, and still blocked from
     * submitting again.
     *
     * <p>Reads being safe is not the same as the race being prevented. The
     * submission race is closed one level up, in
     * {@code AppUserRepository.findByIdForUpdate}, which serialises submission
     * attempts on the customer's own login row; this repository is not on that
     * path and must not be assumed to be.
     *
     * <p>Filtered on {@link AccountOpeningStatus#PENDING} because after a
     * rejection the customer is free to apply again, and this is the query that
     * decides whether they may. Reading the rejected row here would tell a
     * customer who had been turned down that they already had a request
     * outstanding, and stop them applying a second time. History is kept - see
     * {@link #findByUserIdOrderByRequestedAtDesc} - and surfaced for display by
     * {@link #findFirstByUserIdOrderByRequestedAtDesc}.
     */
    List<AccountOpeningRequest> findByUserIdAndStatusOrderByRequestedAtAsc(
            Long userId, AccountOpeningStatus status);

    /** Every request this customer has ever filed, newest first. */
    List<AccountOpeningRequest> findByUserIdOrderByRequestedAtDesc(Long userId);

    /**
     * The customer's most recent request, whatever state it is in.
     *
     * <p>Not filtered on status, unlike {@link #findByUserIdAndStatusOrderByRequestedAtAsc},
     * because its job is to answer "where has this customer got to?" and that
     * question has four answers, not two: nothing filed, awaiting review, turned
     * down, or an account opened. Filtering to PENDING made a rejected customer
     * indistinguishable from one who had never applied, so the page could offer
     * them a fresh form without ever explaining why the last one failed.
     *
     * <p>A {@code LIMIT 1} rather than loading the history and taking the first:
     * the status page runs on every visit to the loan form, and a customer with a
     * long history should not pay to load all of it to render one line.
     */
    Optional<AccountOpeningRequest> findFirstByUserIdOrderByRequestedAtDesc(Long userId);

    /**
     * Reads a request and holds it against concurrent updates until the current
     * transaction ends.
     *
     * <p>Used when deciding a request. Without the lock, two officers acting at
     * once both read PENDING, both mint an account, and the second fails on the
     * {@code customer.pan_no} unique index as an unexplained 500. With it, the
     * second transaction waits, then re-reads the now-decided row and is refused
     * with a message that says what actually happened.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from AccountOpeningRequest r where r.requestId = :requestId")
    Optional<AccountOpeningRequest> findByIdForUpdate(@Param("requestId") Long requestId);

    /** The officer's queue, oldest first, so the longest-waiting request is first. */
    List<AccountOpeningRequest> findByStatusOrderByRequestedAtAsc(AccountOpeningStatus status);

    List<AccountOpeningRequest> findAllByOrderByRequestedAtDesc();
}
