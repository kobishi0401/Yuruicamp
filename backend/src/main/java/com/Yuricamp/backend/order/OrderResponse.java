package com.Yuricamp.backend.order;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * 訂單 API 回應 DTO，提供訂單完成頁與訂單查詢頁使用。
 */
public record OrderResponse(
        String orderNo,
        String customerName,
        String customerEmail,
        String customerPhone,
        OrderStatus status,
        BigDecimal totalAmount,
        OffsetDateTime createdAt,
        List<Item> items
) {

    /**
     * 將訂單 Entity 轉成 API 回應格式。
     */
    public static OrderResponse from(CustomerOrder order) {
        return new OrderResponse(
                order.getOrderNo(),
                order.getCustomerName(),
                order.getCustomerEmail(),
                order.getCustomerPhone(),
                order.getStatus(),
                order.getTotalAmount(),
                order.getCreatedAt(),
                order.getItems().stream().map(Item::from).toList()
        );
    }

    /**
     * 訂單明細回應 DTO，保留前端顯示需要的欄位。
     */
    public record Item(
            Long productId,
            String productName,
            BigDecimal unitPrice,
            Integer quantity,
            BigDecimal subtotal
    ) {

        /**
         * 將訂單明細 Entity 轉成 API 回應格式。
         */
        public static Item from(OrderItem item) {
            return new Item(
                    item.getProductId(),
                    item.getProductName(),
                    item.getUnitPrice(),
                    item.getQuantity(),
                    item.getSubtotal()
            );
        }
    }
}
