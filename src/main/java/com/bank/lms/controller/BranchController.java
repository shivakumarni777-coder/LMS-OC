package com.bank.lms.controller;

import com.bank.lms.dto.BranchDto;
import com.bank.lms.repository.BranchRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Branch reference data.
 *
 * <p>Public because the registration form needs it, and registration is the one
 * thing a visitor can do before they have an account.
 */
@RestController
@RequestMapping("/api/branches")
@RequiredArgsConstructor
public class BranchController {

    private final BranchRepository branchRepository;

    @GetMapping
    public List<BranchDto> list() {
        return branchRepository.findAllByOrderByBranchNameAsc().stream()
                .map(BranchDto::from)
                .toList();
    }
}
