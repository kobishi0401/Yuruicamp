package com.yuruicamp.backend.booking.api;

import java.time.LocalDate;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 用途：後台預約排程「單晚占用列表」回應包裝。
 * Admin campground night occupancy list for calendar day detail.
 */
@Schema(description = "營區單晚占用預約列表")
public record AdminCampgroundNightBookingsResponse(
		@Schema(example = "C002") String campgroundId,
		@Schema(example = "2026-07-29") LocalDate date,
		@Schema(description = "查詢 scope；全部為 __ALL__", example = "__ALL__") String zoneId,
		List<AdminCampgroundNightBookingRowResponse> rows) {
}
