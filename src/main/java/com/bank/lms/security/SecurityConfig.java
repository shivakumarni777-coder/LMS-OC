package com.bank.lms.security;

import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.DelegatingSecurityContextRepository;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Session-based security.
 *
 * <p>The browser only ever receives an opaque session id in an httpOnly,
 * SameSite=Strict cookie; the authentication state lives server-side. There is
 * no token in JavaScript's reach, so a cross-site scripting bug cannot
 * exfiltrate a credential the way it could with a JWT in localStorage.
 *
 * <p>Because the session rides on a cookie, CSRF protection is mandatory and is
 * enabled. The token is published as a readable {@code XSRF-TOKEN} cookie and
 * echoed back in the {@code X-XSRF-TOKEN} header. That deliberately uses the
 * plain (non-XOR) handler rather than Spring's default BREACH-hardened one,
 * which is the standard arrangement for a JSON API; the token is not a secret
 * that needs masking, and the attack it defends against does not apply to a
 * non-HTML response.
 */
@Configuration
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(
            HttpSecurity http,
            AppUserDetailsService userDetailsService,
            RestAuthenticationHandlers authenticationHandlers) throws Exception {

        CookieCsrfTokenRepository csrfTokenRepository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrfTokenRepository.setCookiePath("/");

        CsrfTokenRequestAttributeHandler csrfRequestHandler = new CsrfTokenRequestAttributeHandler();
        // Opt out of deferred token loading so the cookie is written on the
        // first GET, letting the SPA read it before its first mutating request.
        csrfRequestHandler.setCsrfRequestAttributeName(null);

        return http
                .csrf(csrf -> csrf
                        .csrfTokenRepository(csrfTokenRepository)
                        .csrfTokenRequestHandler(csrfRequestHandler))
                .securityContext(context -> context
                        .securityContextRepository(securityContextRepository()))
                .cors(cors -> { })
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                        .sessionFixation(fixation -> fixation.changeSessionId()))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(
                                "/api/auth/login",
                                "/api/auth/csrf",
                                "/api/branches",
                                "/api/customers/register",
                                "/error",
                                "/actuator/health")
                        .permitAll()
                        .requestMatchers("/api/loans/*/approve").hasRole("ADMIN")
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(authenticationHandlers)
                        .accessDeniedHandler(authenticationHandlers))
                .userDetailsService(userDetailsService)
                .logout(logout -> logout
                        .logoutUrl("/api/auth/logout")
                        .deleteCookies("JSESSIONID", "LMS_SESSION")
                        .invalidateHttpSession(true)
                        .clearAuthentication(true))
                .headers(headers -> headers
                        .frameOptions(frame -> frame.deny())
                        .contentTypeOptions(contentType -> { }))
                .build();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception {
        return configuration.getAuthenticationManager();
    }

    /**
     * Where the {@code SecurityContext} is stored between requests.
     *
     * <p>Declaring it as a bean gives {@link AuthController} the very same
     * instance the filter chain uses, so programmatic login and filter-driven
     * requests cannot end up writing to two different places.
     *
     * <p>The delegating pair matches the framework default: the request attribute
     * lets a single request reuse the context it already loaded (cheap, and
     * visible to the rest of the request), and the session is what makes the
     * login survive to the next one.
     */
    @Bean
    public SecurityContextRepository securityContextRepository() {
        return new DelegatingSecurityContextRepository(
                new RequestAttributeSecurityContextRepository(),
                new HttpSessionSecurityContextRepository());
    }

    /**
     * Delegating encoder so hashes are stored with an algorithm prefix
     * ({@code {bcrypt}...}), which leaves room to migrate to a stronger
     * algorithm later without invalidating existing hashes.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }
}
