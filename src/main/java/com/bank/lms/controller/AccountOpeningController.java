package com.bank.lms.controller;

import com.bank.lms.dto.AccountOpeningRequestDto;
import com.bank.lms.dto.AccountStatusDto;
import com.bank.lms.entity.AccountOpeningStatus;
import com.bank.lms.security.AuthenticatedUser;
import com.bank.lms.service.AccountOpeningService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Account opening, from the customer's side and from the officer's.
 *
 * <p>Customer endpoints are always scoped to the caller, never to a path
 * parameter: a request is about whoever is asking, so there is no identifier for
 * a caller to swap in order to read or file someone else's. The admin endpoints
 * sit under {@code /api/admin/}, which the security filter chain restricts to
 * administrators.
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class AccountOpeningController {

    private final AccountOpeningService accountOpeningService;

    /**
     * Whether the caller has a bank account, and where their request stands.
     *
     * <p>The loan application page calls this before it renders, so an applicant
     * without an account is offered the account-opening flow instead of a loan
     * form that could not be recorded.
     */
    @GetMapping("/account/status")
    public AccountStatusDto status(@AuthenticationPrincipal AuthenticatedUser caller) {
        return accountOpeningService.statusFor(caller);
    }

    /**
     * The caller's own outstanding request. Null when they have not applied.
     *
     * <p>Narrower than {@link #status()} on purpose, and not interchangeable with
     * it. This one answers "is one of mine still with an officer?" and is
     * PENDING-only, so a customer who was rejected is told they have nothing
     * outstanding and is free to apply again. {@code /api/account/status} answers
     * the broader "where have I got to?" and does report a rejection. Both were
     * PENDING-only at one point, which is what made a rejected customer
     * indistinguishable from one who had never applied.
     */
    @GetMapping("/accounts/requests/me")
    public AccountOpeningRequestDto.Response mine(
            @AuthenticationPrincipal AuthenticatedUser caller) {
        return accountOpeningService.currentFor(caller);
    }

    @PostMapping("/accounts/requests")
    @ResponseStatus(HttpStatus.CREATED)
    public AccountOpeningRequestDto.Response submit(
            @Valid @RequestBody AccountOpeningRequestDto.Request request,
            @AuthenticationPrincipal AuthenticatedUser caller) {
        return accountOpeningService.submit(caller, request.panNo());
    }

    // ------------------------------------------------------------------- admin

    /** The review queue. Filter by status; the default is the whole list. */
    @GetMapping("/admin/accounts/requests")
    public List<AccountOpeningRequestDto.AdminResponse> listForReview(
            @RequestParam(required = false) AccountOpeningStatus status) {
        return accountOpeningService.listForReview(status);
    }

    @GetMapping("/admin/accounts/requests/{requestId}")
    public AccountOpeningRequestDto.AdminResponse getForReview(
            @PathVariable Long requestId) {
        return accountOpeningService.getForReview(requestId);
    }

    @PutMapping("/admin/accounts/requests/{requestId}")
    public AccountOpeningRequestDto.AdminResponse review(
            @PathVariable Long requestId,
            @Valid @RequestBody AccountOpeningRequestDto.Decision decision,
            @AuthenticationPrincipal AuthenticatedUser reviewer) {
        return accountOpeningService.review(requestId, decision, reviewer);
    }
}
