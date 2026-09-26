package com.bank.lms.service;

import com.bank.lms.dto.CustomerEnquiryDto;
import com.bank.lms.dto.CustomerMapper;
import com.bank.lms.dto.CustomerResponseDto;
import com.bank.lms.entity.Customer;
import com.bank.lms.exception.DuplicateResourceException;
import com.bank.lms.exception.ResourceNotFoundException;
import com.bank.lms.repository.CustomerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

@Service
@RequiredArgsConstructor
public class CustomerService {

    private final CustomerRepository customerRepository;
    private final AccountNumberGenerator accountNumberGenerator;

    /**
     * Creates a customer and returns their projection, which now includes the
     * generated account number. The original returned a bare string containing
     * the customer's PAN, so callers never learned the account number they
     * needed in order to do anything else.
     */
    @Transactional
    public CustomerResponseDto registerCustomer(CustomerEnquiryDto enquiry) {
        String panNo = normalisePan(enquiry.panNo());
        String email = normaliseEmail(enquiry.email());

        if (customerRepository.existsByPanNo(panNo)) {
            throw new DuplicateResourceException("A customer with this PAN number is already registered.");
        }
        if (customerRepository.existsByEmail(email)) {
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

        return CustomerMapper.toResponseDto(customerRepository.save(customer));
    }

    @Transactional(readOnly = true)
    public CustomerResponseDto getCustomerByAccount(Long accountNumber) {
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
