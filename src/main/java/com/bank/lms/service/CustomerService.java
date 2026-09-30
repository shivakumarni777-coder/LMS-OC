package com.bank.lms.service;

import com.bank.lms.dto.CustomerMapper;
import com.bank.lms.dto.CustomerProfileDto;
import com.bank.lms.dto.CustomerProfileRegistrationDto;
import com.bank.lms.dto.CustomerResponseDto;
import com.bank.lms.entity.AppRole;
import com.bank.lms.entity.AppUser;
import com.bank.lms.entity.Customer;
import com.bank.lms.exception.DuplicateResourceException;
import com.bank.lms.exception.InvalidRequestException;
import com.bank.lms.exception.ResourceNotFoundException;
import com.bank.lms.repository.AppUserRepository;
import com.bank.lms.repository.CustomerRepository;
import com.bank.lms.security.AuthenticatedUser;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Locale;

/**
 * Customer profiles and the bank accounts behind them.
 *
 * <p>Registration and account opening are deliberately separate operations.
 * Registering creates a login and the profile behind it, and nothing else. The
 * bank account is created later, by {@link #openAccountForExistingUser}, once an
 * officer has approved an account-opening request. That split is what lets a
 * person sign in, see that they have no account, and ask for one - a state that
 * cannot exist at all if both happen in a single step.
 *
 * <p>Everything the account needs beyond the PAN comes off the profile, so
 * approving a request cannot produce a customer whose details disagree with the
 * ones they registered.
 */
@Service
@RequiredArgsConstructor
public class CustomerService {

    private final CustomerRepository customerRepository;
    private final AppUserRepository appUserRepository;
    private final AccountNumberGenerator accountNumberGenerator;
    private final PasswordEncoder passwordEncoder;

    /**
     * Registers a customer's login and profile.
     *
     * <p>Creates no {@link Customer} row and allocates no account number: the
     * account is opened later, through an account-opening request. The email
     * doubles as the login, so registration cannot leave someone unable to sign
     * in.
     */
    @Transactional
    public CustomerProfileRegistrationDto.Result registerCustomerProfile(
            CustomerProfileRegistrationDto registration) {

        CustomerProfileDto profile = registration.profile();
        String email = normaliseEmail(profile.email());

        if (customerRepository.existsByEmail(email) || appUserRepository.existsByUsernameIgnoreCase(email)) {
            throw new DuplicateResourceException("A customer with this email address is already registered.");
        }

        appUserRepository.save(AppUser.builder()
                .username(email)
                .passwordHash(passwordEncoder.encode(registration.password()))
                .role(AppRole.CUSTOMER)
                // Deliberately null. A loan is booked against an account, and this
                // login has none yet; setting a number here would create a customer
                // record that no request, no KYC check and no approval ever saw.
                .accountNumber(null)
                .fullName(profile.fullName().trim())
                .dob(profile.dob())
                .phoneNo(profile.phoneNo().trim())
                .branchCode(profile.branchCode())
                .enabled(true)
                .createdAt(Instant.now())
                .build());

        return new CustomerProfileRegistrationDto.Result(
                email, profile.fullName().trim(), email, null);
    }

    /**
     * Opens a bank account for a login that has a profile but no account.
     *
     * <p>The single place a {@link Customer} row is built. Every field except the
     * PAN comes from the profile the customer registered, so a customer record
     * cannot disagree with the login behind it.
     *
     * <p>Also links the account number back onto the login. The caller is
     * responsible for marking the request approved; this method only guarantees
     * that the account and the login end up pointing at each other.
     *
     * @throws InvalidRequestException  if the login already has an account, or
     *                                  its profile is missing a field the
     *                                  customer record requires
     * @throws DuplicateResourceException if the PAN, or the email, already belongs
     *                                  to another customer
     */
    @Transactional
    public Customer openAccountForExistingUser(AppUser user, String panNo) {
        if (user.getAccountNumber() != null) {
            throw new InvalidRequestException(
                    "This login already has an account: " + user.getAccountNumber());
        }
        requireProfile(user);

        String pan = normalisePan(panNo);
        String email = normaliseEmail(user.getUsername());

        if (customerRepository.existsByPanNo(pan)) {
            throw new DuplicateResourceException(
                    "A customer with this PAN number is already registered.");
        }
        if (customerRepository.existsByEmail(email)) {
            throw new DuplicateResourceException(
                    "A customer with this email address is already registered.");
        }

        Long accountNumber = accountNumberGenerator.nextAvailableAccountNumber();

        Customer customer = Customer.builder()
                .accountNumber(accountNumber)
                .panNo(pan)
                .fullName(user.getFullName().trim())
                .phoneNo(user.getPhoneNo().trim())
                .dob(user.getDob())
                .email(email)
                .branchCode(user.getBranchCode())
                .build();

        Customer saved = customerRepository.save(customer);

        user.setAccountNumber(saved.getAccountNumber());
        appUserRepository.save(user);

        return saved;
    }

    /**
     * Rejects a login whose profile cannot produce a valid customer record.
     *
     * <p>Checked before the insert rather than left to a constraint violation, so
     * the officer is told which field is missing instead of receiving a 500. In
     * practice this is unreachable, because the only way to get here is a
     * customer login and the only way to get one of those is the registration
     * form, which requires all three - but an officer-created or hand-edited row
     * is exactly the case where a null would otherwise surface as a database
     * error nobody can act on.
     */
    private static void requireProfile(AppUser user) {
        StringBuilder missing = new StringBuilder();
        appendMissing(missing, user.getFullName(), "name");
        appendMissing(missing, user.getDob(), "date of birth");
        appendMissing(missing, user.getPhoneNo(), "phone number");
        appendMissing(missing, user.getBranchCode(), "branch");

        if (!missing.isEmpty()) {
            throw new InvalidRequestException(
                    "This login's profile is incomplete, so an account cannot be opened for it. "
                            + "Missing: " + missing + ".");
        }
    }

    private static void appendMissing(StringBuilder missing, Object value, String label) {
        if (value != null && !(value instanceof String text && text.isBlank())) {
            return;
        }
        if (!missing.isEmpty()) {
            missing.append(", ");
        }
        missing.append(label);
    }

    @Transactional(readOnly = true)
    public CustomerResponseDto getCustomerByAccount(Long accountNumber, AuthenticatedUser caller) {
        if (caller == null) {
            throw new ResourceNotFoundException("Customer not found with account number: " + accountNumber);
        }
        if (!caller.canAccess(accountNumber)) {
            // Deliberately 404 rather than 403: confirming the account exists
            // would let a customer probe for other people's account numbers.
            throw new ResourceNotFoundException("Customer not found with account number: " + accountNumber);
        }

        return customerRepository.findByAccountNumber(accountNumber)
                .map(CustomerMapper::toResponseDto)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Customer not found with account number: " + accountNumber));
    }

    static String normalisePan(String panNo) {
        return panNo.trim().toUpperCase(Locale.ROOT);
    }

    static String normaliseEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
