package com.yuruicamp.backend.integration.n8n.api;

import java.time.Instant;

/**
 * Compact shop-order card for LINE CS chat via n8n.
 * Intentionally omits full address, phone, internal notes, and line items.
 */
public record N8nOrderCsCardResponse(
		String displayNo,
		String status,
		String paymentStatus,
		String shippingMethod,
		String logisticsId,
		String logisticsRtnCode,
		String logisticsRtnMsg,
		Instant logisticsStatusAt,
		String cvsStoreName,
		Instant placedAt) {
}
