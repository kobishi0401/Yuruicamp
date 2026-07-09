package com.Yuricamp.backend.catalog;

import java.math.BigDecimal;

/**
 * 商品 API 回應 DTO，只回傳前端需要的商品欄位。
 */
public record ProductResponse(
        Long id,
        String name,
        String description,
        String category,
        BigDecimal price,
        Integer stockQuantity,
        String imageUrl,
        ProductStatus status
) {

    /**
     * 將 Product Entity 轉成 API 回應格式。
     */
    public static ProductResponse from(Product product) {
        return new ProductResponse(
                product.getId(),
                product.getName(),
                product.getDescription(),
                product.getCategory(),
                product.getPrice(),
                product.getStockQuantity(),
                product.getImageUrl(),
                product.getStatus()
        );
    }
}
