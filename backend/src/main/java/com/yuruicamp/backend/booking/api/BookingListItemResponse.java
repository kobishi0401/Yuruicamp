package com.yuruicamp.backend.booking.api;

// 會員預約列表只回傳辨識與摘要欄位，避免每一列都載入明細。
public record BookingListItemResponse(
		String bookingId,
		String displayNo,
		String status,
		String paymentStatus,
		String campgroundName,
		String region,
		String checkIn,
		String checkOut,
		int guestCount,
		String finalAmount,
		String createdAt) {
}
