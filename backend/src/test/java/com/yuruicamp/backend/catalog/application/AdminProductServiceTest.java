package com.yuruicamp.backend.catalog.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

import java.math.BigDecimal;
import java.util.List;

import com.yuruicamp.backend.catalog.api.AdminProductUpsertRequest;
import com.yuruicamp.backend.catalog.api.AdminProductVariantRequest;
import com.yuruicamp.backend.catalog.infrastructure.AdminProductReadRepository;
import com.yuruicamp.backend.catalog.infrastructure.BrandRepository;
import com.yuruicamp.backend.catalog.infrastructure.EquipmentImageRepository;
import com.yuruicamp.backend.catalog.infrastructure.EquipmentItemRepository;
import com.yuruicamp.backend.catalog.infrastructure.ProductCategoryRepository;
import com.yuruicamp.backend.catalog.infrastructure.ProductRepository;
import com.yuruicamp.backend.catalog.infrastructure.ProductVariantRepository;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.inventory.infrastructure.AdminInventoryMovementRepository;
import org.junit.jupiter.api.Test;

class AdminProductServiceTest {

	@Test
	void listRejectsSortOutsideWhitelist() {
		AdminProductService service = service();

		BusinessException error = assertThrows(BusinessException.class, () ->
				service.list(0, 20, "", "", null, "", "price,asc"));

		assertEquals(ErrorCode.VALIDATION_ERROR, error.getErrorCode());
	}

	@Test
	void activeProductRequiresActiveVariant() {
		AdminProductService service = service();
		AdminProductUpsertRequest request = new AdminProductUpsertRequest(
				"測試商品",
				null,
				1L,
				null,
				"active",
				List.of(),
				List.of(new AdminProductVariantRequest(
						null,
						"TEST-SKU",
						null,
						null,
						"標準規格",
						BigDecimal.TEN,
						"inactive",
						null)));

		BusinessException error = assertThrows(BusinessException.class, () -> service.create(request));

		assertEquals(ErrorCode.CONFLICT, error.getErrorCode());
	}

	private AdminProductService service() {
		return new AdminProductService(
				mock(ProductRepository.class),
				mock(EquipmentItemRepository.class),
				mock(ProductVariantRepository.class),
				mock(EquipmentImageRepository.class),
				mock(ProductCategoryRepository.class),
				mock(BrandRepository.class),
				mock(AdminProductReadRepository.class),
				mock(AdminInventoryMovementRepository.class));
	}
}
