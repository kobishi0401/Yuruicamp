package com.yuruicamp.backend.booking.api;

import java.time.LocalDate;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 用途：後台預約排程月曆「單日」可用性摘要（Admin UX ticket 03）。
 * 核心重點：供前端雙層 cell 渲染（狀態標籤 + 剩 X／Y）。
 * Single-day campground availability summary for admin calendar grid.
 */
@Schema(description = "營區單日可用性摘要")
public record AdminCampgroundDayAvailabilityResponse(
		@Schema(example = "2026-07-27") LocalDate date,
		@Schema(description = "是否公休") boolean isClosed,
		@Schema(description = "公休原因；非公休日可為 null") String closureReason,
		@Schema(description = "是否為特殊節日（calendar_dates）") boolean isHoliday,
		@Schema(description = "特殊節日名稱") String holidayName,
		@Schema(description = "可賣上限加總") int capacity,
		@Schema(description = "剩餘可賣加總") int remaining,
		@Schema(description = "已訂占用加總") int booked,
		@Schema(description = "停售占用加總") int blocked,
		@Schema(
				description = "月曆狀態",
				example = "available",
				allowableValues = { "available", "low", "full", "closed", "out_of_window" })
		String status) {
}
