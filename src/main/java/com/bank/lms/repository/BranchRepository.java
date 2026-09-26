package com.bank.lms.repository;

import com.bank.lms.entity.Branch;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BranchRepository extends JpaRepository<Branch, Integer> {

    /** Ordered for display so the form never has to sort client-side. */
    List<Branch> findAllByOrderByBranchNameAsc();
}
