package com.bank.lms.service;

import com.bank.lms.dto.LoanRequestDto;
import com.bank.lms.dto.LoanResponseDto;
import com.bank.lms.entity.Customer;
import com.bank.lms.entity.Loan;
import com.bank.lms.repository.CustomerRepository;
import com.bank.lms.repository.LoanRepository;
import org.springframework.stereotype.Service;
import java.math.RoundingMode;
import com.bank.lms.dto.LoanApprovalDto;

import java.math.BigDecimal;
import java.time.LocalDate;

import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class LoanService {

    private final LoanRepository loanRepository;
    private final CustomerRepository customerRepository;

    public LoanService(LoanRepository loanRepository, CustomerRepository customerRepository) {
        this.loanRepository = loanRepository;
        this.customerRepository = customerRepository;
    }

    public LoanResponseDto applyForLoan(LoanRequestDto requestDto) {
        // 1. Verify the customer exists using the exact global exception logic we built earlier
        Customer customer = customerRepository.findByAccountNumber(requestDto.getAccountNumber())
                .orElseThrow(() -> new RuntimeException("Customer not found with account number: " + requestDto.getAccountNumber()));

        // 2. Build the Loan entity
        Loan loan = new Loan();
        loan.setCustomer(customer);
        loan.setLoanType(requestDto.getLoanType());
        loan.setPrincipalAmount(requestDto.getPrincipalAmount());
        loan.setLoanStatus("PENDING");
        loan.setApplicationDate(LocalDate.now());

        // 3. Financial Logic: Assign interest rate dynamically
        BigDecimal interestRate = switch (requestDto.getLoanType().toUpperCase()) {
            case "HOME" -> new BigDecimal("8.50");
            case "EDUCATION" -> new BigDecimal("9.00");
            case "PERSONAL" -> new BigDecimal("12.50");
            default -> new BigDecimal("15.00");
        };
        loan.setInterestRate(interestRate);

        // 4. Save to the database
        Loan savedLoan = loanRepository.save(loan);

        // 5. Map to the safe Response DTO
        LoanResponseDto responseDto = new LoanResponseDto();
        responseDto.setLoanId(savedLoan.getLoanId());
        responseDto.setLoanType(savedLoan.getLoanType());
        responseDto.setPrincipalAmount(savedLoan.getPrincipalAmount());
        responseDto.setInterestRate(savedLoan.getInterestRate());
        responseDto.setLoanStatus(savedLoan.getLoanStatus());
        responseDto.setApplicationDate(savedLoan.getApplicationDate());

        return responseDto;
    }

    public LoanResponseDto approveLoan(Long loanId, LoanApprovalDto approvalDto) {
        log.info("Initiating loan approval for Loan ID: {} with tenure: {} months", loanId, approvalDto.getTenureMonths());

        // 1. Fetch the loan
        Loan loan = loanRepository.findById(loanId)
                .orElseThrow(() -> {
                    log.error("Loan approval failed. No record found for Loan ID: {}", loanId);
                    return new RuntimeException("Loan not found with ID: " + loanId);
                });

        // 2. Update status and tenure
        loan.setLoanStatus("APPROVED");
        loan.setTenureMonths(approvalDto.getTenureMonths());

        // 3. EMI Calculation Math
        BigDecimal p = loan.getPrincipalAmount();
        BigDecimal r = loan.getInterestRate().divide(BigDecimal.valueOf(1200), 10, RoundingMode.HALF_UP);
        int n = approvalDto.getTenureMonths();

        BigDecimal onePlusR = BigDecimal.ONE.add(r);
        BigDecimal onePlusRToN = onePlusR.pow(n);
        BigDecimal numerator = p.multiply(r).multiply(onePlusRToN);
        BigDecimal denominator = onePlusRToN.subtract(BigDecimal.ONE);
        BigDecimal emi = numerator.divide(denominator, 2, RoundingMode.HALF_UP);

        loan.setMonthlyEmi(emi);
        log.info("Successfully calculated EMI: {} for Loan ID: {}", emi, loanId);

        // 4. Save and Map to DTO
        Loan savedLoan = loanRepository.save(loan);
        log.info("Loan ID: {} successfully approved and saved to database.", savedLoan.getLoanId());

        LoanResponseDto responseDto = new LoanResponseDto();
        responseDto.setLoanId(savedLoan.getLoanId());
        responseDto.setLoanType(savedLoan.getLoanType());
        responseDto.setPrincipalAmount(savedLoan.getPrincipalAmount());
        responseDto.setInterestRate(savedLoan.getInterestRate());
        responseDto.setLoanStatus(savedLoan.getLoanStatus());
        responseDto.setApplicationDate(savedLoan.getApplicationDate());
        responseDto.setTenureMonths(savedLoan.getTenureMonths());
        responseDto.setMonthlyEmi(savedLoan.getMonthlyEmi());

        return responseDto;
    }

}