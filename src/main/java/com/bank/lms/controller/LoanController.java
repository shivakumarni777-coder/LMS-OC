package com.bank.lms.controller;

import com.bank.lms.dto.LoanApprovalDto;
import com.bank.lms.dto.LoanRequestDto;
import com.bank.lms.dto.LoanResponseDto;
import com.bank.lms.security.AuthenticatedUser;
import com.bank.lms.service.LoanService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/loans")
@RequiredArgsConstructor
public class LoanController {

    private final LoanService loanService;

    /** A customer may only apply against their own account. */
    @PostMapping("/apply")
    @ResponseStatus(HttpStatus.CREATED)
    public LoanResponseDto applyForLoan(
            @Valid @RequestBody LoanRequestDto request,
            @AuthenticationPrincipal AuthenticatedUser caller) {
        return loanService.applyForLoan(request, caller);
    }

    /** Admin only; enforced by the filter chain, not by this class. */
    @PutMapping("/{loanId}/approve")
    public LoanResponseDto approveLoan(
            @PathVariable Long loanId, @Valid @RequestBody LoanApprovalDto approval) {
        return loanService.approveLoan(loanId, approval);
    }
}
