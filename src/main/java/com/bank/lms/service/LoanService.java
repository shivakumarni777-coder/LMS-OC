package com.bank.lms.service;

import com.bank.lms.dto.LoanApprovalDto;
import com.bank.lms.dto.LoanRequestDto;
import com.bank.lms.dto.LoanResponseDto;
import com.bank.lms.dto.LoanSummaryDto;
import com.bank.lms.entity.Customer;
import com.bank.lms.entity.Loan;
import com.bank.lms.entity.LoanStatus;
import com.bank.lms.exception.InvalidRequestException;
import com.bank.lms.exception.ResourceNotFoundException;
import com.bank.lms.repository.CustomerRepository;
import com.bank.lms.repository.LoanRepository;
import com.bank.lms.security.AuthenticatedUser;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class LoanService {

    private static final Logger log = LoggerFactory.getLogger(LoanService.class);

    private final LoanRepository loanRepository;
    private final CustomerRepository customerRepository;
    private final EmiCalculator emiCalculator;

    @Transactional
    public LoanResponseDto applyForLoan(LoanRequestDto request, AuthenticatedUser caller) {
        // Checked before the lookup so a customer cannot confirm whether an
        // account number exists by watching the error change.
        if (caller == null || !caller.canAccess(request.accountNumber())) {
            throw new ResourceNotFoundException(
                    "Customer not found with account number: " + request.accountNumber());
        }

        Customer customer = customerRepository.findByAccountNumber(request.accountNumber())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Customer not found with account number: " + request.accountNumber()));

        Loan loan = Loan.builder()
                .customer(customer)
                .loanType(request.loanType().toUpperCase(Locale.ROOT))
                .principalAmount(request.principalAmount())
                .interestRate(interestRateFor(request.loanType()))
                .loanStatus(LoanStatus.PENDING.name())
                .applicationDate(LocalDate.now())
                .build();

        return LoanResponseDto.from(loanRepository.save(loan));
    }

    @Transactional
    public LoanResponseDto approveLoan(Long loanId, LoanApprovalDto approval) {
        Loan loan = loanRepository.findById(loanId)
                .orElseThrow(() -> {
                    log.warn("Approval failed: no loan with id {}", loanId);
                    return new ResourceNotFoundException("Loan not found with ID: " + loanId);
                });

        BigDecimal emi = emiCalculator.calculate(
                loan.getPrincipalAmount(), loan.getInterestRate(), approval.tenureMonths());

        loan.setLoanStatus(LoanStatus.APPROVED.name());
        loan.setTenureMonths(approval.tenureMonths());
        loan.setMonthlyEmi(emi);

        log.info("Approved loan {} for {} months, EMI {}", loanId, approval.tenureMonths(), emi);
        return LoanResponseDto.from(loanRepository.save(loan));
    }

    /** Product pricing table. */
    private static BigDecimal interestRateFor(String loanType) {
        return switch (loanType.toUpperCase(Locale.ROOT)) {
            case "HOME" -> new BigDecimal("8.50");
            case "EDUCATION" -> new BigDecimal("9.00");
            case "PERSONAL" -> new BigDecimal("12.50");
            default -> throw new InvalidRequestException(
                    "Unsupported loan type: " + loanType + ". Expected HOME, EDUCATION or PERSONAL.");
        };
    }

    // ---------------------------------------------------------------- reads

    /**
     * Loans visible to the caller: everything for an admin, only their own for
     * a customer. Scoping happens in the query rather than by filtering in
     * memory, so a customer can never be served rows they should not see.
     */
    @Transactional(readOnly = true)
    public List<LoanResponseDto> listLoans(AuthenticatedUser caller) {
        List<Loan> loans = isAdmin(caller)
                ? loanRepository.findAllByOrderByLoanIdDesc()
                : loanRepository.findByCustomer_AccountNumberOrderByLoanIdDesc(requireAccount(caller));

        return loans.stream().map(LoanResponseDto::from).toList();
    }

    @Transactional(readOnly = true)
    public List<LoanResponseDto> listLoansForCustomer(Long accountNumber, AuthenticatedUser caller) {
        requireAccess(caller, accountNumber);
        return loanRepository.findByCustomer_AccountNumberOrderByLoanIdDesc(accountNumber).stream()
                .map(LoanResponseDto::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public LoanResponseDto getLoan(Long loanId, AuthenticatedUser caller) {
        Loan loan = loanRepository.findById(loanId)
                .orElseThrow(() -> new ResourceNotFoundException("Loan not found with ID: " + loanId));

        requireAccess(caller, loan.getCustomer().getAccountNumber());
        return LoanResponseDto.from(loan);
    }

    @Transactional(readOnly = true)
    public LoanSummaryDto summarise(AuthenticatedUser caller) {
        List<Object[]> rows = isAdmin(caller)
                ? loanRepository.summariseByStatus()
                : loanRepository.summariseByStatusForAccount(requireAccount(caller));

        // Seeded from the enum in declaration order so the response shape is
        // stable and the UI never has to reason about a missing key.
        Map<String, LoanSummaryDto.StatusBucket> buckets = new LinkedHashMap<>();
        for (LoanStatus status : LoanStatus.values()) {
            buckets.put(status.name(), new LoanSummaryDto.StatusBucket(status.name(), 0L, BigDecimal.ZERO));
        }

        long totalLoans = 0;
        BigDecimal totalPrincipal = BigDecimal.ZERO;
        for (Object[] row : rows) {
            String status = (String) row[0];
            long count = ((Number) row[1]).longValue();
            BigDecimal principal = (BigDecimal) row[2];

            buckets.put(status, new LoanSummaryDto.StatusBucket(status, count, principal));
            totalLoans += count;
            totalPrincipal = totalPrincipal.add(principal);
        }

        BigDecimal monthlyEmi = isAdmin(caller)
                ? sumMonthlyEmiFor(null)
                : sumMonthlyEmiFor(requireAccount(caller));

        return new LoanSummaryDto(totalLoans, totalPrincipal, monthlyEmi, List.copyOf(buckets.values()));
    }

    private BigDecimal sumMonthlyEmiFor(Long accountNumber) {
        List<Loan> approved = accountNumber == null
                ? loanRepository.findByLoanStatusOrderByLoanIdDesc(LoanStatus.APPROVED.name())
                : loanRepository.findByCustomer_AccountNumberOrderByLoanIdDesc(accountNumber).stream()
                        .filter(l -> LoanStatus.APPROVED.name().equals(l.getLoanStatus()))
                        .toList();

        return approved.stream()
                .map(Loan::getMonthlyEmi)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static boolean isAdmin(AuthenticatedUser caller) {
        return caller != null && caller.isAdmin();
    }

    private static Long requireAccount(AuthenticatedUser caller) {
        if (caller == null || caller.getAccountNumber() == null) {
            throw new ResourceNotFoundException("No customer account is linked to this login.");
        }
        return caller.getAccountNumber();
    }

    /** Enforces ownership, answering 404 so account numbers cannot be probed. */
    private static void requireAccess(AuthenticatedUser caller, Long accountNumber) {
        if (caller == null || !caller.canAccess(accountNumber)) {
            throw new ResourceNotFoundException(
                    "Customer not found with account number: " + accountNumber);
        }
    }
}
