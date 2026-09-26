package com.bank.lms.service;

import com.bank.lms.exception.InvalidRequestException;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Equated monthly instalment calculator.
 *
 * <pre>
 *              P x r x (1 + r)^n
 *   EMI  =  ---------------------
 *              (1 + r)^n  -  1
 * </pre>
 *
 * where {@code r} is the monthly interest rate and {@code n} the tenure in
 * months. All arithmetic uses {@link BigDecimal} - binary floating point cannot
 * represent these values exactly and would drift on currency.
 */
@Component
public class EmiCalculator {

    private static final int MONTHS_PER_YEAR = 12;
    private static final int EMI_SCALE = 2;
    private static final int RATE_DIVISION_SCALE = 10;

    /**
     * @param principal     amount borrowed
     * @param annualRatePct annual interest rate as a percentage, e.g. {@code 8.50}
     * @param tenureMonths  number of monthly instalments
     * @return the monthly instalment, rounded half-up to 2 decimal places
     */
    public BigDecimal calculate(BigDecimal principal, BigDecimal annualRatePct, int tenureMonths) {
        if (principal == null || principal.signum() <= 0) {
            throw new InvalidRequestException("Principal amount must be greater than zero.");
        }
        if (annualRatePct == null || annualRatePct.signum() < 0) {
            throw new InvalidRequestException("Interest rate must not be negative.");
        }
        if (tenureMonths <= 0) {
            throw new InvalidRequestException("Tenure must be greater than zero months.");
        }

        BigDecimal monthlyRate = annualRatePct.divide(
                BigDecimal.valueOf(MONTHS_PER_YEAR * 100L), RATE_DIVISION_SCALE, RoundingMode.HALF_UP);

        // (1 + 0)^n - 1 is zero, so the general formula collapses to 0/0.
        // A promotional 0% loan simply amortises straight down.
        if (monthlyRate.signum() == 0) {
            return principal.divide(BigDecimal.valueOf(tenureMonths), EMI_SCALE, RoundingMode.HALF_UP);
        }

        BigDecimal growth = BigDecimal.ONE.add(monthlyRate).pow(tenureMonths);
        BigDecimal numerator = principal.multiply(monthlyRate).multiply(growth);
        BigDecimal denominator = growth.subtract(BigDecimal.ONE);

        return numerator.divide(denominator, EMI_SCALE, RoundingMode.HALF_UP);
    }
}
