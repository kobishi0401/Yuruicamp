package com.yuruicamp.backend.order.api;

import java.time.Instant;

public record AdminOrderListResponse(
		String id,
		String displayNo,
		String customerId,
		String customerName,
		String recipientName,
		String total,
		String paymentMethod,
		String paymentStatus,
		String refundStatus,
		String status,
		long itemCount,
		Instant placedAt,
		Instant paidAt,
		Instant updatedAt,
		String shippingMethod,
		String ecpayLogisticsId,
		String ecpayLogisticsRtnCode,
		String ecpayLogisticsRtnMsg,
		Instant ecpayLogisticsStatusAt) {
}
