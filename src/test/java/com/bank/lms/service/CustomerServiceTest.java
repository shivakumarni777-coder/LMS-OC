package com.bank.lms.service;

import com.bank.lms.dto.CustomerEnquiryDto;
import com.bank.lms.dto.CustomerRegistrationDto;
import com.bank.lms.dto.CustomerResponseDto;
import com.bank.lms.entity.AppRole;
import com.bank.lms.entity.AppUser;
import com.bank.lms.entity.Customer;
import com.bank.lms.exception.DuplicateResourceException;
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
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CustomerServiceTest {

    private static final Long ACCOUNT_NUMBER = 304012345678L;
    private static final String PAN = "ABCDE1234F";

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

    private static CustomerRegistrationDto registration() {
        return new CustomerRegistrationDto(
                "correct-horse-battery",
                new CustomerEnquiryDto(
                        "Asha Rao",
                        LocalDate.of(1994, 3, 21),
                        PAN,
                        "9876543210",
                        "Asha.Rao@Example.COM",
                        101));
    }

    private static AuthenticatedUser customerPrincipal() {
        return principal(AppRole.CUSTOMER, ACCOUNT_NUMBER);
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

    private void stubCleanRegistration() {
        when(customerRepository.existsByPanNo(PAN)).thenReturn(false);
        when(customerRepository.existsByEmail("asha.rao@example.com")).thenReturn(false);
        when(appUserRepository.existsByUsernameIgnoreCase("asha.rao@example.com")).thenReturn(false);
        when(accountNumberGenerator.nextAvailableAccountNumber()).thenReturn(ACCOUNT_NUMBER);
        when(customerRepository.save(any(Customer.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    @DisplayName("registration returns the new account number instead of a text message")
    void registrationReturnsAccountNumber() {
        stubCleanRegistration();

        CustomerRegistrationDto.Result result = customerService.registerCustomer(registration());

        assertEquals(ACCOUNT_NUMBER, result.customer().accountNumber());
        assertEquals("Asha Rao", result.customer().fullName());
        assertEquals(101, result.customer().branchCode());
        assertEquals("asha.rao@example.com", result.username());
    }

    @Test
    @DisplayName("registration also creates a login, so a new customer can actually sign in")
    void registrationCreatesLogin() {
        stubCleanRegistration();

        customerService.registerCustomer(registration());

        ArgumentCaptor<AppUser> saved = ArgumentCaptor.forClass(AppUser.class);
        verify(appUserRepository).save(saved.capture());

        AppUser user = saved.getValue();
        assertEquals("asha.rao@example.com", user.getUsername());
        assertEquals(AppRole.CUSTOMER, user.getRole());
        assertEquals(ACCOUNT_NUMBER, user.getAccountNumber());
        assertTrue(user.isEnabled());

        assertNotEquals("correct-horse-battery", user.getPasswordHash(), "password must be hashed");
        assertTrue(passwordEncoder.matches("correct-horse-battery", user.getPasswordHash()));
    }

    @Test
    @DisplayName("PAN and email are normalised before they hit the database")
    void registrationNormalisesInput() {
        stubCleanRegistration();

        customerService.registerCustomer(new CustomerRegistrationDto(
                "correct-horse-battery",
                new CustomerEnquiryDto(
                        "  Asha Rao  ", LocalDate.of(1994, 3, 21), "abcde1234f",
                        "9876543210", "  Asha.Rao@Example.COM  ", 101)));

        ArgumentCaptor<Customer> saved = ArgumentCaptor.forClass(Customer.class);
        verify(customerRepository).save(saved.capture());

        assertEquals(PAN, saved.getValue().getPanNo());
        assertEquals("asha.rao@example.com", saved.getValue().getEmail());
        assertEquals("Asha Rao", saved.getValue().getFullName());
    }

    @Test
    @DisplayName("a duplicate PAN is a 409 conflict and creates no login")
    void duplicatePanIsRejected() {
        when(customerRepository.existsByPanNo(PAN)).thenReturn(true);

        assertThrows(DuplicateResourceException.class,
                () -> customerService.registerCustomer(registration()));
        verify(appUserRepository, never()).save(any());
    }

    @Test
    @DisplayName("lookup returns the safe projection with the account number intact")
    void lookupReturnsSafeProjection() {
        Customer customer = Customer.builder()
                .accountNumber(ACCOUNT_NUMBER).panNo(PAN).fullName("Asha Rao")
                .email("asha.rao@example.com").phoneNo("9876543210").branchCode(101).build();
        when(customerRepository.findByAccountNumber(ACCOUNT_NUMBER)).thenReturn(Optional.of(customer));

        CustomerResponseDto response =
                customerService.getCustomerByAccount(ACCOUNT_NUMBER, customerPrincipal());

        assertEquals(ACCOUNT_NUMBER, response.accountNumber());
        assertEquals("asha.rao@example.com", response.email());

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
                .email("asha.rao@example.com").phoneNo("9876543210").branchCode(101).build();
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
