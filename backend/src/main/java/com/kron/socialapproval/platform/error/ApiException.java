package com.kron.socialapproval.platform.error;

import org.springframework.http.HttpStatus;

/**
 * Base class for every expected, mapped application error.
 *
 * <p>{@code code} is the stable machine constant the frontend switches on; the message is human
 * text and may be localised. Internal detail never reaches the client (ARCHITECTURE.md 3.4).
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }
}
