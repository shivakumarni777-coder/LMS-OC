package com.bank.lms.dto;

import com.bank.lms.entity.Customer;

/** Customer projections safe to return to clients. */
public final class CustomerMapper {

    private CustomerMapper() {
    }

    /**
     * Maps a {@link Customer} to its wire representation, omitting PAN and date
     * of birth on purpose - KYC identifiers must not be echoed back.
     */
    public static CustomerResponseDto toResponseDto(Customer customer) {
        return new CustomerResponseDto(
                customer.getAccountNumber(),
                customer.getFullName(),
                customer.getEmail(),
                customer.getPhoneNo(),
                customer.getBranchCode());
    }
}
