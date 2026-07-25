package com.yuruicamp.backend.rental.api;

/**
 * 租借規格在單一租借庫位的唯讀庫存（對齊商店 {@code AdminProductStockLocationResponse}）。
 * Read-only on-hand at one rental inventory location.
 *
 * <p>{@code locationId} 為 {@code inventory_locations.id}（例如 {@code RENTAL-C002}）；
 * 前端可用既有 {@code fromApiMinStockLocationId} 轉成 UI 營區碼 {@code C002}。</p>
 */
public record AdminRentalStockLocationResponse(
		String locationId,
		String locationCode,
		String locationType,
		String locationName,
		int onHandQuantity,
		int reservedQuantity,
		int availableQuantity) {
}
