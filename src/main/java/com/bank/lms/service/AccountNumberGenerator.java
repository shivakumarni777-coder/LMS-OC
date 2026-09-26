package com.bank.lms.service;

import com.bank.lms.entity.Customer;
import com.bank.lms.repository.CustomerRepository;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.random.RandomGenerator;

/**
 * Generates 12-digit customer account numbers.
 *
 * <p>The original implementation was {@code "3040" + System.currentTimeMillis()}
 * truncated to 12 characters. That is not random: it makes account numbers
 * sequential and trivially enumerable, and two registrations inside the same
 * millisecond collide. This keeps the {@code 3040} prefix but fills the
 * remaining digits from a {@link SecureRandom} source, retrying on the (rare)
 * collision because {@code account_number} is uniquely indexed.
 */
@Component
public class AccountNumberGenerator {

    static final String PREFIX = "3040";
    static final int LENGTH = 12;
    private static final int MAX_ATTEMPTS = 10;

    private final RandomGenerator random = new SecureRandom();
    private final CustomerRepository customerRepository;

    public AccountNumberGenerator(CustomerRepository customerRepository) {
        this.customerRepository = customerRepository;
    }

    public Long nextAvailableAccountNumber() {
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            long candidate = randomAccountNumber();
            if (!customerRepository.existsByAccountNumber(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException(
                "Could not allocate a unique account number after " + MAX_ATTEMPTS + " attempts.");
    }

    private long randomAccountNumber() {
        long suffix = Long.parseLong(PREFIX) * 100_000_000L
                + (long) (random.nextDouble() * 100_000_000L);
        return suffix;
    }
}
