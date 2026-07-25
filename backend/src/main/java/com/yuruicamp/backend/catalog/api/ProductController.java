package com.yuruicamp.backend.catalog.api;

import java.math.BigDecimal;
import java.util.List;

import com.yuruicamp.backend.catalog.application.ProductCatalogService;
import com.yuruicamp.backend.catalog.application.ProductCatalogService.PagedProducts;
import com.yuruicamp.backend.common.api.ApiResponse;
import com.yuruicamp.backend.common.api.PageMeta;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.validation.annotation.Validated;

/**
 * Public product read APIs (線 B：Catalog).
 *
 * <p><b>契約真相</b>：{@code docs/api/product-api-contract.md}（v0.3）</p>
 *
 * <h2>給新手：新增一支「公開讀」API 的固定步驟</h2>
 * <ol>
 *   <li>在 {@code docs/api/…-contract.md} 寫死路徑與欄位（先文件、後程式）</li>
 *   <li>Entity 對齊 {@code docs/latest_schema.sql}（database-first，不要讓 Hibernate 建表）</li>
 *   <li>Repository 查資料（需要關聯就 JOIN FETCH）</li>
 *   <li>Application Service 寫用例（組裝、過濾、丟 {@code BusinessException}）</li>
 *   <li>Controller 只做：接參數 → 呼叫 Service → {@code ApiResponse.ok(...)}</li>
 *   <li>在 {@link com.yuruicamp.backend.config.SecurityConfig} 把 GET 設成 {@code permitAll}</li>
 *   <li>Postman／Swagger 驗收；前端 Mock 正規化成同一契約</li>
 * </ol>
 *
 * <p>B-3 分頁、B-4 篩選、B-7 branches：註解寫在 {@link ProductCatalogService}。</p>
 */
@RestController
@Validated
@RequestMapping("/api/products")
@Tag(name = "Catalog", description = "Public product catalog (Contract v0.4)")
public class ProductController {

	private final ProductCatalogService productCatalogService;

	public ProductController(ProductCatalogService productCatalogService) {
		this.productCatalogService = productCatalogService;
	}

	@GetMapping
	@Operation(
			summary = "List sellable products",
			description = """
					B-1/B-3: Returns a page of active products with active variants.
					Response shape is locked by docs/api/product-api-contract.md (v0.3).
					No auth required.
					""")
	public ApiResponse<List<ProductResponse>> list(
			@Parameter(description = "Zero-based page number", example = "0")
			@RequestParam(defaultValue = "0") @Min(value = 0, message = "must be greater than or equal to 0") int page,
			@Parameter(description = "Page size (1-100)", example = "20")
			@RequestParam(defaultValue = "20") @Min(value = 1, message = "must be at least 1") @Max(value = 100, message = "must be at most 100") int size,
			@Parameter(
					description = "Allowed: id,asc|desc; name,asc|desc; createdAt,asc|desc",
					example = "createdAt,desc")
			@RequestParam(defaultValue = "id,asc") String sort,
			@Parameter(description = "分類名稱，忽略大小寫", example = "帳篷")
			@RequestParam(required = false) String category,
			@Parameter(description = "品牌名稱，忽略大小寫", example = "Coleman")
			@RequestParam(required = false) String brand,
			@Parameter(description = "規格最低價格下限，含邊界", example = "1000.00")
			@RequestParam(required = false) BigDecimal minPrice,
			@Parameter(description = "規格價格上限，含邊界", example = "5000.00")
			@RequestParam(required = false) BigDecimal maxPrice) {
		PagedProducts result = productCatalogService.listProducts(
				page,
				size,
				sort,
				category,
				brand,
				minPrice,
				maxPrice);
		PageMeta meta = result.meta();
		return ApiResponse.ok(result.data(), meta);
	}

	// 取得熱銷商品，銷量由後端訂單資料計算。
	@GetMapping("/bestsellers")
	@Operation(
			summary = "取得熱銷商品",
			description = "只回傳有有效訂單銷量的商品，依銷量降序排列且不需要登入。")
	public ApiResponse<List<ProductResponse>> listBestsellers(
			@Parameter(description = "回傳筆數（1-100）", example = "20")
			@RequestParam(defaultValue = "6")
			@Min(value = 1, message = "must be at least 1")
			@Max(value = 100, message = "must be at most 100") int limit) {
		return ApiResponse.ok(productCatalogService.listBestsellers(limit));
	}

	@GetMapping("/{id}")
	@Operation(
			summary = "Get product by id",
			description = """
					B-2: Single product detail. 404 NOT_FOUND if missing or not sellable.
					No auth required.
					""")
	public ApiResponse<ProductResponse> getById(
			@Parameter(description = "products.id", example = "P001") @PathVariable String id) {
		return ApiResponse.ok(productCatalogService.getProduct(id));
	}
}
