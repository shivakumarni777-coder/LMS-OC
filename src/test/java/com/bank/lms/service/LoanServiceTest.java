package com.bank.lms.service;

import com.bank.lms.dto.LoanApprovalDto;
import com.bank.lms.dto.LoanRequestDto;
import com.bank.lms.dto.LoanResponseDto;
import com.bank.lms.dto.LoanSummaryDto;
import com.bank.lms.entity.AppRole;
import com.bank.lms.entity.AppUser;
import com.bank.lms.entity.Customer;
import com.bank.lms.entity.Loan;
import com.bank.lms.entity.LoanStatus;
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
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
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

    // -------------------------------------------------------- approval is once-only

    @Test
    @DisplayName("an already-approved loan cannot be re-approved on a shorter tenure")
    void approveRefusesAnAlreadyApprovedLoan() {
        Loan loan = pendingLoan();
        loan.setLoanStatus(LoanStatus.APPROVED.name());
        loan.setTenureMonths(240);
        loan.setMonthlyEmi(new BigDecimal("43391.16"));
        when(loanRepository.findById(1L)).thenReturn(Optional.of(loan));

        // Approving is not idempotent in effect: it overwrites the tenure and
        // recalculates the EMI. A retried request would silently restate a
        // disbursed contract, so it is refused even though the loan exists.
        InvalidRequestException thrown = assertThrows(InvalidRequestException.class,
                () -> loanService.approveLoan(1L, new LoanApprovalDto(120)));

        assertTrue(thrown.getMessage().contains("APPROVED"), thrown.getMessage());
        verify(loanRepository, never()).save(any(Loan.class));
        assertEquals(240, loan.getTenureMonths(), "the agreed schedule is untouched");
    }

    @Test
    @DisplayName("a disbursed loan cannot be approved again")
    void approveRefusesADisbursedLoan() {
        Loan loan = pendingLoan();
        loan.setLoanStatus(LoanStatus.DISBURSED.name());
        loan.setTenureMonths(240);
        loan.setMonthlyEmi(new BigDecimal("43391.16"));
        when(loanRepository.findById(1L)).thenReturn(Optional.of(loan));

        InvalidRequestException thrown = assertThrows(InvalidRequestException.class,
                () -> loanService.approveLoan(1L, new LoanApprovalDto(120)));

        assertTrue(thrown.getMessage().contains("DISBURSED"), thrown.getMessage());
        verify(loanRepository, never()).save(any(Loan.class));
        assertEquals(240, loan.getTenureMonths(), "the disbursed schedule is untouched");
    }

    @Test
    @DisplayName("a closed loan cannot be approved")
    void approveRefusesAClosedLoan() {
        Loan loan = pendingLoan();
        loan.setLoanStatus(LoanStatus.CLOSED.name());
        when(loanRepository.findById(1L)).thenReturn(Optional.of(loan));

        assertThrows(InvalidRequestException.class,
                () -> loanService.approveLoan(1L, new LoanApprovalDto(240)));
        verify(loanRepository, never()).save(any(Loan.class));
    }

    // ------------------------------------------------------------------ reads

    @Test
    @DisplayName("an admin listing loans sees every loan")
    void adminSeesAllLoans() {
        when(loanRepository.findAllByOrderByLoanIdDesc()).thenReturn(List.of(loanFor(1L, 304012345678L)));

        List<LoanResponseDto> loans = loanService.listLoans(adminPrincipal());

        assertEquals(1, loans.size());
        assertEquals(304012345678L, loans.getFirst().accountNumber());
        verify(loanRepository, never()).findByCustomer_AccountNumberOrderByLoanIdDesc(anyLong());
    }

    @Test
    @DisplayName("a customer listing loans is scoped to their own account in the query")
    void customerSeesOnlyOwnLoans() {
        when(loanRepository.findByCustomer_AccountNumberOrderByLoanIdDesc(304012345678L))
                .thenReturn(List.of(loanFor(1L, 304012345678L)));

        List<LoanResponseDto> loans =
                loanService.listLoans(customerPrincipal(304012345678L));

        assertEquals(1, loans.size());
        verify(loanRepository, never()).findAllByOrderByLoanIdDesc();
    }

    @Test
    @DisplayName("a customer cannot read another customer's loan by id")
    void getLoanEnforcesOwnership() {
        when(loanRepository.findById(1L)).thenReturn(Optional.of(loanFor(1L, 304012345678L)));

        assertThrows(ResourceNotFoundException.class,
                () -> loanService.getLoan(1L, customerPrincipal(304099999999L)));
    }

    @Test
    @DisplayName("a customer cannot list another customer's loans")
    void listLoansForCustomerEnforcesOwnership() {
        assertThrows(ResourceNotFoundException.class,
                () -> loanService.listLoansForCustomer(304012345678L, customerPrincipal(304099999999L)));

        verify(loanRepository, never()).findByCustomer_AccountNumberOrderByLoanIdDesc(anyLong());
    }

    @Test
    @DisplayName("the summary reports a zero row for statuses with no loans")
    void summaryFillsMissingStatuses() {
        when(loanRepository.summariseByStatusForAccount(304012345678L))
                .thenReturn(List.<Object[]>of(new Object[]{"PENDING", 2L, new BigDecimal("1500000")}));
        when(loanRepository.findByCustomer_AccountNumberOrderByLoanIdDesc(304012345678L))
                .thenReturn(List.of());

        LoanSummaryDto summary = loanService.summarise(customerPrincipal(304012345678L));

        assertEquals(2, summary.totalLoans());
        // BigDecimal.equals is scale-sensitive, so compare numerically.
        assertEquals(0, new BigDecimal("1500000.00").compareTo(summary.totalPrincipal()));
        assertEquals(LoanStatus.values().length, summary.byStatus().size());
        assertEquals(2, bucket(summary, LoanStatus.PENDING).count());
        // APPROVED had no row in the aggregate but must still appear, at zero.
        assertEquals(0, bucket(summary, LoanStatus.APPROVED).count());
        assertEquals(0, new BigDecimal("0.00").compareTo(bucket(summary, LoanStatus.APPROVED).principal()));
    }

    private static LoanSummaryDto.StatusBucket bucket(LoanSummaryDto summary, Object status) {
        String name = status instanceof LoanStatus s ? s.name() : status.toString();
        return summary.byStatus().stream()
                .filter(b -> b.status().equals(name))
                .findFirst()
                .orElseThrow();
    }

    @Test
    @DisplayName("the review queue holds only pending applications")
    void reviewQueueHoldsOnlyPendingApplications() {
        Loan older = loanFor(1L, 304012345678L);
        Loan newer = loanFor(2L, 304099999999L);
        newer.setLoanStatus(LoanStatus.APPROVED.name());

        when(loanRepository.findByLoanStatusOrderByApplicationDateAsc(LoanStatus.PENDING.name()))
                .thenReturn(List.of(older));

        List<LoanResponseDto> queue = loanService.listPendingForReview();

        // Filtering and ordering happen in the query, so an approved loan cannot
        // reach the queue even if a caller asks for one directly.
        assertEquals(1, queue.size());
        assertEquals(1L, queue.getFirst().loanId());
        assertEquals("PENDING", queue.getFirst().loanStatus());
    }

    private static Loan loanFor(Long id, Long accountNumber) {
        Customer customer = new Customer();
        customer.setAccountNumber(accountNumber);
        Loan loan = new Loan();
        loan.setLoanId(id);
        loan.setLoanType("HOME");
        loan.setPrincipalAmount(new BigDecimal("1000000"));
        loan.setInterestRate(new BigDecimal("8.50"));
        loan.setLoanStatus("PENDING");
        loan.setCustomer(customer);
        return loan;
    }

    private static AuthenticatedUser adminPrincipal() {
        return new AuthenticatedUser(AppUser.builder()
                .userId(1L)
                .username("admin@example.com")
                .passwordHash("irrelevant")
                .role(AppRole.ADMIN)
                .accountNumber(null)
                .enabled(true)
                .build());
    }

    @Test
    @DisplayName("a zero tenure is rejected rather than producing a divide-by-zero")
    void approveRejectsZeroTenure() {
        when(loanRepository.findById(1L)).thenReturn(Optional.of(pendingLoan()));

        assertThrows(InvalidRequestException.class,
                () -> loanService.approveLoan(1L, new LoanApprovalDto(0)));
    }
}
