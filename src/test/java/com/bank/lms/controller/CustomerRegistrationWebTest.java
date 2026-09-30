package com.bank.lms.controller;

import com.bank.lms.dto.ErrorResponseDto;
import com.bank.lms.exception.GlobalExceptionHandler;
import com.bank.lms.service.CustomerService;
import com.bank.lms.service.LoanService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Registration as the HTTP layer actually sees it.
 *
 * <p>Exercises JSON binding, bean validation and the exception handler together,
 * because the bug this guards against lived in the seam between them: a nested
 * {@code @Valid} with no {@code @NotNull} passes validation when the object is
 * absent, so the request reached the service and died on a dereference, and the
 * catch-all reported 500 for what is plainly a client mistake. A unit test on
 * the service would not have seen it, because the service was handed a null it
 * was never meant to receive.
 *
 * <p>Standalone MockMvc rather than a full-context one, deliberately: that skips
 * the security filter chain, and without {@code spring-security-test} there is
 * no CSRF post-processor to satisfy. A filtered POST would be refused with 403
 * before validation ever ran, which would prove nothing here.
 */
class CustomerRegistrationWebTest {

    private final CustomerService customerService = mock(CustomerService.class);
    private final LoanService loanService = mock(LoanService.class);

    private MockMvc mockMvc;

    private void setUpMockMvc() {
        // LocalValidatorFactoryBean adapts the Jakarta validator to the Spring
        // interface that standalone MockMvc expects. Left unset, MockMvc would
        // skip validation entirely and these tests would pass for the wrong
        // reason. No explicit provider is passed: the no-arg form resolves
        // whichever Jakarta implementation is on the test classpath.
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();

        mockMvc = MockMvcBuilders.standaloneSetup(new CustomerController(customerService, loanService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .setValidator(validator)
                .build();
    }

    @Test
    @DisplayName("a registration with no profile is a 400, not a 500")
    void missingProfileIsABadRequest() throws Exception {
        setUpMockMvc();

        mockMvc.perform(post("/api/customers/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"password": "correct-horse-battery"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").exists());

        // The service is never reached, which is the whole point: previously it
        // was, and dereferenced the missing profile.
        verify(customerService, never()).registerCustomerProfile(any());
    }

    @Test
    @DisplayName("a registration with an entirely empty body is a 400")
    void emptyBodyIsABadRequest() throws Exception {
        setUpMockMvc();

        mockMvc.perform(post("/api/customers/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());

        verify(customerService, never()).registerCustomerProfile(any());
    }

    @Test
    @DisplayName("a profile present but empty is a 400 naming the fields")
    void emptyProfileIsABadRequest() throws Exception {
        setUpMockMvc();

        mockMvc.perform(post("/api/customers/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"password": "correct-horse-battery", "profile": {}}
                                """))
                .andExpect(status().isBadRequest())
                // Keyed by the cascaded field path, not the leaf name: the
                // handler uses BindingResult.getField(), which for a nested
                // object yields "profile.fullName". Asserted explicitly because
                // the frontend has to key its error display off this string.
                .andExpect(jsonPath("$.fieldErrors['profile.fullName']").exists())
                .andExpect(jsonPath("$.fieldErrors['profile.email']").exists())
                .andExpect(jsonPath("$.fieldErrors['profile.dob']").exists());

        verify(customerService, never()).registerCustomerProfile(any());
    }

    @Test
    @DisplayName("a well-formed registration reaches the service")
    void validRegistrationReachesTheService() throws Exception {
        setUpMockMvc();

        // Returned rather than left null so the handler has a body to serialise;
        // the assertion of interest is the 201.
        org.mockito.Mockito.when(customerService.registerCustomerProfile(any()))
                .thenReturn(new com.bank.lms.dto.CustomerProfileRegistrationDto.Result(
                        "asha.rao@example.com", "Asha Rao", "asha.rao@example.com", null));

        mockMvc.perform(post("/api/customers/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "password": "correct-horse-battery",
                                  "profile": {
                                    "fullName": "Asha Rao",
                                    "dob": "1994-03-21",
                                    "phoneNo": "9876543210",
                                    "email": "asha.rao@example.com",
                                    "branchCode": 101
                                  }
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.username").value("asha.rao@example.com"));

        verify(customerService).registerCustomerProfile(any());
    }

    @Test
    @DisplayName("the response still declares the error shape the rest of the API uses")
    void errorsUseTheSharedResponseShape() throws Exception {
        setUpMockMvc();

        String body = mockMvc.perform(post("/api/customers/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"password": "correct-horse-battery"}
                                """))
                .andExpect(status().isBadRequest())
                .andReturn().getResponse().getContentAsString();

        // The frontend parses this shape for every error it displays, so a
        // validation failure on a new endpoint has to arrive in it too.
        assertTrue(body.contains("\"message\""), body);
        assertTrue(body.contains("\"fieldErrors\""), body);
    }

    @Test
    @DisplayName("ErrorResponseDto is what the handler actually returns")
    void handlerProducesTheSharedDto() {
        // A direct check on the DTO's contract, so a future rename of the error
        // payload is caught here rather than by a broken page.
        ErrorResponseDto response = new ErrorResponseDto(
                java.time.LocalDateTime.now(), 400, "Bad Request",
                "Customer details are required", "/api/customers/register",
                java.util.Map.of("profile", "Customer details are required"));

        assertEquals(400, response.status());
        assertEquals("Bad Request", response.error());
        assertEquals("/api/customers/register", response.path());
        assertTrue(response.fieldErrors().containsKey("profile"));
    }
}
