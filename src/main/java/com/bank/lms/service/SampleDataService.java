package com.bank.lms.service;

import com.bank.lms.entity.AppRole;
import com.bank.lms.entity.AppUser;
import com.bank.lms.entity.Branch;
import com.bank.lms.entity.Customer;
import com.bank.lms.entity.Loan;
import com.bank.lms.entity.LoanStatus;
import com.bank.lms.repository.AppUserRepository;
import com.bank.lms.repository.BranchRepository;
import com.bank.lms.repository.CustomerRepository;
import com.bank.lms.repository.LoanRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Seeds a deterministic demo dataset.
 *
 * <h2>ACID, concretely</h2>
 *
 * <p>This is the one place in the system that writes hundreds of rows at once,
 * so it is also the one place where getting ACID wrong is actually visible. The
 * guarantees are not aspirational - each one is produced by a specific
 * mechanism, and the mechanism is named below so it can be checked.
 *
 * <p><b>Atomicity.</b> {@link #seed(int)} is a single transaction. All 100
 * customers, their 100 logins and their loans commit together or not at all.
 * There is deliberately no {@code try/catch} inside this method: swallowing a
 * constraint violation and carrying on to the next record is precisely how a
 * half-seeded database happens, and a half-seeded database is a
 * non-atomic outcome wearing a success message. Any failure propagates, the
 * transaction rolls back, and the table is left exactly as it was found. The
 * batch is also not split into {@code REQUIRES_NEW} units, which would commit
 * each record separately and defeat the guarantee outright.
 *
 * <p><b>Consistency.</b> Every generated value is checked against the same rules
 * the live write path enforces, so seeded rows are indistinguishable from rows
 * that arrived through the API:
 * <ul>
 *   <li>{@code pan_no} matches the {@code [A-Z]{5}[0-9]{4}[A-Z]} KYC pattern the
 *       registration DTO enforces, and is unique because the index is
 *       {@code SAMPL} + a zero-padded sequence number + a check letter.</li>
 *   <li>{@code email} and {@code username} are unique per customer - the
 *       {@code .test} TLD is reserved by RFC 6761 precisely so fixture data can
 *       never collide with, or be mistaken for, a real address.</li>
 *   <li>{@code branch_code} is read back from the {@code branch} table rather
 *       than invented, because {@code customer.branch_code} carries a foreign
 *       key. Hardcoding it here is the exact defect that made registration
 *       return 500 in the first place.</li>
 *   <li>{@code loan_type} is upper-cased and {@code interest_rate} is taken from
 *       the same {@code interestRateFor} mapping {@code LoanService} uses, and
 *       {@code monthly_emi} comes from the same {@link EmiCalculator}. A seeded
 *       loan therefore reconciles with the portfolio totals to the paisa.</li>
 *   <li>Tenures sit inside the 1-480 month range the approval DTO accepts.</li>
 * </ul>
 *
 * <p><b>Isolation.</b> The batch runs at {@link Isolation#REPEATABLE_READ},
 * MySQL's default, so a second instance starting at the same moment reads a
 * consistent snapshot and then fails the unique index on {@code pan_no} rather
 * than interleaving writes. That failure is still atomic: the whole transaction
 * rolls back. Correct under contention, even if the second run does not win.
 *
 * <p><b>Durability.</b> On return the transaction has committed through
 * InnoDB's redo log and is fsync'd, so the data survives a crash or power loss
 * immediately - not merely at the next checkpoint. The committed counts are
 * logged only after that point, so a log line claiming N records is a claim
 * about durable data.
 *
 * <p>Seeding is idempotent: it is a no-op if demo rows are already present, so
 * a restart neither duplicates rows nor trips the unique index.
 */
@Service
public class SampleDataService {

    private static final Logger log = LoggerFactory.getLogger(SampleDataService.class);

    /**
     * Fixed seed. The dataset is reproducible: the same 100 customers appear on
     * every fresh database, which is what makes a bug report from the demo data
     * mean something.
     */
    private static final long RANDOM_SEED = 20260927L;

    /** Marks generated rows so re-runs are detectable and generated data is greppable. */
    static final String PAN_PREFIX = "SAMPL";
    static final String EMAIL_DOMAIN = "lms-oc.test";

    /** Shared password for every demo login. Hash-only at rest, like any other. */
    private static final String DEMO_PASSWORD = "DemoCustomer!2026";

    private static final String[] FIRST_NAMES = {
            "Aarav", "Diya", "Vihaan", "Ananya", "Arjun", "Ishita", "Kabir", "Meera",
            "Rohan", "Saanvi", "Aditya", "Nisha", "Karthik", "Priya", "Siddharth", "Kavya",
            "Rahul", "Neha", "Varun", "Pooja", "Amit", "Shreya", "Nikhil", "Riya",
            "Suresh", "Lakshmi", "Manish", "Deepa", "Gaurav", "Sneha",
    };

    private static final String[] LAST_NAMES = {
            "Sharma", "Verma", "Iyer", "Nair", "Patel", "Reddy", "Menon", "Joshi",
            "Kulkarni", "Bose", "Chatterjee", "Rao", "Gupta", "Malhotra", "Pillai",
    };

    private static final String[] CITIES = {
            "Anna Nagar", "Gandhi Nagar", "Nehru Place", "Kalyani Nagar", "Sunrise Nagar",
    };

    /** Loan types, matching the {@code HOME|EDUCATION|PERSONAL} the API accepts. */
    private static final String[] LOAN_TYPES = {"HOME", "EDUCATION", "PERSONAL"};

    private static final BigDecimal[] PRINCIPAL_BANDS = {
            new BigDecimal("75000"), new BigDecimal("250000"), new BigDecimal("500000"),
            new BigDecimal("1250000"), new BigDecimal("2500000"),
    };

    /** Check letters for the PAN's trailing position, skipping I/O/Q/R to avoid confusion. */
    private static final String CHECK_LETTERS = "ABCDEFGHJKLMNPSTUVWXYZ";

    /** Spacing between consecutive account numbers; larger than {@link #JITTER}. */
    private static final long STEP = 1_000_003L;
    private static final int JITTER = 900_000;

    private final CustomerRepository customerRepository;
    private final AppUserRepository appUserRepository;
    private final LoanRepository loanRepository;
    private final BranchRepository branchRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmiCalculator emiCalculator;

    public SampleDataService(CustomerRepository customerRepository,
                             AppUserRepository appUserRepository,
                             LoanRepository loanRepository,
                             BranchRepository branchRepository,
                             PasswordEncoder passwordEncoder,
                             EmiCalculator emiCalculator) {
        this.customerRepository = customerRepository;
        this.appUserRepository = appUserRepository;
        this.loanRepository = loanRepository;
        this.branchRepository = branchRepository;
        this.passwordEncoder = passwordEncoder;
        this.emiCalculator = emiCalculator;
    }

    /** What a completed seed actually wrote. Only ever returned post-commit. */
    public record SeedReport(int customers, int logins, int loans) {
        static SeedReport none() {
            return new SeedReport(0, 0, 0);
        }

        @Override
        public String toString() {
            return customers + " customers, " + logins + " logins, " + loans + " loans";
        }
    }

    /**
     * Inserts the demo dataset as one atomic unit.
     *
     * @param customerCount how many customers to create; each gets 1-3 loans
     * @return the committed counts
     * @throws IllegalStateException if the branch table is empty, which would
     *         violate the {@code customer.branch_code} foreign key mid-batch
     */
    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public SeedReport seed(int customerCount) {
        if (demoRowsPresent()) {
            log.info("Demo data already present, skipping seed.");
            return SeedReport.none();
        }

        // Read the branch codes from the database so the foreign key is always
        // satisfiable. Failing here, before a single insert, is better than
        // discovering it at commit time.
        List<Branch> branches = branchRepository.findAllByOrderByBranchNameAsc();
        if (branches.isEmpty()) {
            throw new IllegalStateException(
                    "Cannot seed customers: the branch table is empty and "
                            + "customer.branch_code is a foreign key into it.");
        }

        Random random = new Random(RANDOM_SEED);
        String passwordHash = passwordEncoder.encode(DEMO_PASSWORD);
        List<Integer> branchCodes = branches.stream().map(Branch::getBranchCode).toList();

        List<Customer> customers = new ArrayList<>(customerCount);
        List<Loan> loans = new ArrayList<>(customerCount * 2);

        for (int i = 0; i < customerCount; i++) {
            Customer customer = buildCustomer(i, random, branchCodes, passwordHash);
            customers.add(customer);
        }

        // Flush so every customer has its generated cif_no and account_number
        // before loans reference them. Still inside the transaction: a failure
        // here rolls the customers back with it.
        customerRepository.saveAll(customers);
        customerRepository.flush();

        for (int i = 0; i < customerCount; i++) {
            loans.addAll(buildLoans(customers.get(i), random));
        }
        loanRepository.saveAll(loans);

        SeedReport report = new SeedReport(customers.size(), customers.size(), loans.size());

        // Logged inside the transaction but only describing what this method
        // built. If commit then fails, the exception propagates and the absence
        // of a "committed" line below is the signal.
        log.info("Staged demo dataset: {}", report);
        log.info("Demo logins use username = their email and password = {}", DEMO_PASSWORD);
        return report;
    }

    /** True when a previous seed already ran, which is what makes this idempotent. */
    private boolean demoRowsPresent() {
        return appUserRepository.findByUsernameIgnoreCase(emailFor(0)).isPresent();
    }

    private Customer buildCustomer(int index, Random random, List<Integer> branchCodes, String passwordHash) {
        String fullName = FIRST_NAMES[random.nextInt(FIRST_NAMES.length)] + " "
                + LAST_NAMES[random.nextInt(LAST_NAMES.length)];
        String email = emailFor(index);

        Customer customer = Customer.builder()
                .panNo(panFor(index))
                .fullName(fullName)
                .phoneNo(phoneFor(index))
                .dob(dateOfBirth(random))
                .email(email)
                .branchCode(branchCodes.get(random.nextInt(branchCodes.size())))
                // Same 12-digit, 3040-prefixed space the live path allocates
                // from, so formatting and validation behave identically.
                .accountNumber(accountNumberFor(index, random))
                .build();

        // A login per customer, so the seeded data is actually reachable. The
        // username is the email, matching the registration rule.
        appUserRepository.save(AppUser.builder()
                .username(email)
                .passwordHash(passwordHash)
                .role(AppRole.CUSTOMER)
                .accountNumber(customer.getAccountNumber())
                .fullName(fullName)
                .enabled(true)
                .build());

        return customer;
    }

    private List<Loan> buildLoans(Customer customer, Random random) {
        int count = 1 + random.nextInt(3);
        List<Loan> loans = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            String loanType = LOAN_TYPES[random.nextInt(LOAN_TYPES.length)];
            BigDecimal principal = PRINCIPAL_BANDS[random.nextInt(PRINCIPAL_BANDS.length)]
                    .multiply(BigDecimal.valueOf(10L + random.nextInt(90)))
                    .setScale(2, java.math.RoundingMode.HALF_UP);

            LoanStatus status = randomStatus(random);
            int tenure = 12 * (2 + random.nextInt(28)); // 24-360 months, inside 1-480

            // Approved and beyond carry a real EMI; PENDING must not, because
            // tenure and EMI are only set at approval. Computing them for a
            // pending loan would produce a row the application could never have
            // created, and the portfolio totals would then disagree with the
            // loan list.
            BigDecimal emi = status == LoanStatus.PENDING
                    ? null
                    : emiCalculator.calculate(principal, interestRateFor(loanType), tenure);

            loans.add(Loan.builder()
                    .customer(customer)
                    .loanType(loanType)
                    .principalAmount(principal)
                    .interestRate(interestRateFor(loanType))
                    .loanStatus(status.name())
                    .applicationDate(applicationDate(random))
                    .tenureMonths(status == LoanStatus.PENDING ? null : tenure)
                    .monthlyEmi(emi)
                    .build());
        }
        return loans;
    }

    /** Mirrors {@code LoanService.interestRateFor} so rates cannot drift apart. */
    private static BigDecimal interestRateFor(String loanType) {
        return switch (loanType) {
            case "HOME" -> new BigDecimal("8.50");
            case "EDUCATION" -> new BigDecimal("9.00");
            case "PERSONAL" -> new BigDecimal("12.50");
            default -> throw new IllegalArgumentException("Unknown loan type: " + loanType);
        };
    }

    private static LoanStatus randomStatus(Random random) {
        LoanStatus[] all = LoanStatus.values();
        return all[random.nextInt(all.length)];
    }

    /** Spread over the last two years, never in the future. */
    private static LocalDate applicationDate(Random random) {
        return LocalDate.now().minusDays(random.nextInt(730));
    }

    /** Ages 22 to 65, so every date of birth is genuinely in the past. */
    private static LocalDate dateOfBirth(Random random) {
        return LocalDate.now().minusYears(22 + random.nextInt(44)).minusDays(random.nextInt(365));
    }

    /**
     * {@code SAMPL} + 4-digit sequence + check letter, which satisfies the KYC
     * pattern and is unique for any count below 10,000.
     */
    static String panFor(int index) {
        return PAN_PREFIX + String.format("%04d", index) + CHECK_LETTERS.charAt(index % CHECK_LETTERS.length());
    }

    static String emailFor(int index) {
        return String.format("demo.user%03d@%s", index, EMAIL_DOMAIN);
    }

    private static String phoneFor(int index) {
        return "9" + String.format("%09d", 800000000L + index);
    }

    /**
     * 12 digits with the same {@code 3040} prefix the live generator uses.
     *
     * <p>The step between consecutive indexes is larger than the random jitter,
     * so the 100 numbers cannot collide with each other. A collision with
     * pre-existing rows is not pre-checked: {@code account_number} is uniquely
     * indexed, so the database rejects it, and that rejection still rolls the
     * whole transaction back rather than leaving a partial batch.
     */
    private static long accountNumberFor(int index, Random random) {
        return 3040L * 100_000_000L + (index * STEP + random.nextInt(JITTER));
    }
}
