package com.yuruicamp.backend.booking.api;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record AdminBookingDetailResponse(
		String id,
		String displayNo,
		CustomerSummary customer,
		ContactSummary contact,
		String campgroundId,
		String campgroundName,
		String region,
		LocalDate checkIn,
		LocalDate checkOut,
		int guestCount,
		int weekdayCount,
		int holidayCount,
		String paymentMethod,
		String paymentStatus,
		Instant paidAt,
		String status,
		String internalNote,
		PricingSummary pricing,
		Instant createdAt,
		Instant updatedAt,
		List<ZoneSummary> zones,
		List<RentalSummary> rentals,
		List<HistorySummary> history) {

	public record CustomerSummary(String id, String name, String status) {
	}

	public record ContactSummary(String name, String phone, String email) {
	}

	public record PricingSummary(String zoneTotal, String rentalTotal, String discount, String finalAmount) {
	}

	public record ZoneSummary(
			String zoneId, String type, String priceWeekday, String priceHoliday, int quantity,
			String lineTotal) {
	}

	public record RentalSummary(
			String rentalListingId, String rentalSkuVariantId, String sku, String name,
			String specification, String priceWeekday, String priceHoliday,
			String discountRate, int quantity, String lineTotal) {
	}

	public record HistorySummary(
			String status, Instant occurredAt, String actorId, String actorName, String note, String label) {
	}
}
