package com.yuruicamp.backend.catalog.api;

import java.util.List;

import com.yuruicamp.backend.catalog.application.BrandCatalogService;
import com.yuruicamp.backend.common.api.ApiResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 用途：提供不需登入的合作品牌公開讀取端點。
 * 核心重點：Controller 只呼叫 Service 並包裝共用 Envelope。
 */
@RestController
@RequestMapping("/api/brands")
@Tag(name = "Brands", description = "公開合作品牌資料")
public class BrandController {

	private final BrandCatalogService brandCatalogService;

	public BrandController(BrandCatalogService brandCatalogService) {
		this.brandCatalogService = brandCatalogService;
	}

	@GetMapping
	@Operation(summary = "取得全部合作品牌")
	public ApiResponse<List<BrandResponse>> list() {
		return ApiResponse.ok(brandCatalogService.listBrands());
	}
}
