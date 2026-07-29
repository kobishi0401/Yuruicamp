package com.yuruicamp.backend.checkout.api;

import java.util.List;

// 回傳目前 Checkout 草稿、價格、商品與收件資料。
public record CheckoutSessionResponse(
		String orderId,
		String displayNo,
		String paymentStatus,
		String paymentMethod,
		String status,
		String checkoutExpiresAt,
		Pricing pricing,
		List<Item> items,
		Shipping shipping,
		Long couponClaimId,
		String checkoutStep) {

	// 表示由後端計算的 Checkout 金額。
	public record Pricing(String subtotal, String shippingFee, String discount, String total) {
	}

	// 表示 Checkout 中的一筆商品快照。
	public record Item(
			long orderItemId,
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

	// 表示 Checkout 的收件資料。
	public record Shipping(String method, String recipientName, String phone, String address,
			String pickupBranchId, String pickupBranchName,
			String cvsStoreId, String cvsStoreName, String cvsSubType) {
	}
}
