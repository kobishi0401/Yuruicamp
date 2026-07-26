package com.yuruicamp.backend.order.api;

import java.util.List;

// 回傳會員自己的訂單快照，不公開 Checkout 冪等資料。
public record MemberOrderResponse(
		String id,
		String displayNo,
		String customerId,
		String buyerName,
		String buyerEmail,
		String recipientName,
		String shippingAddress,
		String shippingPhone,
		String subtotal,
		String shippingFee,
		String discount,
		String total,
		String paymentMethod,
		String paymentStatus,
		String refundStatus,
		String status,
		String placedAt,
		String paidAt,
		String checkoutExpiresAt,
		List<Item> items) {

	// 回傳下單當下保存的商品快照與後端計算的小計。
	public record Item(
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
}
