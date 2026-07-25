package com.yuruicamp.backend.catalog.api;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 商品規格在某商城庫位的目標 on-hand（ADM-W2-08）。
 * <p>省略整個 stockLocations＝不改庫存；陣列內未出現的 location＝不改該列；明示 0＝清零。
 */
public record AdminProductStockLocationRequest(
		@NotBlank @Size(max = 32) String locationId,
		@NotNull @Min(0) Integer onHandQuantity) {
}
