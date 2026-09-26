package com.bank.lms.controller;

import com.bank.lms.dto.LoginRequestDto;
import com.bank.lms.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
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
    private final SecurityContextRepository securityContextRepository;

    /** Forces the CSRF cookie to be written so the SPA can read it. */
    @GetMapping("/csrf")
    public Map<String, String> csrf(CsrfToken token) {
        return Map.of("headerName", token.getHeaderName(), "token", token.getToken());
    }

    @PostMapping("/login")
    @ResponseStatus(HttpStatus.OK)
    public LoginRequestDto.Identity login(@Valid @RequestBody LoginRequestDto request,
                                          HttpServletRequest httpRequest,
                                          HttpServletResponse httpResponse) {
        // Authenticate FIRST, then rotate. Session-fixation defence is only
        // meaningful once the privilege level has been established; rotating
        // beforehand would be protecting an anonymous session.
        //
        // The rotation also has to be explicit. Spring Security's default
        // SessionFixationProtectionStrategy only runs for authentication that
        // goes through the filter chain, and this one is programmatic via the
        // AuthenticationManager, so nothing else will rotate the id for us.
        LoginRequestDto.Identity identity = authService.authenticate(request);

        // Create the session first: changeSessionId() throws when the request has
        // no session yet, and SecurityContextHolderFilter defers persisting the
        // context until after this method returns, so none exists at this point.
        httpRequest.getSession(true);
        httpRequest.changeSessionId();

        // Persist the context to the (newly rotated) session ourselves rather
        // than leaving it to SecurityContextHolderFilter. That filter only saves
        // the context it loaded on the way *in*; because programmatic
        // authentication has no filter between us and the controller, the
        // authentication set here is never the one it persists, and the next
        // request arrives anonymous. Writing it explicitly — after the rotation,
        // so the new id is what gets stored — is the documented approach for
        // controller-level authentication.
        securityContextRepository.saveContext(
                SecurityContextHolder.getContext(), httpRequest, httpResponse);

        return identity;
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
