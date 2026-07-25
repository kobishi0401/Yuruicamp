package com.yuruicamp.backend.rental.api;

import java.time.Instant;
import java.util.List;

/**
 * 後台租借規格回應；含唯讀庫存摘要（對齊商店 variant 的 onHand／stockLocations）。
 * Admin rental SKU variant response with read-only stock summary.
 *
 * <p>庫存寫入仍走 G-3／W2-05（異動、conversions），本欄位只供後台列表／調撥 Modal 顯示。</p>
 */
public record AdminRentalVariantResponse(
		String id,
		String sku,
		String color,
		String size,
		String specification,
		String status,
		int onHandQuantity,
		int reservedQuantity,
		int availableQuantity,
		List<AdminRentalStockLocationResponse> stockLocations,
		Instant createdAt,
		Instant updatedAt) {
}
