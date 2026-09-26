package com.bank.lms.service;

import com.bank.lms.dto.LoanApprovalDto;
import com.bank.lms.dto.LoanResponseDto;
import com.bank.lms.entity.Loan;
import com.bank.lms.repository.LoanRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LoanServiceTest {

    @Mock
    private LoanRepository loanRepository;

    @InjectMocks
    private LoanService loanService;

    @Test
    void testApproveLoan_CalculatesCorrectEmi() {
        // 1. Arrange: Setup our fake database record
        Loan dummyLoan = new Loan();
        dummyLoan.setLoanId(1L);
        dummyLoan.setPrincipalAmount(new BigDecimal("5000000"));
        dummyLoan.setInterestRate(new BigDecimal("8.50"));

        LoanApprovalDto approvalDto = new LoanApprovalDto();
        approvalDto.setTenureMonths(240);

        // Instruct Mockito what to return when the repository is called
        when(loanRepository.findById(1L)).thenReturn(Optional.of(dummyLoan));
        when(loanRepository.save(any(Loan.class))).thenReturn(dummyLoan);

        // 2. Act: Call our actual service method
        LoanResponseDto response = loanService.approveLoan(1L, approvalDto);

        // 3. Assert: Verify the math is mathematically perfect
        assertEquals(new BigDecimal("43391.16"), response.getMonthlyEmi(), "The EMI calculation should match exactly");
        assertEquals("APPROVED", response.getLoanStatus(), "The loan status should be updated to APPROVED");
    }
}