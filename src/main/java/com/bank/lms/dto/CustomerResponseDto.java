package com.bank.lms.dto;

import lombok.Data;

@Data
public class CustomerResponseDto {
    private String fullName;
    private Long accountNumber;
    private String email;
    private String phoneNo;
    private Integer branchCode;
}