package com.yuruicamp.backend.rental.api;

import java.util.List;

import com.yuruicamp.backend.common.api.ApiResponse;
import com.yuruicamp.backend.config.OpenApiConfig;
import com.yuruicamp.backend.rental.application.AdminRentalListingService;
import com.yuruicamp.backend.rental.application.AdminRentalService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 後台租借 SKU／規格管理（W2-03）。獨立路徑 {@code /api/admin/rentals}，
 * 不掛在 {@code /api/admin/products} 底下。
 *
 * <p>列表／詳情回傳唯讀 on-hand（{@code variants[].stockLocations}），對齊商店商品；
 * <b>不</b>接受庫存寫入——庫存異動走 G-3，跨領域轉換走 W2-05。
 * listing／每個營區的租金定價屬於 W2-04。</p>
 */
@RestController
@RequestMapping("/api/admin/rentals")
@SecurityRequirement(name = OpenApiConfig.FIREBASE_BEARER)
@Tag(name = "Admin Rentals", description = "後台租借 SKU／規格查詢、建立、更新與上下架（列表含唯讀庫存；寫庫存走 G-3／W2-05）")
public class AdminRentalController {

	private final AdminRentalService service;
	private final AdminRentalListingService listingService;

	public AdminRentalController(AdminRentalService service, AdminRentalListingService listingService) {
		this.service = service;
		this.listingService = listingService;
	}

	// 查詢後台租借 SKU 分頁列表，包含停用 SKU 與其規格。
	@GetMapping
	@PreAuthorize("hasAuthority('products.view')")
	@Operation(summary = "租借 SKU 列表", description = "RBAC: products.view")
	public ApiResponse<List<AdminRentalResponse>> list(
			@RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "100") int size,
			@RequestParam(defaultValue = "") String q,
			@RequestParam(defaultValue = "") String status,
			@RequestParam(required = false) Long categoryId,
			@RequestParam(defaultValue = "") String brandId,
			@RequestParam(defaultValue = "id,asc") String sort) {
		var result = service.list(page, size, q, status, categoryId, brandId, sort);

		return ApiResponse.ok(result.data(), result.meta());
	}

	// 取得單一租借 SKU 完整資料，包含停用規格。
	@GetMapping("/{id}")
	@PreAuthorize("hasAuthority('products.view')")
	@Operation(summary = "租借 SKU 詳情", description = "RBAC: products.view")
	public ApiResponse<AdminRentalResponse> get(@PathVariable String id) {
		return ApiResponse.ok(service.get(id));
	}

	// 同交易建立裝備主檔（新建）、租借 SKU 與規格，不建立初始庫存。
	@PostMapping
	@PreAuthorize("hasAuthority('products.edit')")
	@Operation(summary = "建立租借 SKU", description = "RBAC: products.edit；一律新建 equipment_item；庫存由 G-3 管理")
	public ApiResponse<AdminRentalResponse> create(@Valid @RequestBody AdminRentalUpsertRequest request) {
		return ApiResponse.ok(service.create(request));
	}

	// 原子更新裝備主檔、SKU 狀態與規格；未送出的既有規格改為停用。
	@PutMapping("/{id}")
	@PreAuthorize("hasAuthority('products.edit')")
	@Operation(summary = "更新租借 SKU", description = "RBAC: products.edit；不接受庫存欄位；缺少的規格改停用")
	public ApiResponse<AdminRentalResponse> update(
			@PathVariable String id,
			@Valid @RequestBody AdminRentalUpsertRequest request) {
		return ApiResponse.ok(service.update(id, request));
	}

	// 將至少有一個 active 規格的租借 SKU 重新上架。
	@PostMapping("/{id}/activate")
	@PreAuthorize("hasAuthority('products.edit')")
	@Operation(summary = "上架租借 SKU", description = "RBAC: products.edit")
	public ApiResponse<AdminRentalResponse> activate(@PathVariable String id) {
		return ApiResponse.ok(service.activate(id));
	}

	// 將租借 SKU 下架，既有規格與訂單快照仍保留。
	@PostMapping("/{id}/deactivate")
	@PreAuthorize("hasAuthority('products.edit')")
	@Operation(summary = "下架租借 SKU", description = "RBAC: products.edit")
	public ApiResponse<AdminRentalResponse> deactivate(@PathVariable String id) {
		return ApiResponse.ok(service.deactivate(id));
	}

	// 查詢這個租借 SKU 底下、所有營區的上架與定價（含已停用的 listing）。
	@GetMapping("/{id}/listings")
	@PreAuthorize("hasAuthority('products.view')")
	@Operation(summary = "租借上架列表", description = "RBAC: products.view；W2-04")
	public ApiResponse<List<AdminRentalListingResponse>> listListings(@PathVariable String id) {
		return ApiResponse.ok(listingService.list(id));
	}

	// 整組取代這個租借 SKU 底下的營區上架：出現的 upsert，沒出現的既有 listing 改成停用（不硬刪）。
	@PutMapping("/{id}/listings")
	@PreAuthorize("hasAuthority('products.edit')")
	@Operation(
			summary = "同步租借上架與定價",
			description = "RBAC: products.edit；W2-04；缺少的既有 listing 改為停用，不硬刪")
	public ApiResponse<List<AdminRentalListingResponse>> replaceListings(
			@PathVariable String id,
			@Valid @RequestBody AdminRentalListingSyncRequest request) {
		return ApiResponse.ok(listingService.replace(id, request));
	}
}
