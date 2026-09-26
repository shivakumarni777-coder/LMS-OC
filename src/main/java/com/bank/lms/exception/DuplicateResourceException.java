package com.bank.lms.exception;

import org.springframework.http.HttpStatus;

/** Thrown when a uniqueness constraint would be violated. Surfaces as HTTP 409. */
public class DuplicateResourceException extends RuntimeException {

    public DuplicateResourceException(String message) {
        super(message);
    }

    public HttpStatus getStatus() {
        return HttpStatus.CONFLICT;
    }
}
