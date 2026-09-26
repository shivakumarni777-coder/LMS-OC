package com.bank.lms.service;

import com.bank.lms.exception.InvalidRequestException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EmiCalculatorTest {

    private final EmiCalculator calculator = new EmiCalculator();

    @Test
    @DisplayName("home loan: 50,00,000 at 8.50% over 240 months is 43,391.16")
    void calculatesKnownEmiExactly() {
        BigDecimal emi = calculator.calculate(
                new BigDecimal("5000000"), new BigDecimal("8.50"), 240);

        assertEquals(new BigDecimal("43391.16"), emi);
    }

    @ParameterizedTest(name = "{0} @ {1}% for {2} months -> {3}")
    @CsvSource({
            "100000, 8.50, 120, 1239.86",
            "250000, 9.00,  60, 5189.59",
            "100000, 12.50, 36,  3345.36",
    })
    @DisplayName("matches independently computed amortisation values")
    void calculatesEmiAcrossProducts(String principal, String rate, int months, String expected) {
        BigDecimal emi = calculator.calculate(
                new BigDecimal(principal), new BigDecimal(rate), months);

        assertEquals(new BigDecimal(expected), emi);
    }

    @Test
    @DisplayName("total repaid exceeds the principal but stays proportionate")
    void totalRepaymentIsSane() {
        BigDecimal principal = new BigDecimal("5000000");
        BigDecimal emi = calculator.calculate(principal, new BigDecimal("8.50"), 240);

        BigDecimal total = emi.multiply(BigDecimal.valueOf(240));
        assertTrue(total.compareTo(principal) > 0, "total repaid must exceed the principal");
        assertTrue(total.compareTo(principal.multiply(new BigDecimal("2.5"))) < 0,
                "total repaid must stay below 2.5x principal at this rate, was " + total);
    }

    @Test
    @DisplayName("rejects a zero or negative tenure instead of dividing by zero")
    void rejectsNonPositiveTenure() {
        assertThrows(InvalidRequestException.class,
                () -> calculator.calculate(new BigDecimal("100000"), new BigDecimal("8.50"), 0));
    }

    @Test
    @DisplayName("rejects a non-positive principal")
    void rejectsNonPositivePrincipal() {
        assertThrows(InvalidRequestException.class,
                () -> calculator.calculate(BigDecimal.ZERO, new BigDecimal("8.50"), 24));
    }

    @Test
    @DisplayName("a zero-interest loan amortises to principal / tenure")
    void handlesZeroInterest() {
        BigDecimal emi = calculator.calculate(new BigDecimal("12000"), BigDecimal.ZERO, 12);

        assertEquals(new BigDecimal("1000.00"), emi);
    }
}
