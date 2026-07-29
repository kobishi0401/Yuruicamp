package com.yuruicamp.backend.checkout.api;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

// 接收並驗證建立結帳需要的資料。
public record CheckoutCreateRequest(
		@NotEmpty
		List<@NotNull @Valid Item> items,
		@Size(max = 32)
		String paymentMethod,
		@Valid
		Shipping shipping,
		Long couponClaimId,
		@NotBlank
		@Size(max = 128)
		String idempotencyKey) {

	// 保留既有呼叫方式，未指定時代表建立不套券的 Checkout。
	public CheckoutCreateRequest(List<Item> items, String paymentMethod, Shipping shipping,
			String idempotencyKey) {
		this(items, paymentMethod, shipping, null, idempotencyKey);
	}

	// 表示一項要購買的商品規格與數量。
	public record Item(
			@NotBlank
			@Size(max = 64)
			String variantId,
			@Min(1)
			int quantity) {
	}

	// 表示訂單的收件資料。
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
