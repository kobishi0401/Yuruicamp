package com.yuruicamp.backend.booking.api;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

/**
 * 用途：更新營位（不可改 id／campgroundId）；未傳欄位保留原值。
 * 核心重點：調降 `totalSites` 時 Service 會對照占用峰值，避免幽靈超訂。
 * Patch zone; lowering totalSites is validated against peak occupancy.
 */
public record AdminCampgroundZoneUpdateRequest(
		@Size(max = 64) String type,
		@Min(1) Integer capacityPerSite,
		@DecimalMin("0.00") BigDecimal priceWeekday,
		@DecimalMin("0.00") BigDecimal priceHoliday,
		@Min(1) Integer totalSites,
		Boolean active) {
}
