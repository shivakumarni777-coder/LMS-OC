package com.bank.lms.controller;

import com.bank.lms.dto.LoginRequestDto;
import com.bank.lms.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import com.bank.lms.security.AuthenticatedUser;

import java.util.Map;

/**
 * Session lifecycle.
 *
 * <p>Login is a CSRF-protected mutating request like any other; the SPA calls
 * {@code GET /api/auth/csrf} first to obtain the token cookie.
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    /** Forces the CSRF cookie to be written so the SPA can read it. */
    @GetMapping("/csrf")
    public Map<String, String> csrf(CsrfToken token) {
        return Map.of("headerName", token.getHeaderName(), "token", token.getToken());
    }

    @PostMapping("/login")
    @ResponseStatus(HttpStatus.OK)
    public LoginRequestDto.Identity login(@Valid @RequestBody LoginRequestDto request,
                                          HttpServletRequest httpRequest) {
        // Rotate the session id on privilege change to defeat session fixation.
        httpRequest.changeSessionId();
        return authService.authenticate(request);
    }

    @GetMapping("/me")
    public LoginRequestDto.Identity me(@AuthenticationPrincipal AuthenticatedUser principal) {
        return authService.currentIdentity();
    }

    /** Logout is handled by Spring Security's logout filter at this URL. */
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout() {
        // Intentionally empty: the filter chain invalidates the session before
        // this method is reached, so declaring it only documents the endpoint.
    }
}
