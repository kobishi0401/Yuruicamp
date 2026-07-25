package com.yuruicamp.backend.inventory.api;

/**
 * 庫存異動明細回應（含列級 from／to／lineReason／lineNature；ADM-W2-08）。
 */
public record AdminInventoryMovementItemResponse(
		long id,
		String inventoryDomain,
		String variantId,
		String sku,
		String productName,
		int quantity,
		String sourceLocationId,
		String destinationLocationId,
		String lineReason,
		String lineNature) {
}
