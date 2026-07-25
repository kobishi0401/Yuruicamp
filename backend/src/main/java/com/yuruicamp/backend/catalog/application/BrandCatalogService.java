package com.yuruicamp.backend.catalog.application;

import java.util.List;

import com.yuruicamp.backend.catalog.api.BrandResponse;
import com.yuruicamp.backend.catalog.domain.Brand;
import com.yuruicamp.backend.catalog.infrastructure.BrandRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 用途：提供首頁合作品牌公開列表。
 * 核心重點：沿用品牌主檔排序，但不把後台時間欄位暴露給前台。
 */
@Service
public class BrandCatalogService {

	private final BrandRepository brandRepository;

	public BrandCatalogService(BrandRepository brandRepository) {
		this.brandRepository = brandRepository;
	}

	@Transactional(readOnly = true)
	public List<BrandResponse> listBrands() {
		return brandRepository.findAllByOrderBySortOrderAscIdAsc().stream()
				.map(this::toResponse)
				.toList();
	}

	private BrandResponse toResponse(Brand brand) {
		return new BrandResponse(
				brand.getId(),
				brand.getName(),
				brand.getLogoUrl());
	}
}
