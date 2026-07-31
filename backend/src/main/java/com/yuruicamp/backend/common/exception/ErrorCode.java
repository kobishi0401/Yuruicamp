package com.yuruicamp.backend.common.exception;

import org.springframework.http.HttpStatus;

/**
 * Stable machine-readable error codes for clients.
 * 給前端對照的錯誤代碼（與 HTTP status 分開）。
 */
public enum ErrorCode {

	VALIDATION_ERROR(HttpStatus.BAD_REQUEST),
	UNAUTHORIZED(HttpStatus.UNAUTHORIZED),
	FORBIDDEN(HttpStatus.FORBIDDEN),
	NOT_FOUND(HttpStatus.NOT_FOUND),
	ADMIN_INACTIVE(HttpStatus.FORBIDDEN),
	ADMIN_NOT_WHITELISTED(HttpStatus.FORBIDDEN),
	CUSTOMER_SUSPENDED(HttpStatus.FORBIDDEN),
	CONFLICT(HttpStatus.CONFLICT),
	/** LINE User ID already bound to a different Customer (no steal). */
	LINE_USER_ID_CONFLICT(HttpStatus.CONFLICT),
	/** n8n lookup: LINE User ID has no linked Customer. */
	LINE_NOT_LINKED(HttpStatus.NOT_FOUND),
	BOOKING_DATE_INVALID(HttpStatus.BAD_REQUEST),
	BOOKING_WINDOW_EXCEEDED(HttpStatus.BAD_REQUEST),
	ZONE_UNAVAILABLE(HttpStatus.CONFLICT),
	RENTAL_STOCK_INSUFFICIENT(HttpStatus.CONFLICT),
	IDEMPOTENCY_CONFLICT(HttpStatus.CONFLICT),
	STOCK_INSUFFICIENT(HttpStatus.CONFLICT),
	VARIANT_NOT_SELLABLE(HttpStatus.CONFLICT),
	CHECKOUT_EXPIRED(HttpStatus.CONFLICT),
	COUPON_SOLD_OUT(HttpStatus.CONFLICT),
	COUPON_ALREADY_CLAIMED(HttpStatus.CONFLICT),
	COUPON_NOT_ELIGIBLE(HttpStatus.CONFLICT),
	COUPON_NOT_APPLICABLE(HttpStatus.CONFLICT),
	COUPON_ALREADY_USED(HttpStatus.CONFLICT),
	REVIEW_ALREADY_EXISTS(HttpStatus.CONFLICT),
	REVIEW_ORDER_NOT_COMPLETED(HttpStatus.CONFLICT),
	REVIEW_ORDER_FORBIDDEN(HttpStatus.FORBIDDEN),
	/** 綠界／stub 退款失敗；不得只改本地 status。 / ECPay refund failed — do not mutate local status only. */
	PAYMENT_REFUND_FAILED(HttpStatus.CONFLICT),
	/** 找不到可退款 Notify 或交易衝突。 / Missing refundable notify row or provider conflict. */
	PAYMENT_PROVIDER_CONFLICT(HttpStatus.CONFLICT),
	INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR);

	private final HttpStatus status;

	ErrorCode(HttpStatus status) {
		this.status = status;
	}

	public HttpStatus getStatus() {
		return status;
	}

	public String code() {
		return name();
	}
}
