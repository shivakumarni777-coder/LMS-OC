package com.bank.lms.service;

import com.bank.lms.dto.LoanApprovalDto;
import com.bank.lms.dto.LoanRequestDto;
import com.bank.lms.dto.LoanResponseDto;
import com.bank.lms.entity.AppRole;
import com.bank.lms.entity.AppUser;
import com.bank.lms.entity.Customer;
import com.bank.lms.entity.Loan;
import com.bank.lms.exception.InvalidRequestException;
import com.bank.lms.exception.ResourceNotFoundException;
import com.bank.lms.repository.CustomerRepository;
import com.bank.lms.repository.LoanRepository;
import com.bank.lms.security.AuthenticatedUser;
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
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
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

    private static AuthenticatedUser customerPrincipal(long accountNumber) {
        return new AuthenticatedUser(AppUser.builder()
                .userId(2L)
                .username("customer@example.com")
                .passwordHash("irrelevant")
                .role(AppRole.CUSTOMER)
                .accountNumber(accountNumber)
                .enabled(true)
                .build());
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
    @DisplayName("a customer may only apply against their own account")
    void applyRejectsForeignAccount() {
        LoanRequestDto request = new LoanRequestDto(
                304012345678L, "HOME", new BigDecimal("5000000"));
        AuthenticatedUser other = customerPrincipal(304099999999L);

        assertThrows(ResourceNotFoundException.class,
                () -> loanService.applyForLoan(request, other));

        // The ownership check runs before the lookup, so a wrong-account
        // request cannot be used to probe which account numbers exist.
        verify(customerRepository, never()).findByAccountNumber(anyLong());
    }

    @Test
    @DisplayName("a customer applying for their own account is priced by loan type")
    void applyAssignsProductInterestRate() {
        LoanRequestDto request = new LoanRequestDto(
                304012345678L, "personal", new BigDecimal("200000"));
        Customer customer = new Customer();
        customer.setAccountNumber(304012345678L);
        when(customerRepository.findByAccountNumber(304012345678L)).thenReturn(Optional.of(customer));
        when(loanRepository.save(any(Loan.class))).thenAnswer(inv -> inv.getArgument(0));

        LoanResponseDto response =
                loanService.applyForLoan(request, customerPrincipal(304012345678L));

        assertEquals("PERSONAL", response.loanType());
        assertEquals(new BigDecimal("12.50"), response.interestRate());
        assertEquals("PENDING", response.loanStatus());
        assertEquals(304012345678L, response.accountNumber());
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
