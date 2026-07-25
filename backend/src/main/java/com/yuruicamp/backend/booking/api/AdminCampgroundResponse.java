package com.yuruicamp.backend.booking.api;

import java.time.Instant;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 用途：後台營區主檔回應（含停用列與時間戳）。
 * 核心重點：後台列表永遠看得到全部營區；公開 Booking API 只回 active=true。
 * Admin campground response (includes inactive rows and timestamps).
 */
@Schema(description = "後台營區主檔資料")
public record AdminCampgroundResponse(
		@Schema(example = "C002") String id,
		@Schema(example = "雲海仙境露營區") String name,
		@Schema(example = "北部") String region,
		String description,
		boolean active,
		Instant createdAt,
		Instant updatedAt) {
}
