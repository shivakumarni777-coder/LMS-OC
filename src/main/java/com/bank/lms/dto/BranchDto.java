package com.bank.lms.dto;

import com.bank.lms.entity.Branch;

/** A branch as offered in the registration form's dropdown. */
public record BranchDto(
        Integer branchCode,
        String branchName,
        String address) {

    public static BranchDto from(Branch branch) {
        return new BranchDto(branch.getBranchCode(), branch.getBranchName(), branch.getAddress());
    }
}
