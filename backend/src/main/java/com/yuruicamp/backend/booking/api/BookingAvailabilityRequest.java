package com.yuruicamp.backend.booking.api;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

// E-2 可用性查詢請求；zones 與 rentals 至少需有一項。
public record BookingAvailabilityRequest(
		@NotBlank(message = "campgroundId must not be blank") String campgroundId,
		String checkIn,
		String checkOut,
		List<@Valid BookingAvailabilityZoneRequest> zones,
		List<@Valid BookingAvailabilityRentalRequest> rentals) {
}
