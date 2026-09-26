package com.bank.lms.repository;

import com.bank.lms.entity.LoanApplication;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface LoanApplicationRepository extends JpaRepository<LoanApplication, Integer> {
    List<LoanApplication> findByCifNo(Integer cifNo);
    List<LoanApplication> findByCurrentStatus(String status);
}