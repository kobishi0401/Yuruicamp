package com.yuruicamp.backend.booking.api;

import java.util.List;

// 回傳已建立或由冪等鍵回放的 Booking Checkout。
public record BookingCheckoutSessionResponse(
		String bookingId,
		String displayNo,
		String status,
		String paymentStatus,
		String paymentMethod,
		String checkoutExpiresAt,
		String campgroundId,
		String campgroundName,
		String region,
		String checkIn,
		String checkOut,
		int guestCount,
		int weekdayCount,
		int holidayCount,
		Pricing pricing,
		List<Zone> zones,
		List<Rental> rentals,
		String checkoutStep) {

	// 所有金額均為後端計算的兩位小數字串。
	public record Pricing(
			String zoneTotal,
			String rentalTotal,
			String discount,
			String finalAmount) {
	}

	// 營位回應保留建立當下的類型、價格與數量快照。
	public record Zone(
			String zoneId,
			String type,
			String priceWeekday,
			String priceHoliday,
			int quantity,
			String lineTotal) {
	}

	// 租借回應保留建立當下的 SKU、名稱、規格、價格與折扣快照。
	public record Rental(
			String rentalListingId,
			String rentalSkuVariantId,
			String sku,
			String name,
			String specification,
			String priceWeekday,
			String priceHoliday,
			String discountRate,
			int quantity,
			String lineTotal) {
	}
}
