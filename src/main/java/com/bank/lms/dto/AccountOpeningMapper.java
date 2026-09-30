package com.bank.lms.dto;

import com.bank.lms.entity.AccountOpeningRequest;
import com.bank.lms.entity.AppUser;

/**
 * Projections for account-opening requests.
 *
 * <p>The split is deliberate: {@link AccountOpeningRequestDto.Response} masks the
 * PAN because the subject is the customer, and
 * {@link AccountOpeningRequestDto.AdminResponse} does not because the subject is
 * an officer deciding on an application. A single projection serving both would
 * have to either leak the PAN to the customer or hide it from the officer.
 */
public final class AccountOpeningMapper {

    private AccountOpeningMapper() {
    }

    public static AccountOpeningRequestDto.Response toResponse(AccountOpeningRequest request) {
        return new AccountOpeningRequestDto.Response(
                request.getRequestId(),
                request.getStatus(),
                maskPan(request.getPanNo()),
                request.getRequestedAt(),
                request.getReviewedAt(),
                request.getReviewNotes(),
                request.getResultingAccountNumber());
    }

    /**
     * The officer's view, built by pairing the request with the profile it will
     * be turned into.
     */
    public static AccountOpeningRequestDto.AdminResponse toAdminResponse(
            AccountOpeningRequest request, AppUser profile) {
        return new AccountOpeningRequestDto.AdminResponse(
                request.getRequestId(),
                request.getStatus(),
                request.getPanNo(),
                profile.getFullName(),
                profile.getUsername(),
                profile.getPhoneNo(),
                profile.getDob(),
                profile.getBranchCode(),
                request.getRequestedAt(),
                request.getReviewedAt(),
                request.getReviewNotes(),
                request.getResultingAccountNumber());
    }

    /**
     * {@code ABCDE1234F} becomes {@code XXXXX1234X}: enough for someone to
     * recognise which PAN they submitted, not enough to be usable anywhere.
     *
     * <p>The trailing letter is masked too. Five leading characters is a
     * meaningful slice of a PAN - the first letters identify the issuing
     * registry - and leaving the check character in the clear would let the
     * masked form be validated against the real one.
     */
    static String maskPan(String panNo) {
        if (panNo == null || panNo.length() != 10) {
            return panNo;
        }
        return "XXXXX" + panNo.substring(5, 9) + "X";
    }
}
