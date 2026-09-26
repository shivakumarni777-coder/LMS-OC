package com.bank.lms.security;

import com.bank.lms.entity.AppUser;
import com.bank.lms.repository.AppUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Loads logins for Spring Security.
 *
 * <p>Throws an identical error for an unknown username, a disabled account and
 * a wrong password, so responses cannot be used to enumerate valid usernames.
 */
@Service
@RequiredArgsConstructor
public class AppUserDetailsService implements UserDetailsService {

    static final String BAD_CREDENTIALS = "Invalid username or password.";

    private final AppUserRepository appUserRepository;

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        return appUserRepository.findByUsernameIgnoreCase(username)
                .filter(AppUser::isEnabled)
                .map(AuthenticatedUser::new)
                .orElseThrow(() -> new UsernameNotFoundException(BAD_CREDENTIALS));
    }
}
