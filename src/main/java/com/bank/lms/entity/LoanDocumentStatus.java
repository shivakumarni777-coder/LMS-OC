package com.bank.lms.entity;

/** Review state of a document submitted against a loan application. */
public enum LoanDocumentStatus {

    /** Uploaded and not yet looked at. */
    PENDING,

    /** Accepted as genuine. */
    VERIFIED,

    /** Turned down, with the reason recorded on the document. */
    REJECTED
}
