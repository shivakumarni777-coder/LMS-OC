/**
 * Deterministic fixture data for the standalone demo.
 *
 * Generated rather than stored as a JSON blob: the same PRNG runs on every load,
 * so the portfolio looks identical to everyone in the room and to a recording,
 * without a large file in version control. It also means the numbers are always
 * internally consistent, which a hand-edited fixture slowly stops being.
 *
 * Shapes mirror the backend DTOs exactly, so the demo exercises the real
 * rendering and formatting paths rather than a simplified stand-in.
 */

const SEED = 20260927;

/** mulberry32 - small, fast, and good enough for plausible-looking data. */
function makeRandom(seed) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  'Aarav', 'Diya', 'Vihaan', 'Ananya', 'Arjun', 'Ishita', 'Kabir', 'Meera',
  'Rohan', 'Saanvi', 'Aditya', 'Nisha', 'Karthik', 'Priya', 'Siddharth', 'Kavya',
  'Rahul', 'Neha', 'Varun', 'Pooja', 'Amit', 'Shreya', 'Nikhil', 'Riya',
  'Suresh', 'Lakshmi', 'Manish', 'Deepa', 'Gaurav', 'Sneha',
];

const LAST_NAMES = [
  'Sharma', 'Verma', 'Iyer', 'Nair', 'Patel', 'Reddy', 'Menon', 'Joshi',
  'Kulkarni', 'Bose', 'Chatterjee', 'Rao', 'Gupta', 'Malhotra', 'Pillai',
];

export const BRANCHES = [
  { branchCode: 101, branchName: 'Main Street', address: '12 Main Street, Anna Nagar' },
  { branchCode: 102, branchName: 'Central Avenue', address: '48 Central Avenue, Gandhi Nagar' },
  { branchCode: 103, branchName: 'Park Road', address: '7 Park Road, Nehru Place' },
  { branchCode: 104, branchName: 'Riverside', address: '221 Riverside Drive, Kalyani Nagar' },
  { branchCode: 105, branchName: 'Hillview', address: '9 Hillview Crescent, Sunrise Nagar' },
];

const LOAN_TYPES = ['HOME', 'EDUCATION', 'PERSONAL'];

/** Mirrors the backend's rate table, so the demo cannot drift from the real app. */
const RATES = { HOME: 8.5, EDUCATION: 9.0, PERSONAL: 12.5 };

const PRINCIPAL_BANDS = [75000, 250000, 500000, 1250000, 2500000];

const STATUSES = ['PENDING', 'APPROVED', 'DISBURSED', 'CLOSED'];

/**
 * One password for every account, admin included.
 *
 * A single documented credential is a deliberate trade-off for a demo: the
 * presenter can log in as either role without having to remember which of two
 * secrets applies, and a mistyped password on stage cannot cost the demo.
 * It is not a real credential and the code that honours it never ships - see
 * `npm run verify:no-demo-in-prod`.
 */
export const DEMO_PASSWORD = 'DemoCustomer!2026';

/** Standard reducing-balance EMI. Same formula the backend's EmiCalculator uses. */
export function calculateEmi(principal, annualRatePct, tenureMonths) {
  const n = tenureMonths;
  const r = annualRatePct / (12 * 100);
  if (r === 0) return round2(principal / n);
  const growth = (1 + r) ** n;
  return round2((principal * r * growth) / (growth - 1));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function roundRate(value) {
  return Math.round(value * 100) / 100;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDays(base, days) {
  const copy = new Date(base.getTime());
  copy.setDate(copy.getDate() - days);
  return copy;
}

/**
 * Builds the whole in-memory dataset.
 *
 * Loan and EMI are generated together: tenure and EMI are only set once a loan
 * is approved, so a PENDING loan must carry neither. Emitting a pending loan
 * with an EMI would put totals on screen that the real application could never
 * produce, and that inconsistency is exactly the sort of thing an audience
 * notices.
 */
export function buildDataset({ customerCount = 100, now = new Date() } = {}) {
  const random = makeRandom(SEED);
  const customers = [];
  const loans = [];
  const accounts = new Map(); // accountNumber -> customer

  for (let i = 0; i < customerCount; i += 1) {
    const fullName = `${FIRST_NAMES[Math.floor(random() * FIRST_NAMES.length)]} ${
      LAST_NAMES[Math.floor(random() * LAST_NAMES.length)]
    }`;
    const email = `demo.user${String(i).padStart(3, '0')}@lms-oc.test`;
    const accountNumber = 304000000000 + i * 1000003 + Math.floor(random() * 900000);
    const branch = BRANCHES[Math.floor(random() * BRANCHES.length)];
    const birthYear = 1965 + Math.floor(random() * 35);
    const birthMonth = 1 + Math.floor(random() * 12);
    const birthDay = 1 + Math.floor(random() * 28);

    // `userId` is carried on the record rather than derived from its position in
    // the array. A customer registered during the demo is appended to that array,
    // and an identity derived from the index would silently renumber everyone
    // behind it - so the account-opening request one of them filed would be
    // attributed to a stranger.
    const customer = {
      userId: 1000 + i,
      customer: {
        accountNumber,
        fullName,
        email,
        // Mirrors the backend's profile: date of birth is part of who a customer
        // is, and the account-opening form shows what the bank already holds.
        dob: `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`,
        phoneNo: `9${String(800000000 + i).padStart(9, '0')}`,
        branchCode: branch.branchCode,
      },
      username: email,
    };
    customers.push(customer);
    accounts.set(accountNumber, customer.customer);

    const loanCount = 1 + Math.floor(random() * 3);
    for (let j = 0; j < loanCount; j += 1) {
      const loanType = LOAN_TYPES[Math.floor(random() * LOAN_TYPES.length)];
      const principal = round2(
        PRINCIPAL_BANDS[Math.floor(random() * PRINCIPAL_BANDS.length)]
        * (10 + Math.floor(random() * 90)),
      );
      const status = STATUSES[Math.floor(random() * STATUSES.length)];
      const tenureMonths = status === 'PENDING' ? null : 12 * (2 + Math.floor(random() * 28));
      const interestRate = RATES[loanType];

      loans.push({
        loanId: loans.length + 1,
        accountNumber,
        loanType,
        principalAmount: principal,
        interestRate: roundRate(interestRate),
        loanStatus: status,
        applicationDate: isoDate(shiftDays(now, Math.floor(random() * 730))),
        tenureMonths,
        monthlyEmi: status === 'PENDING'
          ? null
          : calculateEmi(principal, interestRate, tenureMonths),
      });
    }
  }

  // Applicants: registered customers who have not opened an account yet, each
  // with a request waiting on an officer.
  //
  // Seeded rather than left empty because the officer's queue would otherwise be
  // blank on arrival, and a queue with nothing in it is indistinguishable from a
  // broken one. Without these, the one screen that shows the review decision can
  // only be reached by registering a customer and filing a request first, which
  // makes the demo's most interesting state the hardest one to demonstrate.
  //
  // They are separate from the customers above because they are a different
  // thing: a customer with an account cannot file an account-opening request at
  // all, so giving one of them a request would be a state the real backend
  // refuses to produce.
  const requests = [];
  const APPLICANT_OUTCOMES = ['PENDING', 'PENDING', 'APPROVED', 'REJECTED'];
  APPLICANT_OUTCOMES.forEach((outcome, i) => {
    const fullName = `${FIRST_NAMES[Math.floor(random() * FIRST_NAMES.length)]} ${
      LAST_NAMES[Math.floor(random() * LAST_NAMES.length)]
    }`;
    const email = `demo.applicant${String(i).padStart(3, '0')}@lms-oc.test`;
    // Above both the generated ids (1000+) and the range registration mints
    // from (2000+), so a customer registered live can never be handed an
    // applicant id, and an applicant can never be handed a duplicate.
    const userId = 9000 + i;
    const requestedAt = new Date(Date.UTC(2026, 8, 12 + i, 9 + i, 15)).toISOString();

    const applicant = {
      userId,
      customer: {
        // Null rather than absent while undecided: that is the state the
        // customer pages branch on, and a missing key reads the same way only by
        // accident.
        accountNumber: null,
        fullName,
        email,
        dob: `${1960 + i}-0${1 + i}-1${i}`,
        phoneNo: `9${String(700000000 + i).padStart(9, '0')}`,
        branchCode: BRANCHES[i % BRANCHES.length].branchCode,
      },
      username: email,
    };

    const request = {
      requestId: i + 1,
      userId,
      panNo: `${String.fromCharCode(65 + i)}${String.fromCharCode(70 + i)}CDE${1000 + i}F`,
      status: outcome,
      requestedAt,
    };

    if (outcome === 'PENDING') {
      // Left without a review timestamp, a note, or an account number, matching
      // the backend's non-null inclusion: an undecided request has none of them.
    } else {
      request.reviewedAt = new Date(Date.UTC(2026, 8, 20 + i, 11, 0)).toISOString();
      request.reviewNotes =
        outcome === 'REJECTED'
          ? 'The PAN could not be matched against any record. Please recheck it and apply again.'
          : 'Verified against the submitted documents.';

      if (outcome === 'APPROVED') {
        // An approval that opened no account would be a state the backend cannot
        // produce, and it would leave this applicant permanently unable to apply
        // for a loan while appearing to be a full customer.
        const accountNumber = 304000000000 + 5000000 + i;
        applicant.customer.accountNumber = accountNumber;
        accounts.set(accountNumber, applicant.customer);
        request.resultingAccountNumber = accountNumber;
      }
    }

    customers.push(applicant);
    requests.push(request);
  });

  return {
    customers,
    loans,
    accounts,
    requests,
    // Documents, likewise keyed by nothing: each records the loan it was filed
    // against. Documents belong to an application rather than to a customer,
    // which is the rule the server enforces and the reason a customer's id is
    // never enough to find one.
    documents: [],
    admin: {
      userId: 1,
      username: 'admin',
      fullName: 'Bootstrap Administrator',
      role: 'ADMIN',
      accountNumber: null,
    },
  };
}

/** Recomputes the portfolio totals, exactly as the backend's summary endpoint does. */
export function summarise(loans) {
  const byStatus = STATUSES.map((status) => {
    const inStatus = loans.filter((loan) => loan.loanStatus === status);
    return {
      status,
      count: inStatus.length,
      principal: round2(inStatus.reduce((sum, l) => sum + Number(l.principalAmount), 0)),
    };
  });

  return {
    totalLoans: loans.length,
    totalPrincipal: round2(loans.reduce((sum, l) => sum + Number(l.principalAmount), 0)),
    totalOutstandingEmi: round2(loans.reduce((sum, l) => sum + Number(l.monthlyEmi ?? 0), 0)),
    byStatus,
  };
}
