package com.bank.lms.exception;

import org.springframework.http.HttpStatus;

/** Thrown when a requested resource does not exist. Surfaces as HTTP 404. */
public class ResourceNotFoundException extends RuntimeException {

    private final HttpStatus status;

    public ResourceNotFoundException(String message) {
        this(message, HttpStatus.NOT_FOUND);
    }

    public ResourceNotFoundException(String message, HttpStatus status) {
        super(message);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
