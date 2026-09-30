package com.bank.lms.dto;

import com.bank.lms.entity.AccountOpeningRequest;
import com.bank.lms.entity.AccountOpeningStatus;

/**
 * Whether the signed-in customer has a bank account, and if not, where their
 * most recent account-opening request got to.
 *
 * <p>This is what the loan application page asks before rendering anything. The
 * loan flow books against a customer account, so offering it to someone who has
 * no account would produce an application that cannot be recorded - the failure
 * would surface as an opaque 404 from the apply endpoint rather than as an
 * explanation.
 *
 * <p>It carries the customer's <em>latest</em> request rather than their
 * outstanding one, because the four states a customer can be in have to be
 * distinguishable from a single response:
 *
 * <table>
 *   <caption>The four states, as this record expresses them</caption>
 *   <tr><th>Where they are</th><th>{@code hasBankAccount}</th>
 *       <th>{@code accountOpeningRequest}</th></tr>
 *   <tr><td>Never applied</td><td>false</td><td>null</td></tr>
 *   <tr><td>Awaiting review</td><td>false</td><td>status PENDING</td></tr>
 *   <tr><td>Turned down</td><td>false</td><td>status REJECTED, with the reason</td></tr>
 *   <tr><td>Account open</td><td>true</td><td>null</td></tr>
 * </table>
 *
 * <p>Reporting only outstanding requests collapsed the middle two of the bottom
 * three into one: a rejected customer saw the same page as someone who had never
 * applied, and was offered a fresh form with no idea why the last one failed. The
 * rejection carries {@code reviewNotes} and {@code reviewedAt}, which is what
 * makes it explainable rather than merely detectable.
 *
 * <p>{@code accountNumber} is null whenever {@code hasBankAccount} is false. Both
 * are null rather than a sentinel, and the backend omits nulls from its JSON
 * entirely, so a client must test this record for presence rather than compare it
 * against null.
 *
 * <p>Deliberately no helper accessors. A record is serialised from its
 * accessors like any other bean, so a convenience method such as
 * {@code isAwaitingReview()} is not private detail - it is a field on the wire,
 * named after the method, appearing in every response. The one that was here
 * shipped as a stray {@code "awaitingReview": false} to every caller of this
 * endpoint. The three components are the contract; anything a caller wants to
 * derive from them is theirs to derive.
 */
public record AccountStatusDto(
        Long accountNumber,
        boolean hasBankAccount,
        AccountOpeningRequestDto.Response accountOpeningRequest) {

    /**
     * The case that needs no request: the customer already has an account.
     *
     * <p>The request that produced the account is not reported. Once the account
     * exists it is the answer to every question this endpoint is asked, and the
     * customer already has the number; an extra APPROVED row beside it would be
     * a second thing to render and could only disagree with the first.
     */
    public static AccountStatusDto withAccount(Long accountNumber) {
        return new AccountStatusDto(accountNumber, true, null);
    }

    /**
     * No account yet.
     *
     * @param request the customer's most recent request, or null if they have
     *                never applied. PENDING and REJECTED both arrive here - the
     *                difference is in {@code request.status()}, which is why this
     *                takes the row rather than deciding for the caller.
     */
    public static AccountStatusDto withoutAccount(AccountOpeningRequest request) {
        return new AccountStatusDto(null, false,
                request == null ? null : AccountOpeningMapper.toResponse(request));
    }
}
