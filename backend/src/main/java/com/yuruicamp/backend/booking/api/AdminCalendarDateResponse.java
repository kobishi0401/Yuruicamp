package com.yuruicamp.backend.booking.api;

import java.time.Instant;
import java.time.LocalDate;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 用途：後台假日曆單日回應。
 * 核心重點：GET 區間會補齊每一天；無 DB 列時 isHoliday=false（一般日）。
 * Admin calendar day; missing DB row means general day (not special holiday).
 */
@Schema(description = "假日曆單日（特殊節日標記）")
public record AdminCalendarDateResponse(
		@Schema(example = "2026-10-10") LocalDate calendarDate,
		@Schema(description = "是否走特殊節日價 tier") boolean isHoliday,
		@Schema(example = "國慶日") String holidayName,
		@Schema(description = "有 DB 列時才有；admin 寫入為 admin-manual") String sourceVersion,
		Instant effectiveAt,
		Instant updatedAt) {
}
