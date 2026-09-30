package com.bank.lms.service;

import com.bank.lms.dto.CustomerProfileDto;
import com.bank.lms.dto.CustomerProfileRegistrationDto;
import com.bank.lms.dto.CustomerResponseDto;
import com.bank.lms.entity.AppRole;
import com.bank.lms.entity.AppUser;
import com.bank.lms.entity.Customer;
import com.bank.lms.exception.DuplicateResourceException;
import com.bank.lms.exception.InvalidRequestException;
import com.bank.lms.exception.ResourceNotFoundException;
import com.bank.lms.repository.AppUserRepository;
import com.bank.lms.repository.CustomerRepository;
import com.bank.lms.security.AuthenticatedUser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CustomerServiceTest {

    private static final Long ACCOUNT_NUMBER = 304012345678L;
    private static final String PAN = "ABCDE1234F";
    private static final String EMAIL = "asha.rao@example.com";

    @Mock
    private CustomerRepository customerRepository;

    @Mock
    private AppUserRepository appUserRepository;

    @Mock
    private AccountNumberGenerator accountNumberGenerator;

    @Spy
    private PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @InjectMocks
    private CustomerService customerService;

    private static CustomerProfileDto profile() {
        return new CustomerProfileDto(
                "Asha Rao",
                LocalDate.of(1994, 3, 21),
                "9876543210",
                "Asha.Rao@Example.COM",
                101);
    }

    private static CustomerProfileRegistrationDto registration() {
        return new CustomerProfileRegistrationDto("correct-horse-battery", profile());
    }

    /** A customer login that has registered but has no account yet. */
    private static AppUser accountLessUser() {
        return AppUser.builder()
                .userId(7L)
                .username(EMAIL)
                .passwordHash("irrelevant")
                .role(AppRole.CUSTOMER)
                .accountNumber(null)
                .fullName("Asha Rao")
                .dob(LocalDate.of(1994, 3, 21))
                .phoneNo("9876543210")
                .branchCode(101)
                .enabled(true)
                .build();
    }

    private static AuthenticatedUser principal(AppRole role, Long accountNumber) {
        AppUser user = AppUser.builder()
                .userId(1L)
                .username("someone@example.com")
                .passwordHash("irrelevant")
                .role(role)
                .accountNumber(accountNumber)
                .enabled(true)
                .build();
        return new AuthenticatedUser(user);
    }

    private static AuthenticatedUser customerPrincipal() {
        return principal(AppRole.CUSTOMER, ACCOUNT_NUMBER);
    }

    private void stubCleanRegistration() {
        when(customerRepository.existsByEmail(EMAIL)).thenReturn(false);
        when(appUserRepository.existsByUsernameIgnoreCase(EMAIL)).thenReturn(false);
        when(appUserRepository.save(any(AppUser.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    // ------------------------------------------------------- profile registration

    @Test
    @DisplayName("registration creates a login with no bank account attached")
    void registrationCreatesAccountLessLogin() {
        stubCleanRegistration();

        customerService.registerCustomerProfile(registration());

        ArgumentCaptor<AppUser> saved = ArgumentCaptor.forClass(AppUser.class);
        verify(appUserRepository).save(saved.capture());

        AppUser user = saved.getValue();
        assertEquals(EMAIL, user.getUsername());
        assertEquals(AppRole.CUSTOMER, user.getRole());
        assertTrue(user.isEnabled());

        // The point of the two-step flow: the account number is null because the
        // account has not been opened yet.
        assertNull(user.getAccountNumber());

        // And no customer record is created at registration.
        verify(customerRepository, never()).save(any(Customer.class));
    }

    @Test
    @DisplayName("registration stores the profile the account will later be built from")
    void registrationStoresProfile() {
        stubCleanRegistration();

        customerService.registerCustomerProfile(registration());

        ArgumentCaptor<AppUser> saved = ArgumentCaptor.forClass(AppUser.class);
        verify(appUserRepository).save(saved.capture());

        AppUser user = saved.getValue();
        assertEquals("Asha Rao", user.getFullName());
        assertEquals(LocalDate.of(1994, 3, 21), user.getDob());
        assertEquals("9876543210", user.getPhoneNo());
        assertEquals(101, user.getBranchCode());
    }

    @Test
    @DisplayName("registration does not ask for a PAN, so none is stored on the profile")
    void registrationDoesNotCollectPan() {
        stubCleanRegistration();

        CustomerProfileRegistrationDto.Result result =
                customerService.registerCustomerProfile(registration());

        // Asserted on the contract rather than on the absence of a getter: a PAN
        // component added to the profile later would break the account-opening
        // page, which assumes the only thing left to ask for is the PAN.
        assertFalse(Arrays.stream(CustomerProfileDto.class.getRecordComponents())
                .anyMatch(c -> c.getName().equalsIgnoreCase("panNo")));

        assertEquals(EMAIL, result.username());
        assertEquals("Asha Rao", result.fullName());
        assertNull(result.accountNumber());
    }

    @Test
    @DisplayName("registration hashes the password and normalises the email")
    void registrationHashesAndNormalises() {
        stubCleanRegistration();

        customerService.registerCustomerProfile(registration());

        ArgumentCaptor<AppUser> saved = ArgumentCaptor.forClass(AppUser.class);
        verify(appUserRepository).save(saved.capture());

        AppUser user = saved.getValue();
        assertNotEquals("correct-horse-battery", user.getPasswordHash(), "password must be hashed");
        assertTrue(passwordEncoder.matches("correct-horse-battery", user.getPasswordHash()));
        assertEquals(EMAIL, user.getUsername());
    }

    @Test
    @DisplayName("a duplicate email is a 409 conflict and creates no login")
    void duplicateEmailIsRejected() {
        when(customerRepository.existsByEmail(EMAIL)).thenReturn(true);

        assertThrows(DuplicateResourceException.class,
                () -> customerService.registerCustomerProfile(registration()));
        verify(appUserRepository, never()).save(any());
    }

    // -------------------------------------------------------- account opening

    @Test
    @DisplayName("opening an account copies the profile and mints an account number")
    void openAccountBuildsCustomerFromProfile() {
        AppUser user = accountLessUser();
        when(customerRepository.existsByPanNo(PAN)).thenReturn(false);
        when(customerRepository.existsByEmail(EMAIL)).thenReturn(false);
        when(accountNumberGenerator.nextAvailableAccountNumber()).thenReturn(ACCOUNT_NUMBER);
        when(customerRepository.save(any(Customer.class))).thenAnswer(inv -> inv.getArgument(0));
        when(appUserRepository.save(any(AppUser.class))).thenAnswer(inv -> inv.getArgument(0));

        Customer customer = customerService.openAccountForExistingUser(user, "  abcde1234f  ");

        // Every field but the PAN came off the profile, so the customer record
        // cannot disagree with the login behind it.
        assertEquals(ACCOUNT_NUMBER, customer.getAccountNumber());
        assertEquals(PAN, customer.getPanNo());
        assertEquals("Asha Rao", customer.getFullName());
        assertEquals(EMAIL, customer.getEmail());
        assertEquals("9876543210", customer.getPhoneNo());
        assertEquals(LocalDate.of(1994, 3, 21), customer.getDob());
        assertEquals(101, customer.getBranchCode());

        // And the login is now reachable from the account.
        assertEquals(ACCOUNT_NUMBER, user.getAccountNumber());
        verify(appUserRepository).save(user);
    }

    @Test
    @DisplayName("opening an account for a login that already has one is refused")
    void openAccountRefusesAnExistingAccount() {
        AppUser user = accountLessUser();
        user.setAccountNumber(ACCOUNT_NUMBER);

        assertThrows(InvalidRequestException.class,
                () -> customerService.openAccountForExistingUser(user, PAN));

        // Nothing allocated and nothing written: the check runs first.
        verifyNoInteractions(accountNumberGenerator);
        verify(customerRepository, never()).save(any());
    }

    @Test
    @DisplayName("a PAN already held by another customer is a 409, not a second customer")
    void openAccountRefusesADuplicatePan() {
        AppUser user = accountLessUser();
        when(customerRepository.existsByPanNo(PAN)).thenReturn(true);

        assertThrows(DuplicateResourceException.class,
                () -> customerService.openAccountForExistingUser(user, PAN));

        verify(accountNumberGenerator, never()).nextAvailableAccountNumber();
        verify(customerRepository, never()).save(any());
        assertNull(user.getAccountNumber());
    }

    @Test
    @DisplayName("an incomplete profile is reported by field rather than failing on a constraint")
    void openAccountRefusesAnIncompleteProfile() {
        AppUser user = accountLessUser();
        user.setDob(null);
        user.setBranchCode(null);

        InvalidRequestException thrown = assertThrows(InvalidRequestException.class,
                () -> customerService.openAccountForExistingUser(user, PAN));

        // The officer is told what is missing, so the request can be fixed rather
        // than retried blindly.
        assertTrue(thrown.getMessage().contains("date of birth"), thrown.getMessage());
        assertTrue(thrown.getMessage().contains("branch"), thrown.getMessage());

        verify(customerRepository, never()).save(any());
        verify(appUserRepository, never()).save(any());
    }

    // ------------------------------------------------------------------ lookup

    @Test
    @DisplayName("lookup returns the safe projection with the account number intact")
    void lookupReturnsSafeProjection() {
        Customer customer = Customer.builder()
                .accountNumber(ACCOUNT_NUMBER).panNo(PAN).fullName("Asha Rao")
                .email(EMAIL).phoneNo("9876543210").branchCode(101).build();
        when(customerRepository.findByAccountNumber(ACCOUNT_NUMBER)).thenReturn(Optional.of(customer));

        CustomerResponseDto response =
                customerService.getCustomerByAccount(ACCOUNT_NUMBER, customerPrincipal());

        assertEquals(ACCOUNT_NUMBER, response.accountNumber());
        assertEquals(EMAIL, response.email());

        // CustomerResponseDto has no panNo/dob component, so a KYC identifier
        // cannot leak even by accident.
        assertFalse(Arrays.stream(CustomerResponseDto.class.getRecordComponents())
                .anyMatch(c -> c.getName().equalsIgnoreCase("panNo")
                        || c.getName().equalsIgnoreCase("dob")));
    }

    @Test
    @DisplayName("a customer cannot read another customer's account")
    void crossAccountLookupIsHidden() {
        // No repository stub on purpose: the ownership check must reject the
        // request before any lookup happens.
        AuthenticatedUser other = principal(AppRole.CUSTOMER, 304099999999L);

        assertThrows(ResourceNotFoundException.class,
                () -> customerService.getCustomerByAccount(ACCOUNT_NUMBER, other));
        verify(customerRepository, never()).findByAccountNumber(anyLong());
    }

    @Test
    @DisplayName("an admin can read any account")
    void adminCanReadAnyAccount() {
        Customer customer = Customer.builder()
                .accountNumber(ACCOUNT_NUMBER).panNo(PAN).fullName("Asha Rao")
                .email(EMAIL).phoneNo("9876543210").branchCode(101).build();
        when(customerRepository.findByAccountNumber(ACCOUNT_NUMBER)).thenReturn(Optional.of(customer));

        AuthenticatedUser admin = principal(AppRole.ADMIN, null);

        assertEquals(ACCOUNT_NUMBER,
                customerService.getCustomerByAccount(ACCOUNT_NUMBER, admin).accountNumber());
    }

    @Test
    @DisplayName("a customer querying their own account that does not exist is a 404")
    void unknownAccountIsNotFound() {
        when(customerRepository.findByAccountNumber(ACCOUNT_NUMBER)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
                () -> customerService.getCustomerByAccount(ACCOUNT_NUMBER, customerPrincipal()));
    }
}
