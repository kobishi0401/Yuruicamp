package com.yuruicamp.backend.catalog.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * brands — brand master used by equipment_items.
 * 品牌主檔（顯示名稱給商品 API 的 brand 欄位）。
 */
@Entity
@Table(name = "brands")
public class Brand {

	@Id
	@Column(length = 32)
	private String id;

	@Column(nullable = false, length = 120)
	private String name;

	@Column(name = "logo_url")
	private String logoUrl;

	@Column(name = "sort_order", nullable = false)
	private int sortOrder;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	public String getId() {
		return id;
	}

	public String getName() {
		return name;
	}

	public String getLogoUrl() {
		return logoUrl;
	}

	public int getSortOrder() {
		return sortOrder;
	}
}
