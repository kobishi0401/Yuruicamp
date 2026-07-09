package com.Yuricamp.backend.cart;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.util.List;

/**
 * 在最後結算購物車價格時，重新去資料庫撈取正確的金額，避免 localStorage 被竄改
 */
public record CartQuoteRequest(
        @NotEmpty(message = "items is required")
        @Valid
        List<Item> items
) {

    /**
     * 單一試算商品項目，包含商品 ID 與購買數量。
     */
    public record Item(
            @NotNull(message = "productId is required")
            Long productId,

            @NotNull(message = "quantity is required")
            @Positive(message = "quantity must be positive") // 必須大於零
            Integer quantity
    ) {
    }
}
