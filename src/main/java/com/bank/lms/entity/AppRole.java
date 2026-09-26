package com.bank.lms.entity;

/** Authorisation role carried by an {@link AppUser}. */
public enum AppRole {

    /** Full access: can read any customer and approve loans. */
    ADMIN,

    /** May only read and transact on their own account. */
    CUSTOMER
}
