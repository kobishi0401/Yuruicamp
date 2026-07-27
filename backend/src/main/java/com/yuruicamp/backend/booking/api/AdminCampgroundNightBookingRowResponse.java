package com.yuruicamp.backend.booking.api;

import java.time.LocalDate;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 用途：後台預約排程「單晚占用列」（Admin UX follow-up ticket 02）。
 * Single occupying booking row for one campground night in admin calendar detail.
 */
@Schema(description = "營區單晚占用預約列")
public record AdminCampgroundNightBookingRowResponse(
		@Schema(example = "42") String bookingId,
		@Schema(example = "BK-0042") String displayNo,
		@Schema(example = "U001") String customerId,
		@Schema(example = "王小明") String customerName,
		@Schema(example = "Z001") String zoneId,
		@Schema(example = "草皮區") String zoneType,
		@Schema(description = "該 zone 當晚占用帳數") int quantity,
		@Schema(example = "confirmed") String status,
		@Schema(example = "2026-07-28") LocalDate checkIn,
		@Schema(example = "2026-07-30") LocalDate checkOut) {
}
