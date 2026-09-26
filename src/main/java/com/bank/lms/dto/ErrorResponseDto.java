package com.bank.lms.dto;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * Single error envelope returned for every failed request.
 *
 * @param fieldErrors per-field validation messages, empty when the failure is
 *                    not field-level
 */
public record ErrorResponseDto(
        LocalDateTime timestamp,
        int status,
        String error,
        String message,
        String path,
        Map<String, String> fieldErrors) {

    public ErrorResponseDto {
        fieldErrors = fieldErrors == null ? Map.of() : Map.copyOf(fieldErrors);
    }
}
