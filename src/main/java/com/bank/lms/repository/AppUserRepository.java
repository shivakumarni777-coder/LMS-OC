package com.bank.lms.repository;

import com.bank.lms.entity.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface AppUserRepository extends JpaRepository<AppUser, Long> {

    Optional<AppUser> findByUsernameIgnoreCase(String username);

    boolean existsByUsernameIgnoreCase(String username);

    Optional<AppUser> findByAccountNumber(Long accountNumber);

    boolean existsByAccountNumber(Long accountNumber);
}
