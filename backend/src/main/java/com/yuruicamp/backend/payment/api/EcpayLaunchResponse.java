package com.yuruicamp.backend.payment.api;

import java.util.Map;

/**
 * D-2：前端用來組 hidden form 並 POST 到綠界（或本機 stub）的啟動資料。
 * 契約：docs/api/payment-api-contract.md §3 EcpayLaunch
 */
public record EcpayLaunchResponse(
		String orderId,
		String bookingId,
		String merchantTradeNo,
		String actionUrl,
		Map<String, String> fields,
		String expiresAt) {
}
