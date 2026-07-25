package com.yuruicamp.backend.catalog.api;

import java.util.List;

import com.yuruicamp.backend.catalog.application.AdminProductService;
import com.yuruicamp.backend.common.api.ApiResponse;
import com.yuruicamp.backend.config.OpenApiConfig;
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

@RestController
@RequestMapping("/api/admin/products")
@SecurityRequirement(name = OpenApiConfig.FIREBASE_BEARER)
@Tag(name = "Admin Products", description = "後台商城商品、規格、圖片與上下架管理")
public class AdminProductController {

	private final AdminProductService adminProductService;

	public AdminProductController(AdminProductService adminProductService) {
		this.adminProductService = adminProductService;
	}

	// 查詢後台商品分頁列表，包含停用商品、規格、圖片與庫存摘要。
	@GetMapping
	@PreAuthorize("hasAuthority('products.view')")
	@Operation(summary = "商品列表", description = "RBAC: products.view")
	public ApiResponse<List<AdminProductResponse>> list(
			@RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "100") int size,
			@RequestParam(defaultValue = "") String q,
			@RequestParam(defaultValue = "") String status,
			@RequestParam(required = false) Long categoryId,
			@RequestParam(defaultValue = "") String brandId,
			@RequestParam(defaultValue = "id,asc") String sort) {
		var result = adminProductService.list(page, size, q, status, categoryId, brandId, sort);

		return ApiResponse.ok(result.data(), result.meta());
	}

	// 取得單一後台商品完整資料，包含停用規格與所有圖片。
	@GetMapping("/{id}")
	@PreAuthorize("hasAuthority('products.view')")
	@Operation(summary = "商品詳情", description = "RBAC: products.view")
	public ApiResponse<AdminProductResponse> get(@PathVariable String id) {
		return ApiResponse.ok(adminProductService.get(id));
	}

	// 取得商品表單可選的分類與品牌，送出時使用其 ID。
	@GetMapping("/lookups")
	@PreAuthorize("hasAuthority('products.view')")
	@Operation(summary = "商品分類與品牌選項", description = "RBAC: products.view")
	public ApiResponse<AdminProductLookupResponse> getLookups() {
		return ApiResponse.ok(adminProductService.getLookups());
	}

	// 建立商品、裝備主檔、規格與圖片；可選 stockLocations 寫入商城庫存（ADM-W2-08）。
	@PostMapping
	@PreAuthorize("hasAuthority('products.edit')")
	@Operation(summary = "建立商品", description = "RBAC: products.edit；可選寫入 stockLocations")
	public ApiResponse<AdminProductResponse> create(
			@Valid @RequestBody AdminProductUpsertRequest request) {
		return ApiResponse.ok(adminProductService.create(request));
	}

	// 原子更新商品主檔、規格與圖片；可選 stockLocations 寫入／更新商城庫存。
	@PutMapping("/{id}")
	@PreAuthorize("hasAuthority('products.edit')")
	@Operation(summary = "更新商品", description = "RBAC: products.edit；可選 stockLocations（Z2）")
	public ApiResponse<AdminProductResponse> update(
			@PathVariable String id,
			@Valid @RequestBody AdminProductUpsertRequest request) {
		return ApiResponse.ok(adminProductService.update(id, request));
	}

	// 將至少有一個有效規格的商品重新上架。
	@PostMapping("/{id}/activate")
	@PreAuthorize("hasAuthority('products.edit')")
	@Operation(summary = "上架商品", description = "RBAC: products.edit")
	public ApiResponse<AdminProductResponse> activate(@PathVariable String id) {
		return ApiResponse.ok(adminProductService.activate(id));
	}

	// 將商品下架，既有訂單與規格資料仍會保留。
	@PostMapping("/{id}/deactivate")
	@PreAuthorize("hasAuthority('products.edit')")
	@Operation(summary = "下架商品", description = "RBAC: products.edit")
	public ApiResponse<AdminProductResponse> deactivate(@PathVariable String id) {
		return ApiResponse.ok(adminProductService.deactivate(id));
	}
}
