package com.yuruicamp.backend.checkout.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

// 接收更新結帳收件資料與付款方式的內容。
public record CheckoutUpdateRequest(
		@Valid
		Shipping shipping,
		@Size(max = 32)
		String paymentMethod,
		Long couponClaimId) {

	// 表示可個別更新的收件資料欄位，null 代表保留原值。
	public record Shipping(
			@Size(max = 16)
			String method,
			@Size(max = 100)
			String recipientName,
			@Size(max = 32)
			String phone,
			@Size(max = 500)
			String address,
			@Size(max = 32)
			String pickupBranchId,
			@Size(max = 10)
			String cvsStoreId,
			@Size(max = 100)
			String cvsStoreName,
			@Size(max = 20)
			String cvsSubType) {

		public Shipping(String method, String recipientName, String phone, String address, String pickupBranchId) {
			this(method, recipientName, phone, address, pickupBranchId, null, null, null);
		}
	}
}
