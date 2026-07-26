package com.yuruicamp.backend.booking.api;

import java.time.LocalDate;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 用途：後台預約排程月曆區間可用性（Admin UX ticket 03）。
 * Admin campground availability range for booking schedule calendar.
 */
@Schema(description = "營區區間可用性")
public record AdminCampgroundAvailabilityResponse(
		@Schema(example = "C002") String campgroundId,
		@Schema(description = "營位 slug；未篩選時為 __ALL__", example = "__ALL__") String zoneId,
		@Schema(example = "2026-07-01") LocalDate from,
		@Schema(example = "2026-07-31") LocalDate to,
		@Schema(description = "區間內 scope 的可賣上限（加總）") int capacity,
		List<AdminCampgroundDayAvailabilityResponse> days) {
}
