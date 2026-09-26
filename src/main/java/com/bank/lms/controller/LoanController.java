package com.bank.lms.controller;

import com.bank.lms.dto.LoanApprovalDto;
import com.bank.lms.dto.LoanRequestDto;
import com.bank.lms.dto.LoanResponseDto;
import com.bank.lms.service.LoanService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/loans")
public class LoanController {

    // This is the variable your new method was failing to find
    private final LoanService loanService;

    // Constructor Injection (Best practice for Spring Boot)
    public LoanController(LoanService loanService) {
        this.loanService = loanService;
    }

    @PostMapping("/apply")
    public ResponseEntity<LoanResponseDto> applyForLoan(@RequestBody LoanRequestDto requestDto) {
        LoanResponseDto response = loanService.applyForLoan(requestDto);
        return new ResponseEntity<>(response, HttpStatus.CREATED);
    }

    @PutMapping("/{loanId}/approve")
    public ResponseEntity<LoanResponseDto> approveLoan(@PathVariable Long loanId, @RequestBody LoanApprovalDto approvalDto) {
        LoanResponseDto response = loanService.approveLoan(loanId, approvalDto);
        return ResponseEntity.ok(response);
    }
}