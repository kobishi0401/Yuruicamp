package com.yuruicamp.backend.order.application;

/**
 * 會員主動要求通知（例如「使用 LINE 追蹤訂單」）；交易 commit 後派發給訂閱者。
 * 刻意與 {@link OrderStatusChangedEvent} 分開型別：這不是訂單狀態變更。
 */
public record OrderNotificationRequestedEvent(
		String orderId,
		String customerId,
		String displayNo,
		String status,
		String paymentStatus,
		String shippingMethod,
		String event) {
}
