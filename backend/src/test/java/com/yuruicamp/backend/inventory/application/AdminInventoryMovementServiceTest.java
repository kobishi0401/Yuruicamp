package com.yuruicamp.backend.inventory.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.inventory.api.AdminInventoryMovementCreateRequest;
import com.yuruicamp.backend.inventory.infrastructure.AdminInventoryMovementRepository;
import org.junit.jupiter.api.Test;

class AdminInventoryMovementServiceTest {

	@Test
	void listRejectsSortOutsideWhitelist() {
		AdminInventoryMovementService service = service();

		BusinessException error = assertThrows(BusinessException.class, () ->
				service.list(0, 20, "", "", "", "", "reason,asc"));

		assertEquals(ErrorCode.VALIDATION_ERROR, error.getErrorCode());
	}

	@Test
	void createRejectsLegacyReceiptType() {
		AdminInventoryMovementService service = service();
		AdminInventoryMovementCreateRequest request = new AdminInventoryMovementCreateRequest(
				"store",
				"receipt",
				null,
				"DESTINATION",
				"測試進貨",
				null);

		BusinessException error = assertThrows(BusinessException.class, () ->
				service.createDraft("ADMIN", request));

		// @Pattern on DTO would also fail in MVC；此處直接呼叫 service 時 Pattern 未跑，
		// service 內 validateCreatePayload 會擋非 product_stock_update（若通過 Pattern）
		// 單元測試建構函式仍可傳 receipt 字串 → VALIDATION_ERROR
		assertEquals(ErrorCode.VALIDATION_ERROR, error.getErrorCode());
	}

	@Test
	void productStockUpdateRejectsHeaderLocations() {
		AdminInventoryMovementService service = service();
		AdminInventoryMovementCreateRequest request = new AdminInventoryMovementCreateRequest(
				"store",
				"product_stock_update",
				"SOURCE",
				null,
				"盤點",
				null);

		BusinessException error = assertThrows(BusinessException.class, () ->
				service.createDraft("ADMIN", request));

		assertEquals(ErrorCode.VALIDATION_ERROR, error.getErrorCode());
	}

	@Test
	void storeTransferIsRejected() {
		// W2-08 後商城調撥不再走 movements；只允許 rental transfer
		AdminInventoryMovementService service = service();
		AdminInventoryMovementCreateRequest request = new AdminInventoryMovementCreateRequest(
				"store",
				"transfer",
				"STORE-A",
				"STORE-B",
				"不應建立",
				null);

		BusinessException error = assertThrows(BusinessException.class, () ->
				service.createDraft("ADMIN", request));

		assertEquals(ErrorCode.VALIDATION_ERROR, error.getErrorCode());
	}

	@Test
	void rentalTransferRequiresDifferentLocations() {
		AdminInventoryMovementService service = service();
		AdminInventoryMovementCreateRequest request = new AdminInventoryMovementCreateRequest(
				"rental",
				"transfer",
				"RENTAL-C001",
				"RENTAL-C001",
				"同營區",
				null);

		BusinessException error = assertThrows(BusinessException.class, () ->
				service.createDraft("ADMIN", request));

		assertEquals(ErrorCode.VALIDATION_ERROR, error.getErrorCode());
	}

	private AdminInventoryMovementService service() {
		return new AdminInventoryMovementService(mock(AdminInventoryMovementRepository.class));
	}
}
