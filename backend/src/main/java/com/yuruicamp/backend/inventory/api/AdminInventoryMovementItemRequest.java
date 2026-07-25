package com.yuruicamp.backend.inventory.api;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 草稿明細：正整數數量＋列級 from／to（NULL＝UI ---）＋選填備註／異動性質（ADM-W2-08）。
 *
 * <p>{@code lineNature} 白名單（Service 驗證）：receipt／transfer／stocktake／damage／write_off
 * （UI：進貨／移轉／盤點／折損／損耗）。與 from／to 無關，可手動改。
 */
public record AdminInventoryMovementItemRequest(
		@NotBlank @Size(max = 64) String variantId,
		@Min(1) @Max(1000000) int quantity,
		@Size(max = 32) String sourceLocationId,
		@Size(max = 32) String destinationLocationId,
		@Size(max = 1000) String lineReason,
		@Size(max = 32) String lineNature) {
}
