package com.yuruicamp.backend.booking.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

// 一筆租借裝備需求；quantity 省略時 Service 預設為 1。
public record BookingAvailabilityRentalRequest(
		@NotBlank(message = "rentalListingId must not be blank") String rentalListingId,
		@Positive(message = "quantity must be greater than zero") Integer quantity) {
}
