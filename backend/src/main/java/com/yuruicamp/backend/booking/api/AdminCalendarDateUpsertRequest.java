package com.yuruicamp.backend.booking.api;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 用途：標記或取消某日的「特殊節日」（影響特殊節日價 tier，見 Booking 契約 §0.1）。
 * 核心重點：`isHoliday=false` 時後端會刪除該日列（恢復為一般日）；`holidayName` 僅在 isHoliday=true 時可填。
 * Upsert special-holiday flag for one calendar day.
 */
public record AdminCalendarDateUpsertRequest(
		@NotNull Boolean isHoliday,
		@Size(max = 120) String holidayName) {
}
