package com.yuruicamp.backend.catalog.infrastructure;

import java.util.List;

import com.yuruicamp.backend.catalog.domain.Brand;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 品牌主檔查詢入口，後台商品只接受已存在的品牌 ID。
 */
public interface BrandRepository extends JpaRepository<Brand, String> {

	List<Brand> findAllByOrderBySortOrderAscIdAsc();
}
