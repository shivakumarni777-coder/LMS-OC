package com.bank.lms.service;

import com.bank.lms.dto.CustomerEnquiryDto;
import com.bank.lms.dto.CustomerMapper;
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
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class CustomerService {

    private final CustomerRepository customerRepository;
    private final AppUserRepository appUserRepository;
    private final AccountNumberGenerator accountNumberGenerator;
    private final PasswordEncoder passwordEncoder;

    /**
     * Creates the customer and their login in one transaction, and returns the
     * generated account number.
     *
     * <p>The original returned a bare string, so a caller had no way to learn
     * the account number they needed in order to do anything else.
     */
    @Transactional
    public CustomerRegistrationDto.Result registerCustomer(CustomerRegistrationDto registration) {
        CustomerEnquiryDto enquiry = registration.customer();
        String panNo = normalisePan(enquiry.panNo());
        String email = normaliseEmail(enquiry.email());

        if (customerRepository.existsByPanNo(panNo)) {
            throw new DuplicateResourceException("A customer with this PAN number is already registered.");
        }
        if (customerRepository.existsByEmail(email) || appUserRepository.existsByUsernameIgnoreCase(email)) {
            throw new DuplicateResourceException("A customer with this email address is already registered.");
        }

        Customer customer = Customer.builder()
                .accountNumber(accountNumberGenerator.nextAvailableAccountNumber())
                .panNo(panNo)
                .fullName(enquiry.fullName().trim())
                .phoneNo(enquiry.phoneNo().trim())
                .email(email)
                .dob(enquiry.dob())
                .branchCode(enquiry.branchCode())
                .build();

        Customer savedCustomer = customerRepository.save(customer);

        // The email doubles as the login, so registration cannot leave a
        // customer who is unable to sign in.
        appUserRepository.save(AppUser.builder()
                .username(email)
                .passwordHash(passwordEncoder.encode(registration.password()))
                .role(AppRole.CUSTOMER)
                .accountNumber(savedCustomer.getAccountNumber())
                .fullName(savedCustomer.getFullName())
                .enabled(true)
                .createdAt(Instant.now())
                .build());

        return new CustomerRegistrationDto.Result(
                CustomerMapper.toResponseDto(savedCustomer), email);
    }

    @Transactional(readOnly = true)
    public CustomerResponseDto getCustomerByAccount(Long accountNumber, AuthenticatedUser caller) {
        if (caller == null) {
            throw new ResourceNotFoundException("Customer not found with account number: " + accountNumber);
        }
        if (!caller.canAccess(accountNumber)) {
            // Deliberately 404 rather than 403: confirming the account exists
            // would let a customer probe for other people's account numbers.
            throw new ResourceNotFoundException("Customer not found with account number: " + accountNumber);
        }

        return customerRepository.findByAccountNumber(accountNumber)
                .map(CustomerMapper::toResponseDto)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Customer not found with account number: " + accountNumber));
    }

    private static String normalisePan(String panNo) {
        return panNo.trim().toUpperCase(Locale.ROOT);
    }

    private static String normaliseEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
