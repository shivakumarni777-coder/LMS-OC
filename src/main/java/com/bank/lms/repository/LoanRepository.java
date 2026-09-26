package com.bank.lms.repository;

import com.bank.lms.entity.Loan;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface LoanRepository extends JpaRepository<Loan, Long> {

    /**
     * {@code customer} is LAZY, and open-in-view is disabled, so the association
     * has to be fetched explicitly or serialising it outside the transaction
     * would fail.
     */
    @EntityGraph(attributePaths = "customer")
    List<Loan> findAllByOrderByLoanIdDesc();

    @EntityGraph(attributePaths = "customer")
    List<Loan> findByCustomer_AccountNumberOrderByLoanIdDesc(Long accountNumber);

    @EntityGraph(attributePaths = "customer")
    List<Loan> findByLoanStatusOrderByLoanIdDesc(String loanStatus);

    @Override
    @EntityGraph(attributePaths = "customer")
    Optional<Loan> findById(Long loanId);

    boolean existsByLoanStatus(String loanStatus);

    long countByLoanStatus(String loanStatus);

    /**
     * Per-status totals for the dashboard. Returns one row per status as
     * {@code [status, count, sumOfPrincipal]}.
     */
    @Query("""
            select l.loanStatus, count(l), coalesce(sum(l.principalAmount), 0)
            from Loan l
            group by l.loanStatus
            """)
    List<Object[]> summariseByStatus();

    /** Per-status totals restricted to one customer. */
    @Query("""
            select l.loanStatus, count(l), coalesce(sum(l.principalAmount), 0)
            from Loan l
            where l.customer.accountNumber = :accountNumber
            group by l.loanStatus
            """)
    List<Object[]> summariseByStatusForAccount(Long accountNumber);
}
