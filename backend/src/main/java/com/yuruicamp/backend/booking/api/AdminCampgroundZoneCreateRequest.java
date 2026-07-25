package com.yuruicamp.backend.booking.api;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 用途：在指定營區下建立營位（客戶端提供 slug id）。
 * 核心重點：`campgroundId` 由 URL 路徑決定；金額用 BigDecimal，Service 會格式化成兩位小數字串回傳。
 * Create zone under campground; campgroundId comes from path, not body.
 */
public record AdminCampgroundZoneCreateRequest(
		@NotBlank @Size(max = 32) String id,
		@NotBlank @Size(max = 64) String type,
		@Min(1) Integer capacityPerSite,
		@NotNull @DecimalMin("0.00") BigDecimal priceWeekday,
		@NotNull @DecimalMin("0.00") BigDecimal priceHoliday,
		@NotNull @Min(1) Integer totalSites,
		Boolean active) {
}
