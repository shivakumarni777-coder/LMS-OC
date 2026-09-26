package com.bank.lms.config;

import com.bank.lms.service.SampleDataService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Runs the demo seed on startup.
 *
 * <p>Delegates to {@link SampleDataService#seed(int)} rather than doing the work
 * here, and that indirection is the point: the transaction has to start inside a
 * proxied bean for {@code @Transactional} to apply at all. A runner that
 * self-invoked its own transactional method would run unproxied and quietly
 * commit row by row, which is the opposite of the atomicity it claims.
 *
 * <p>Disabled by default. A dataset of invented customers and known passwords
 * must never appear in an environment that did not ask for it, so enabling this
 * is an explicit decision rather than a default.
 */
@Component
@ConditionalOnProperty(
        prefix = "app.sample-data",
        name = "enabled",
        havingValue = "true")
public class SampleDataRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SampleDataRunner.class);

    private final SampleDataService sampleDataService;
    private final int customerCount;

    public SampleDataRunner(SampleDataService sampleDataService,
                            @Value("${app.sample-data.customers:100}") int customerCount) {
        this.sampleDataService = sampleDataService;
        this.customerCount = customerCount;
    }

    @Override
    public void run(ApplicationArguments args) {
        SampleDataService.SeedReport report = sampleDataService.seed(customerCount);
        if (report.customers() == 0) {
            log.info("Sample data seeding was a no-op; nothing to do.");
            return;
        }
        // Only reached if the transaction committed, so this line is a claim
        // about durable data rather than about intent.
        log.info("Sample data committed: {}", report);
    }
}
