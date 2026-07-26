package com.yuruicamp.backend.booking.api;

import java.util.List;

// 會員預約詳情包含表頭、金額與建立當下的營位／租借快照。
public record BookingDetailResponse(
		String bookingId,
		String displayNo,
		String status,
		String paymentStatus,
		String paymentMethod,
		String paidAt,
		String checkoutExpiresAt,
		String campgroundId,
		String campgroundName,
		String region,
		String checkIn,
		String checkOut,
		int guestCount,
		int weekdayCount,
		int holidayCount,
		BookingCheckoutSessionResponse.Pricing pricing,
		List<BookingCheckoutSessionResponse.Zone> zones,
		List<BookingCheckoutSessionResponse.Rental> rentals,
		String createdAt,
		String updatedAt) {
}
