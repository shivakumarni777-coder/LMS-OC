package com.bank.lms.repository;

import com.bank.lms.entity.AppUser;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface AppUserRepository extends JpaRepository<AppUser, Long> {

    Optional<AppUser> findByUsernameIgnoreCase(String username);

    boolean existsByUsernameIgnoreCase(String username);

    Optional<AppUser> findByAccountNumber(Long accountNumber);

    boolean existsByAccountNumber(Long accountNumber);

    /**
     * Reads a login and holds it against concurrent updates until the current
     * transaction ends.
     *
     * <p>Exists to serialise account-opening submissions for one customer. "At
     * most one PENDING request per customer" is a read followed by an insert, and
     * nothing in the schema enforces it - there is no migration tooling here to
     * add a partial unique index, and MySQL has no partial indexes. Locking the
     * customer's own login row is the row that every such submission has to
     * touch, so it is the natural serialisation point: the second request waits
     * for the first to commit, then re-reads and finds the PENDING row, and is
     * refused as a conflict.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from AppUser u where u.userId = :userId")
    Optional<AppUser> findByIdForUpdate(@Param("userId") Long userId);
}
