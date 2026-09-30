package com.bank.lms.controller;

import com.bank.lms.dto.CustomerProfileRegistrationDto;
import com.bank.lms.dto.CustomerResponseDto;
import com.bank.lms.dto.LoanResponseDto;
import com.bank.lms.security.AuthenticatedUser;
import com.bank.lms.service.CustomerService;
import com.bank.lms.service.LoanService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/customers")
@RequiredArgsConstructor
public class CustomerController {

    private final CustomerService customerService;
    private final LoanService loanService;

    /**
     * Registers a customer's login and profile.
     *
     * <p>Creates no bank account. The account is opened separately, through an
     * account-opening request, so that signing in without one is a state the user
     * can see and act on rather than something that cannot occur. The response
     * therefore carries the sign-in username and the account number as null.
     */
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public CustomerProfileRegistrationDto.Result registerCustomer(
            @Valid @RequestBody CustomerProfileRegistrationDto registration) {
        return customerService.registerCustomerProfile(registration);
    }

    /** Restricted to the owning customer, or any admin. */
    @GetMapping("/{accountNumber}")
    public CustomerResponseDto getCustomer(
            @PathVariable Long accountNumber,
            @AuthenticationPrincipal AuthenticatedUser caller) {
        return customerService.getCustomerByAccount(accountNumber, caller);
    }

    /** A customer's loan portfolio. Owner or admin. */
    @GetMapping("/{accountNumber}/loans")
    public List<LoanResponseDto> listLoans(
            @PathVariable Long accountNumber,
            @AuthenticationPrincipal AuthenticatedUser caller) {
        return loanService.listLoansForCustomer(accountNumber, caller);
    }
}
