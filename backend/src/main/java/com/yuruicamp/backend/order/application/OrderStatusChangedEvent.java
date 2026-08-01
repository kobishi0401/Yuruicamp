package com.yuruicamp.backend.order.application;

/**
 * 訂單狀態變更成功並交易 commit 後發佈；訂閱者（例如 n8n 推播）不可影響本次訂單操作結果。
 */
public record OrderStatusChangedEvent(
		String orderId,
		String customerId,
		String displayNo,
		String status,
		String paymentStatus,
		String shippingMethod,
		String event) {
}
