package com.bank.lms.repository;

import com.bank.lms.entity.Customer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface CustomerRepository extends JpaRepository<Customer, Integer> {
    // Custom query method: Spring automatically translates this to "SELECT * FROM customer WHERE pan_no = ?"
    Optional<Customer> findByPanNo(String panNo);
    Optional<Customer> findByAccountNumber(Long accountNumber);
    Optional<Customer> findByEmail(String email);

    boolean existsByPanNo(String panNo);

    boolean existsByEmail(String email);

    boolean existsByAccountNumber(Long accountNumber);
}