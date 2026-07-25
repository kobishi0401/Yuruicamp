package com.yuruicamp.backend.booking.api;

import jakarta.validation.constraints.Size;

/**
 * 用途：更新營區主檔（不可改 id）；未傳的欄位保留原值。
 * 核心重點：`active` 就是「啟停」開關——傳 false 即停用，傳 true 即復用；
 *          不需要另外開 activate／deactivate 端點。
 * Patch campground (id immutable); omitted fields keep existing values.
 * `active` doubles as the enable/disable toggle.
 */
public record AdminCampgroundUpdateRequest(
		@Size(max = 150) String name,
		@Size(max = 100) String region,
		String description,
		Boolean active) {
}
