package com.yuruicamp.backend.catalog.api;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 後台商品建立與更新輸入：主檔、規格、圖片；規格可選帶 {@code stockLocations} 寫商城庫存（ADM-W2-08）。
 * 仍不接受前端胖物件（branch map／totalStock／rentalEnabled／camp 等）。
 */
public record AdminProductUpsertRequest(
		@NotBlank @Size(max = 200) String name,
		@Size(max = 20000) String description,
		@NotNull Long categoryId,
		@Size(max = 32) String brandId,
		@NotBlank @Pattern(regexp = "active|inactive") String status,
		@Size(max = 20) List<@Valid AdminProductImageRequest> images,
		@NotEmpty @Size(max = 100) List<@Valid AdminProductVariantRequest> variants) {
}
