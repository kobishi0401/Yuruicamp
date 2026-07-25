package com.yuruicamp.backend.catalog.api;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Contract v0.4 product (SPU) — see docs/api/product-api-contract.md
 */
@Schema(description = "Storefront product (SPU) per Product API Contract v0.4")
public record ProductResponse(
		@Schema(example = "P001") String id,
		@Schema(example = "E001") String itemId,
		@Schema(example = "active") String status,
		@Schema(example = "Coleman 六人帳篷") String name,
		@Schema(nullable = true, example = "帳篷") String category,
		@Schema(nullable = true, example = "Coleman") String brand,
		@Schema(nullable = true) String description,
		@Schema(nullable = true, example = "/assets/images/products/P001-1.jpg") String image,
		@Schema(description = "Min active variant price (string money)", example = "3200.00") String price,
		@Schema(description = "Average formal review rating, fixed to one decimal", example = "4.6") String rating,
		@Schema(description = "Formal review count", example = "35") long reviewCount,
		@Schema(description = "商品標籤；新品與熱銷由 Seed 寫入 equipment_tags", example = "[\"新品\", \"熱銷\"]")
		List<String> tags,
		List<ProductVariantResponse> variants) {
}
