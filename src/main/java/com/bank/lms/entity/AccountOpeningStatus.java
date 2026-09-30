package com.bank.lms.entity;

/** Lifecycle of a request to open a bank account for an existing login. */
public enum AccountOpeningStatus {

    /** Submitted and awaiting an officer's decision. */
    PENDING,

    /** Approved; a {@link Customer} row now exists for this login. */
    APPROVED,

    /** Turned down. The customer may submit again. */
    REJECTED
}
