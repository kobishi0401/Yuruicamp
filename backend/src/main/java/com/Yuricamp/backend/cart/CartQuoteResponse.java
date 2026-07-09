package com.Yuricamp.backend.cart;

import java.math.BigDecimal;
import java.util.List;

/**
 * 購物車試算回應，提供前端確認頁需要的明細與總金額。
 */
public record CartQuoteResponse(List<Item> items, BigDecimal totalAmount) {
    /**
     * 單一試算明細，保留商品名稱、單價、數量與小計。
     * record 自動建立建構子、getter、toString
     */
    public record Item(
            Long productId,
            String productName,
            BigDecimal unitPrice,
            Integer quantity,
            BigDecimal subtotal
    ) {
    }
}
