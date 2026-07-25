package com.yuruicamp.backend.inventory.api;

import java.time.Instant;
import java.util.List;

/**
 * 後台庫存異動表頭與明細的完整回應。
 *
 * <p>{@code conversionId}／{@code pairedMovementId}：若此單屬於商店↔租借轉換配對則有值
 * （列表會隱藏 {@code conversion_in}，畫面上以 CVT-xxx 合併顯示）。
 */
public record AdminInventoryMovementResponse(
		long id,
		String movementNo,
		String inventoryDomain,
		String movementType,
		String status,
		String sourceLocationId,
		String sourceLocationName,
		String destinationLocationId,
		String destinationLocationName,
		String employeeId,
		String employeeName,
		String reason,
		Instant occurredAt,
		Instant postedAt,
		Instant createdAt,
		Instant updatedAt,
		Long conversionId,
		Long pairedMovementId,
		List<AdminInventoryMovementItemResponse> items) {
}
