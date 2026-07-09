package com.Yuricamp.backend.common;

import org.springframework.http.HttpStatus;

/**
 * 集中管理業務錯誤碼、預設訊息與 HTTP 狀態。
 */
public enum ErrorCode {
    PRODUCT_NOT_FOUND(HttpStatus.NOT_FOUND, "Product not found"),
    PRODUCT_INACTIVE(HttpStatus.CONFLICT, "Product is not active"),
    INSUFFICIENT_STOCK(HttpStatus.CONFLICT, "Insufficient stock"),
    ORDER_NOT_FOUND(HttpStatus.NOT_FOUND, "Order not found"),
    ORDER_STATUS_NOT_CANCELABLE(HttpStatus.CONFLICT, "Order status cannot be cancelled"),
    VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "Request validation failed"),
    INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "Internal server error");

    private final HttpStatus httpStatus;
    private final String message;

    /**
     * 建立錯誤碼與其對應 HTTP 狀態、預設訊息。
     */
    ErrorCode(HttpStatus httpStatus, String message) {
        this.httpStatus = httpStatus;
        this.message = message;
    }

    /**
     * 回傳此錯誤碼應對應的 HTTP 狀態。
     */
    public HttpStatus getHttpStatus() {
        return httpStatus;
    }

    /**
     * 回傳此錯誤碼的預設錯誤訊息。
     */
    public String getMessage() {
        return message;
    }
}
