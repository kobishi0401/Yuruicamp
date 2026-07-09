package com.Yuricamp.backend.order;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.util.List;

/**
 * 建立訂單請求時，必須包含顧客聯絡資料與購買商品項目。
 */
public record CreateOrderRequest(
        @NotBlank(message = "customerName is required")
        String customerName,

        @NotBlank(message = "customerEmail is required")
        @Email(message = "customerEmail must be valid")
        String customerEmail,

        @NotBlank(message = "customerPhone is required")
        String customerPhone,

        @NotEmpty(message = "items is required")
        @Valid
        List<Item> items
) {

    /**
     * 單一訂單商品項目，包含商品 ID 與購買數量。
     */
    public record Item(
            @NotNull(message = "productId is required")
            Long productId,

            @NotNull(message = "quantity is required")
            @Positive(message = "quantity must be positive")
            Integer quantity
    ) {
    }
}
