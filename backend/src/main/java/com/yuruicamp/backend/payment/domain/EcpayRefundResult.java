package com.yuruicamp.backend.payment.domain;

/**
 * 綠界全額退款結果（W3）。
 * Full ECPay refund outcome for Admin cancel flows.
 */
public record EcpayRefundResult(boolean success, String message) {

	public static EcpayRefundResult ok() {
		return new EcpayRefundResult(true, "OK");
	}

	public static EcpayRefundResult failed(String message) {
		return new EcpayRefundResult(false, message == null ? "Refund failed" : message);
	}
}
