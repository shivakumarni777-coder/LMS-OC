package com.bank.lms.repository;

import com.bank.lms.entity.LoanDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface LoanDocumentRepository extends JpaRepository<LoanDocument, Long> {

    List<LoanDocument> findByLoanIdOrderByUploadedAtAsc(Long loanId);

    void deleteByLoanId(Long loanId);
}
