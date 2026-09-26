package com.bank.lms.config;

import com.bank.lms.entity.AppRole;
import com.bank.lms.entity.AppUser;
import com.bank.lms.repository.AppUserRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates the bootstrap administrator on first run.
 *
 * <p>Without this there would be no way to reach the approve endpoint, which is
 * admin-only, and no way to create the first customer login.
 *
 * <p>Refuses to start when enabled without a password rather than falling back
 * to a guessable default: a hard-coded bootstrap credential is the classic way
 * a demo system reaches production.
 */
@Slf4j
@Component
public class BootstrapAdminInitializer implements ApplicationRunner {

    private static final int MIN_PASSWORD_LENGTH = 12;

    private final AppUserRepository appUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final boolean enabled;
    private final String username;
    private final String password;

    public BootstrapAdminInitializer(
            AppUserRepository appUserRepository,
            PasswordEncoder passwordEncoder,
            @Value("${app.bootstrap-admin.enabled:true}") boolean enabled,
            @Value("${app.bootstrap-admin.username:admin}") String username,
            @Value("${app.bootstrap-admin.password:}") String password) {
        this.appUserRepository = appUserRepository;
        this.passwordEncoder = passwordEncoder;
        this.enabled = enabled;
        this.username = username;
        this.password = password;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!enabled) {
            log.info("Bootstrap admin creation is disabled.");
            return;
        }
        if (appUserRepository.existsByUsernameIgnoreCase(username)) {
            log.info("Bootstrap admin '{}' already exists, leaving it untouched.", username);
            return;
        }
        if (password == null || password.isBlank()) {
            throw new IllegalStateException(
                    "BOOTSTRAP_ADMIN_PASSWORD must be set to create the initial admin account. "
                            + "Set it in .env, or set BOOTSTRAP_ADMIN_ENABLED=false to skip.");
        }
        if (password.length() < MIN_PASSWORD_LENGTH) {
            throw new IllegalStateException(
                    "BOOTSTRAP_ADMIN_PASSWORD must be at least " + MIN_PASSWORD_LENGTH + " characters.");
        }

        appUserRepository.save(AppUser.builder()
                .username(username)
                .passwordHash(passwordEncoder.encode(password))
                .role(AppRole.ADMIN)
                .fullName("Bootstrap Administrator")
                .enabled(true)
                .build());

        log.info("Created bootstrap admin '{}'. Change this password immediately.", username);
    }
}
