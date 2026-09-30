package com.bank.lms.controller;

import com.bank.lms.dto.LoanResponseDto;
import com.bank.lms.service.LoanService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The officer's side of the loan workflow.
 *
 * <p>Kept apart from {@link LoanController} so that "things an officer does" and
 * "things a customer does" do not share a class. The whole {@code /api/admin}
 * prefix is restricted to administrators in one place in the security
 * configuration, so an endpoint added here is admin-only by default rather than
 * by remembering to annotate it.
 *
 * <p>Approval itself stays on {@code PUT /api/loans/{loanId}/approve}. It was
 * already a working endpoint and changing its path would break any client using
 * it for no gain; the review queue is new, so it gets the admin prefix.
 */
@RestController
@RequestMapping("/api/admin/loans")
@RequiredArgsConstructor
public class AdminLoanController {

    private final LoanService loanService;

    /** Applications still awaiting a decision, oldest first. */
    @GetMapping("/pending")
    public List<LoanResponseDto> listPendingForReview() {
        return loanService.listPendingForReview();
    }
}
