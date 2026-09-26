package com.bank.lms.service;

import com.bank.lms.dto.LoanApprovalDto;
import com.bank.lms.dto.LoanResponseDto;
import com.bank.lms.entity.Loan;
import com.bank.lms.exception.InvalidRequestException;
import com.bank.lms.exception.ResourceNotFoundException;
import com.bank.lms.repository.CustomerRepository;
import com.bank.lms.repository.LoanRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LoanServiceTest {

    @Mock
    private LoanRepository loanRepository;

    @Mock
    private CustomerRepository customerRepository;

    @Spy
    private EmiCalculator emiCalculator = new EmiCalculator();

    @InjectMocks
    private LoanService loanService;

    private static Loan pendingLoan() {
        Loan loan = new Loan();
        loan.setLoanId(1L);
        loan.setPrincipalAmount(new BigDecimal("5000000"));
        loan.setInterestRate(new BigDecimal("8.50"));
        loan.setLoanStatus("PENDING");
        return loan;
    }

    @Test
    @DisplayName("approving a home loan computes the exact EMI and flips the status")
    void approveLoanCalculatesEmi() {
        Loan loan = pendingLoan();
        when(loanRepository.findById(1L)).thenReturn(Optional.of(loan));
        when(loanRepository.save(any(Loan.class))).thenReturn(loan);

        LoanResponseDto response = loanService.approveLoan(1L, new LoanApprovalDto(240));

        assertEquals(new BigDecimal("43391.16"), response.monthlyEmi());
        assertEquals("APPROVED", response.loanStatus());
        assertEquals(240, response.tenureMonths());
    }

    @Test
    @DisplayName("approving an unknown loan id is a 404, not a 500")
    void approveUnknownLoanThrowsNotFound() {
        when(loanRepository.findById(99L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
                () -> loanService.approveLoan(99L, new LoanApprovalDto(240)));
    }

    @Test
    @DisplayName("a zero tenure is rejected rather than producing a divide-by-zero")
    void approveRejectsZeroTenure() {
        when(loanRepository.findById(1L)).thenReturn(Optional.of(pendingLoan()));

        assertThrows(InvalidRequestException.class,
                () -> loanService.approveLoan(1L, new LoanApprovalDto(0)));
    }
}
