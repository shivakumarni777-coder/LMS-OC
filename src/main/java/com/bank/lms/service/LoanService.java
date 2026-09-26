package com.bank.lms.service;

import com.bank.lms.dto.LoanApprovalDto;
import com.bank.lms.dto.LoanRequestDto;
import com.bank.lms.dto.LoanResponseDto;
import com.bank.lms.entity.Customer;
import com.bank.lms.entity.Loan;
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
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class LoanService {

    private static final Logger log = LoggerFactory.getLogger(LoanService.class);
    private static final String STATUS_PENDING = "PENDING";
    private static final String STATUS_APPROVED = "APPROVED";

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
                .loanStatus(STATUS_PENDING)
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

        loan.setLoanStatus(STATUS_APPROVED);
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
}
