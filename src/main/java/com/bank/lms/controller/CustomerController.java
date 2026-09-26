package com.bank.lms.controller;

import com.bank.lms.dto.CustomerEnquiryDto;
import com.bank.lms.dto.CustomerResponseDto;
import com.bank.lms.service.CustomerService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/customers")
@RequiredArgsConstructor
public class CustomerController {

    private final CustomerService customerService;

    /**
     * Registers a customer.
     *
     * <p>Returns the new customer projection - including the generated account
     * number - instead of the previous plain-text string.
     */
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public CustomerResponseDto registerCustomer(@Valid @RequestBody CustomerEnquiryDto enquiry) {
        return customerService.registerCustomer(enquiry);
    }

    @GetMapping("/{accountNumber}")
    public CustomerResponseDto getCustomer(@PathVariable Long accountNumber) {
        return customerService.getCustomerByAccount(accountNumber);
    }
}
