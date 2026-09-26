package com.bank.lms.entity;

/** Lifecycle states a loan moves through. */
public enum LoanStatus {

    /** Applied for, awaiting a decision. */
    PENDING,

    /** Sanctioned; tenure and EMI are set. */
    APPROVED,

    /** Money has been paid out to the customer. */
    DISBURSED,

    /** Written off. */
    CLOSED
}
