package com.bank.lms.controller;

import com.bank.lms.dto.LoanApprovalDto;
import com.bank.lms.dto.LoanRequestDto;
import com.bank.lms.dto.LoanResponseDto;
import com.bank.lms.service.LoanService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
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

    @PostMapping("/apply")
    @ResponseStatus(HttpStatus.CREATED)
    public LoanResponseDto applyForLoan(@Valid @RequestBody LoanRequestDto request) {
        return loanService.applyForLoan(request);
    }

    @PutMapping("/{loanId}/approve")
    public LoanResponseDto approveLoan(
            @PathVariable Long loanId, @Valid @RequestBody LoanApprovalDto approval) {
        return loanService.approveLoan(loanId, approval);
    }
}
