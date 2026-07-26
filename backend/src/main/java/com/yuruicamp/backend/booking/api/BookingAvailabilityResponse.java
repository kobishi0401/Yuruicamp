package com.yuruicamp.backend.booking.api;

import java.util.List;

// E-2 純查詢結果；reasons 使用契約鎖定的穩定代碼。
public record BookingAvailabilityResponse(
		boolean available,
		List<String> reasons,
		List<BookingZoneAvailabilityResponse> zones,
		List<BookingRentalAvailabilityResponse> rentals) {
}
