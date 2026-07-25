package com.yuruicamp.backend.inventory.api;

import jakarta.validation.constraints.Size;

/**
 * PATCH 明細備註／異動性質（省略＝不改；空字串清成 null；不更新表頭 employee_id）。
 *
 * <p>{@code lineNature} 白名單：receipt／transfer／stocktake／damage／write_off。
 */
public record AdminInventoryMovementLineReasonPatchRequest(
		@Size(max = 1000) String lineReason,
		@Size(max = 32) String lineNature) {
}
