package com.yuruicamp.backend.order.api;

import java.time.Instant;
import java.util.List;

public record AdminOrderDetailResponse(
		String id,
		String displayNo,
		CustomerSummary customer,
		BuyerSummary buyer,
		ShippingSummary shipping,
		PricingSummary pricing,
		String paymentMethod,
		String paymentStatus,
		String refundStatus,
		String status,
		String internalNote,
		Instant placedAt,
		Instant paidAt,
		Instant updatedAt,
		List<ItemSummary> items,
		List<HistorySummary> history) {

	public record CustomerSummary(String id, String name, String status) {
	}

	public record BuyerSummary(String name, String email) {
	}

	public record ShippingSummary(String recipientName, String phone, String address) {
	}

	public record PricingSummary(String subtotal, String shippingFee, String discount, String total) {
	}

	public record ItemSummary(
			Long id,
			String productId,
			String variantId,
			String sku,
			String productName,
			String specification,
			String brandName,
			String imageUrl,
			String unitPrice,
			int quantity,
			String lineTotal) {
	}

	public record HistorySummary(
			String status,
			Instant occurredAt,
			String actorId,
			String actorName,
			String note,
			String label) {
	}
}
