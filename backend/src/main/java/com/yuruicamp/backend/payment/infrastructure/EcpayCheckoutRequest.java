package com.yuruicamp.backend.payment.infrastructure;

import java.util.Map;

/**
 * 組裝一筆 AIO Checkout 送出欄位所需的業務輸入。
 */
public record EcpayCheckoutRequest(
		String entityId,
		boolean order,
		int tradeAmt,
		String itemName,
		String tradeDesc,
		String choosePayment,
		String expiresAtIso) {

	public String customField1() {
		return (order ? "order:" : "booking:") + entityId;
	}
}
