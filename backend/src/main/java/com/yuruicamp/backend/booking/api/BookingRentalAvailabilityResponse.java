package com.yuruicamp.backend.booking.api;

// 單一 listing 在指定住宿區間的可租量查詢結果。
public record BookingRentalAvailabilityResponse(
		String rentalListingId,
		int requested,
		int availableQuantity) {
}
