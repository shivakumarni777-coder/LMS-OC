package com.bank.lms.dto;

/**
 * Customer projection safe to return to clients.
 *
 * <p>{@code panNo} and {@code dob} are intentionally absent - KYC identifiers
 * must not be echoed back over the wire.
 */
public record CustomerResponseDto(
        Long accountNumber,
        String fullName,
        String email,
        String phoneNo,
        Integer branchCode) {
}
