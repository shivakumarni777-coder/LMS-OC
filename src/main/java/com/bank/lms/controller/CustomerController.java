package com.bank.lms.controller;

import com.bank.lms.dto.CustomerEnquiryDto;
import com.bank.lms.service.CustomerService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.bank.lms.dto.CustomerResponseDto;

@RestController
@RequestMapping("/api/customers")
@RequiredArgsConstructor
public class CustomerController {

    private final CustomerService customerService;

    @PostMapping("/register")
    public ResponseEntity<String> registerNewCustomer(@Valid @RequestBody CustomerEnquiryDto enquiryDto) {
        String responseMessage = customerService.registerCustomer(enquiryDto);
        return new ResponseEntity<>(responseMessage, HttpStatus.CREATED);
    }
    @GetMapping("/{accountNumber}")
    public ResponseEntity<CustomerResponseDto> getCustomer(@PathVariable Long accountNumber) {
        CustomerResponseDto response = customerService.getCustomerByAccount(accountNumber);
        return ResponseEntity.ok(response); // Returns a 200 OK with the JSON data
    }
}