package com.yuruicamp.backend.booking.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 用途：建立營區主檔（客戶端提供 slug id，例如 C010）。
 * 核心重點：`active` 可省略，預設 true；tags／zones 本版不做（→ W4-02／另開）。
 * Create campground with client-provided slug id; `active` defaults to true when omitted.
 */
public record AdminCampgroundCreateRequest(
		@NotBlank @Size(max = 32) String id,
		@NotBlank @Size(max = 150) String name,
		@NotBlank @Size(max = 100) String region,
		String description,
		Boolean active) {
}
