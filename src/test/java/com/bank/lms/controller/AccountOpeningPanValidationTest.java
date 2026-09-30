package com.bank.lms.controller;

import com.bank.lms.dto.AccountOpeningRequestDto;
import com.bank.lms.entity.AccountOpeningStatus;
import com.bank.lms.entity.AppRole;
import com.bank.lms.entity.AppUser;
import com.bank.lms.exception.GlobalExceptionHandler;
import com.bank.lms.security.AuthenticatedUser;
import com.bank.lms.service.AccountOpeningService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.time.Instant;
import java.time.LocalDate;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * PAN validation as the HTTP layer actually sees it.
 *
 * <p>Exists because the service and the bean validation disagreed about the same
 * string. {@code CustomerService.normalisePan} upper-cases a lower-case PAN, and
 * has a passing unit test proving it stores {@code ABCDE1234F} - but that test
 * calls the service directly, so it never runs the validator. The
 * {@code @Pattern} on the request DTO was upper-case-only, and validation happens
 * first, so a customer who typed their PAN on a lower-case keyboard was turned
 * away at the boundary and the service's tolerance was unreachable in production.
 *
 * <p>A unit test could not have caught it, and neither could a passing test of
 * either half. Only the seam does: the pattern, the service and the JSON
 * deserialiser all have to agree, and the one that ran first decided the answer.
 * So the tests here are about what reaches the service, not about what the
 * service then does with it.
 *
 * <p>Standalone MockMvc, matching {@link CustomerRegistrationWebTest}: it skips
 * the security filter chain, and there is no {@code spring-security-test} to
 * satisfy CSRF with. That is acceptable here because the rule under test is
 * {@code @Pattern}, which runs before the filter chain would matter. A session
 * carrying a principal is attached only so the controller's
 * {@code @AuthenticationPrincipal} is not null; nothing here depends on who they
 * are, and {@link com.bank.lms.security.AccountStatusAccessTest} covers who may
 * call this at all.
 */
class AccountOpeningPanValidationTest {

    private final AccountOpeningService accountOpeningService = mock(AccountOpeningService.class);

    private MockMvc mockMvc;

    private void setUpMockMvc() {
        // Left unset, standalone MockMvc skips validation entirely and the
        // rejected-PAN tests would pass for the wrong reason. No explicit
        // provider: the no-arg form resolves whichever Jakarta implementation is
        // on the test classpath.
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();

        mockMvc = MockMvcBuilders.standaloneSetup(
                        new AccountOpeningController(accountOpeningService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .setValidator(validator)
                // Spring Security's own resolver for this annotation ships in
                // spring-security-test, which is not a dependency here. Without
                // something in its place the annotation is simply not understood,
                // the parameter falls through to the model-attribute processor,
                // that processor cannot construct an AuthenticatedUser (it has no
                // no-arg constructor), and the failure surfaces as a 500 from the
                // handler's catch-all - on every request, including the ones whose
                // validation never even ran.
                .setCustomArgumentResolvers(authenticationPrincipalResolver())
                .build();
    }

    /**
     * Resolves {@code @AuthenticationPrincipal AuthenticatedUser} to one fixed
     * customer, the way the filter chain would.
     *
     * <p>Which caller it is deliberately irrelevant here: the rule under test is
     * the {@code @Pattern}, which runs before the controller method is entered.
     * {@link com.bank.lms.security.AccountStatusAccessTest} covers who is allowed
     * to call this at all, against the real filter chain.
     */
    private static HandlerMethodArgumentResolver authenticationPrincipalResolver() {
        return new HandlerMethodArgumentResolver() {
            @Override
            public boolean supportsParameter(MethodParameter parameter) {
                return parameter.hasParameterAnnotation(AuthenticationPrincipal.class)
                        && AuthenticatedUser.class.isAssignableFrom(parameter.getParameterType());
            }

            @Override
            public Object resolveArgument(MethodParameter parameter,
                                          ModelAndViewContainer mavContainer,
                                          NativeWebRequest webRequest,
                                          WebDataBinderFactory binderFactory) {
                return new AuthenticatedUser(AppUser.builder()
                        .userId(7L)
                        .username("asha.rao@example.com")
                        .role(AppRole.CUSTOMER)
                        .fullName("Asha Rao")
                        .dob(LocalDate.of(1994, 3, 21))
                        .phoneNo("9876543210")
                        .branchCode(101)
                        .enabled(true)
                        .build());
            }
        };
    }

    @Test
    @DisplayName("a lower-case PAN is accepted and reaches the service")
    void lowerCaseIsAccepted() throws Exception {
        setUpMockMvc();
        stubAcceptedRequest();

        mockMvc.perform(post("/api/accounts/requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"panNo": "abcde1234f"}
                                """))
                .andExpect(status().isCreated());

        // Raw and un-uppercased, which is the point: the DTO does not normalise,
        // the service does. Asserting an upper-case string here would pass just
        // as well with a normalising DTO, and would hide which half is doing the
        // work - the two are separable, and only the service is responsible.
        verify(accountOpeningService).submit(any(AuthenticatedUser.class), eq("abcde1234f"));
    }

    @Test
    @DisplayName("a mixed-case PAN is accepted too")
    void mixedCaseIsAccepted() throws Exception {
        setUpMockMvc();
        stubAcceptedRequest();

        mockMvc.perform(post("/api/accounts/requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"panNo": "AbCdE1234f"}
                                """))
                .andExpect(status().isCreated());

        verify(accountOpeningService).submit(any(AuthenticatedUser.class), eq("AbCdE1234f"));
    }

    @Test
    @DisplayName("an upper-case PAN still works, so the change was additive")
    void upperCaseStillWorks() throws Exception {
        setUpMockMvc();
        stubAcceptedRequest();

        mockMvc.perform(post("/api/accounts/requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"panNo": "ABCDE1234F"}
                                """))
                .andExpect(status().isCreated());

        verify(accountOpeningService).submit(any(AuthenticatedUser.class), eq("ABCDE1234F"));
    }

    @Test
    @DisplayName("the shape is still checked: digits-first is a 400")
    void theFormatIsStillEnforced() throws Exception {
        setUpMockMvc();

        mockMvc.perform(post("/api/accounts/requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"panNo": "12345ABCDE"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors['panNo']").exists());

        // The service is never reached. Accepting either case must not have come
        // from loosening the pattern into something that matches almost
        // anything, which is how these fixes usually go wrong.
        verify(accountOpeningService, never())
                .submit(any(AuthenticatedUser.class), anyString());
    }

    @Test
    @DisplayName("a short PAN is still a 400, in either case")
    void lengthIsStillEnforced() throws Exception {
        setUpMockMvc();

        mockMvc.perform(post("/api/accounts/requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"panNo": "abcd1234f"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors['panNo']").exists());

        verify(accountOpeningService, never())
                .submit(any(AuthenticatedUser.class), anyString());
    }

    @Test
    @DisplayName("a PAN with a space in it is still a 400")
    void interiorWhitespaceIsStillRejected() throws Exception {
        setUpMockMvc();

        // Worth its own case because the service trims. Trimming the ends and
        // rejecting an interior space are different rules, and it would be easy
        // to accept a pattern that quietly let the latter through.
        mockMvc.perform(post("/api/accounts/requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"panNo": "ABCDE 1234F"}
                                """))
                .andExpect(status().isBadRequest());

        verify(accountOpeningService, never())
                .submit(any(AuthenticatedUser.class), anyString());
    }

    @Test
    @DisplayName("a blank PAN is a 400, not a lower-case problem")
    void blankIsStillRejected() throws Exception {
        setUpMockMvc();

        mockMvc.perform(post("/api/accounts/requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"panNo": "   "}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors['panNo']").exists());

        verify(accountOpeningService, never())
                .submit(any(AuthenticatedUser.class), anyString());
    }

    @Test
    @DisplayName("the response is the masked projection, never the PAN that was sent")
    void theResponseMasksThePan() throws Exception {
        setUpMockMvc();
        stubAcceptedRequest();

        mockMvc.perform(post("/api/accounts/requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"panNo": "abcde1234f"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.maskedPanNo").value("XXXXX1234X"));
    }

    private void stubAcceptedRequest() {
        // Returned rather than left null so the handler has a body to serialise.
        when(accountOpeningService.submit(any(AuthenticatedUser.class), anyString()))
                .thenReturn(new AccountOpeningRequestDto.Response(
                        42L, AccountOpeningStatus.PENDING, "XXXXX1234X",
                        Instant.parse("2026-09-20T10:15:30Z"), null, null, null));
    }

}
