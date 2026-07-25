package com.yuruicamp.backend.catalog.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import com.yuruicamp.backend.catalog.api.ProductResponse;
import com.yuruicamp.backend.catalog.api.ProductVariantResponse;
import com.yuruicamp.backend.catalog.domain.Brand;
import com.yuruicamp.backend.catalog.domain.EquipmentItem;
import com.yuruicamp.backend.catalog.domain.Product;
import com.yuruicamp.backend.catalog.domain.ProductCategory;
import com.yuruicamp.backend.catalog.domain.ProductVariant;

import org.springframework.stereotype.Component;

/**
 * Maps JPA entities → Product API Contract v0.1 DTOs.
 * Entity → 契約 DTO；金額格式化集中在這裡，Controller 不要自己 toString。
 */
@Component
public class ProductCatalogAssembler {

	public ProductResponse toResponse(Product product, String imageUrl, Map<String, Long> availabilityByVariantId) {
		// 用途：把商品實體及指定圖片網址組裝成對外的商品回應 DTO。
		// 核心重點：只公開 active 規格、固定規格排序，並集中處理最低價與關聯資料的 null 值。
		List<ProductVariantResponse> variants = product.getVariants().stream()
				.filter(v -> "active".equals(v.getStatus()))
				// 同時 JOIN FETCH tags 與 variants 時 SQL 會產生組合列，先依規格 ID 去重。
				.collect(Collectors.toMap(
						ProductVariant::getId,
						variant -> variant,
						(first, duplicate) -> first))
				.values().stream()
				.sorted(Comparator.comparing(ProductVariant::getId))
				.map(variant -> toVariant(variant, availabilityByVariantId))
				.toList();

		EquipmentItem item = product.getItem();
		ProductCategory category = item.getCategory();
		Brand brand = item.getBrand();

		return new ProductResponse(
				product.getId(),
				item.getId(),
				product.getStatus(),
				item.getName(),
				category != null ? category.getName() : null,
				brand != null ? brand.getName() : null,
				item.getDescription(),
				imageUrl,
				minPrice(variants),
				"0.0",
				0,
				item.getTags().stream().sorted().toList(),
				variants);
	}

	public ProductResponse toResponse(Product product, String imageUrl) {
		return toResponse(product, imageUrl, Map.of());
	}

	public ProductResponse toResponse(Product product, Map<String, String> imageByItemId) {
		// 用途：從「器材 ID → 圖片網址」對照表取得商品主圖，再沿用主要組裝流程。
		// 核心重點：以 EquipmentItem ID 查圖，避免清單中的每項商品各自再查一次資料庫。
		String image = imageByItemId.get(product.getItem().getId());
		return toResponse(product, image);
	}

	public ProductResponse toResponse(
			Product product,
			Map<String, String> imageByItemId,
			Map<String, Long> availabilityByVariantId) {
		String image = imageByItemId.get(product.getItem().getId());

		return toResponse(product, image, availabilityByVariantId);
	}

	private ProductVariantResponse toVariant(ProductVariant variant, Map<String, Long> availabilityByVariantId) {
		// 用途：把商品規格實體轉成 API 使用的規格 DTO。
		// 核心重點：價格必須透過 money 統一輸出為兩位小數字串。
		long availableQuantity = availabilityByVariantId.getOrDefault(variant.getId(), 0L);

		return new ProductVariantResponse(
				variant.getId(),
				variant.getSku(),
				variant.getColor(),
				variant.getSize(),
				variant.getSpecification(),
				money(variant.getPrice()),
				availableQuantity,
				availableQuantity > 0);
	}

	/**
	 * 用途：依 API 契約把金額轉成固定兩位小數的字串。
	 * 核心重點：使用 HALF_UP 四捨五入，並以 toPlainString 避免科學記號。
	 */
	static String money(BigDecimal value) {
		return value.setScale(2, RoundingMode.HALF_UP).toPlainString();
	}

	private static String minPrice(List<ProductVariantResponse> variants) {
		// 用途：計算所有有效規格中的最低售價。
		// 核心重點：以 BigDecimal 比較避免浮點誤差；沒有規格時依契約回傳 0.00。
		return variants.stream()
				.map(ProductVariantResponse::price)
				.map(BigDecimal::new)
				.min(Comparator.naturalOrder())
				.map(ProductCatalogAssembler::money)
				.orElse("0.00");
	}
}
