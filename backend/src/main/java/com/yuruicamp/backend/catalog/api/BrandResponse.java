package com.yuruicamp.backend.catalog.api;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 用途：定義首頁合作品牌公開 API 的固定欄位。
 * 核心重點：只回傳前台展示需要的品牌識別、名稱與 Logo。
 */
@Schema(description = "公開合作品牌資料")
public record BrandResponse(
		@Schema(example = "coleman") String id,
		@Schema(example = "Coleman") String name,
		String logoUrl) {
}
