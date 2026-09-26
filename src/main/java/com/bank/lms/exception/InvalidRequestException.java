package com.bank.lms.exception;

import org.springframework.http.HttpStatus;

/** Thrown when a request is well-formed but semantically invalid. Surfaces as HTTP 400. */
public class InvalidRequestException extends RuntimeException {

    public InvalidRequestException(String message) {
        super(message);
    }

    public HttpStatus getStatus() {
        return HttpStatus.BAD_REQUEST;
    }
}
