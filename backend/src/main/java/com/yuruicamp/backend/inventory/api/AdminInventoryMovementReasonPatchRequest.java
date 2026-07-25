package com.yuruicamp.backend.inventory.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** PATCH 表頭 reason（draft／posted 皆可；不更新 employee_id）。 */
public record AdminInventoryMovementReasonPatchRequest(
		@NotBlank @Size(max = 1000) String reason) {
}
