package com.yuruicamp.backend.booking.api;

import java.time.Instant;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 用途：後台營位回應（含停用列；金額固定兩位小數字串，對齊公開 Zone）。
 * Admin zone response; money fields are two-decimal strings like public API.
 */
@Schema(description = "後台營位／區域主檔")
public record AdminCampgroundZoneResponse(
		@Schema(example = "Z001") String id,
		@Schema(example = "C002") String campgroundId,
		@Schema(example = "草皮區") String type,
		int capacityPerSite,
		@Schema(example = "1000.00") String priceWeekday,
		@Schema(example = "1500.00") String priceHoliday,
		int totalSites,
		boolean active,
		Instant createdAt,
		Instant updatedAt) {
}
