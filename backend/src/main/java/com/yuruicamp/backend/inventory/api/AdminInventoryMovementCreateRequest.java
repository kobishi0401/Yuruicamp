package com.yuruicamp.backend.inventory.api;

import java.time.Instant;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 建立庫存異動草稿表頭。
 *
 * <ul>
 *   <li>{@code product_stock_update} + {@code store}：表頭庫位雙 NULL（ADM-W2-08 稽核單）</li>
 *   <li>{@code transfer} + {@code rental}：表頭必填兩個不同租借庫位（營地互轉；post 會改 on-hand）</li>
 * </ul>
 */
public record AdminInventoryMovementCreateRequest(
		@NotBlank @Pattern(regexp = "store|rental") String inventoryDomain,
		@NotBlank @Pattern(regexp = "product_stock_update|transfer") String movementType,
		@Size(max = 32) String sourceLocationId,
		@Size(max = 32) String destinationLocationId,
		@NotBlank @Size(max = 1000) String reason,
		Instant occurredAt) {
}
