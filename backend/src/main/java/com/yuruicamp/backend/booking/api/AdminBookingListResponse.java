package com.yuruicamp.backend.booking.api;

import java.time.Instant;
import java.time.LocalDate;

public record AdminBookingListResponse(
		String id,
		String displayNo,
		String customerId,
		String customerName,
		String campgroundId,
		String campgroundName,
		String region,
		LocalDate checkIn,
		LocalDate checkOut,
		int guestCount,
		boolean hasRental,
		String finalAmount,
		String paymentStatus,
		String status,
		Instant createdAt,
		Instant updatedAt) {
}
