package com.bank.lms.service;

import com.bank.lms.dto.CustomerEnquiryDto;
import com.bank.lms.dto.CustomerResponseDto;
import com.bank.lms.entity.Customer;
import com.bank.lms.exception.DuplicateResourceException;
import com.bank.lms.exception.ResourceNotFoundException;
import com.bank.lms.repository.CustomerRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CustomerServiceTest {

    private static final Long ACCOUNT_NUMBER = 304012345678L;

    @Mock
    private CustomerRepository customerRepository;

    @Mock
    private AccountNumberGenerator accountNumberGenerator;

    @InjectMocks
    private CustomerService customerService;

    private static CustomerEnquiryDto enquiry() {
        return new CustomerEnquiryDto(
                "Asha Rao",
                LocalDate.of(1994, 3, 21),
                "ABCDE1234F",
                "9876543210",
                "Asha.Rao@Example.COM",
                101);
    }

    @Test
    @DisplayName("registration returns the new account number instead of a text message")
    void registrationReturnsAccountNumber() {
        when(customerRepository.existsByPanNo("ABCDE1234F")).thenReturn(false);
        when(customerRepository.existsByEmail("asha.rao@example.com")).thenReturn(false);
        when(accountNumberGenerator.nextAvailableAccountNumber()).thenReturn(ACCOUNT_NUMBER);
        when(customerRepository.save(any(Customer.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        CustomerResponseDto response = customerService.registerCustomer(enquiry());

        assertEquals(ACCOUNT_NUMBER, response.accountNumber());
        assertEquals("Asha Rao", response.fullName());
        assertEquals(101, response.branchCode());
    }

    @Test
    @DisplayName("PAN and email are normalised before they hit the database")
    void registrationNormalisesInput() {
        when(customerRepository.existsByPanNo("ABCDE1234F")).thenReturn(false);
        when(customerRepository.existsByEmail("asha.rao@example.com")).thenReturn(false);
        when(accountNumberGenerator.nextAvailableAccountNumber()).thenReturn(ACCOUNT_NUMBER);
        when(customerRepository.save(any(Customer.class))).thenAnswer(inv -> inv.getArgument(0));

        customerService.registerCustomer(new CustomerEnquiryDto(
                "  Asha Rao  ", LocalDate.of(1994, 3, 21), "abcde1234f",
                "9876543210", "  Asha.Rao@Example.COM  ", 101));

        ArgumentCaptor<Customer> saved = ArgumentCaptor.forClass(Customer.class);
        verify(customerRepository).save(saved.capture());

        assertEquals("ABCDE1234F", saved.getValue().getPanNo());
        assertEquals("asha.rao@example.com", saved.getValue().getEmail());
        assertEquals("Asha Rao", saved.getValue().getFullName());
    }

    @Test
    @DisplayName("a duplicate PAN is a 409 conflict")
    void duplicatePanIsRejected() {
        when(customerRepository.existsByPanNo("ABCDE1234F")).thenReturn(true);

        assertThrows(DuplicateResourceException.class,
                () -> customerService.registerCustomer(enquiry()));
    }

    @Test
    @DisplayName("lookup returns the safe projection with the account number intact")
    void lookupReturnsSafeProjection() {
        Customer customer = Customer.builder()
                .accountNumber(ACCOUNT_NUMBER)
                .panNo("ABCDE1234F")
                .fullName("Asha Rao")
                .email("asha.rao@example.com")
                .phoneNo("9876543210")
                .branchCode(101)
                .build();
        when(customerRepository.findByAccountNumber(ACCOUNT_NUMBER)).thenReturn(Optional.of(customer));

        CustomerResponseDto response = customerService.getCustomerByAccount(ACCOUNT_NUMBER);

        assertEquals(ACCOUNT_NUMBER, response.accountNumber());
        assertEquals("asha.rao@example.com", response.email());

        // CustomerResponseDto simply has no panNo/dob component, so a KYC
        // identifier cannot leak even by accident.
        assertFalse(Arrays.stream(CustomerResponseDto.class.getRecordComponents())
                .anyMatch(c -> c.getName().equalsIgnoreCase("panNo")
                        || c.getName().equalsIgnoreCase("dob")));
    }

    @Test
    @DisplayName("an unknown account number is a 404")
    void unknownAccountIsNotFound() {
        when(customerRepository.findByAccountNumber(999999999999L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
                () -> customerService.getCustomerByAccount(999999999999L));
    }
}
