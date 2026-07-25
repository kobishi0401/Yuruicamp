package com.yuruicamp.backend.checkout.application;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

import com.yuruicamp.backend.coupon.application.CouponService;
import com.yuruicamp.backend.coupon.domain.CouponClaimStatus;
import com.yuruicamp.backend.inventory.infrastructure.ProductStockReservationRepository;
import com.yuruicamp.backend.order.domain.Order;
import com.yuruicamp.backend.order.domain.OrderItem;
import com.yuruicamp.backend.order.domain.OrderStatus;
import com.yuruicamp.backend.order.domain.OrderStatusHistory;
import com.yuruicamp.backend.order.domain.PaymentStatus;
import com.yuruicamp.backend.order.infrastructure.OrderRepository;
import com.yuruicamp.backend.order.infrastructure.OrderStatusHistoryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
// 在同一交易內取消逾時訂單、釋放保留庫存並寫入狀態歷程。
public class CheckoutExpirationService {

	private final OrderRepository orders;

	private final ProductStockReservationRepository reservations;

	private final OrderStatusHistoryRepository histories;

	private final CouponService couponService;

	// 準備逾時流程需要使用的訂單、保留帳與歷程元件。
	public CheckoutExpirationService(OrderRepository orders,
			ProductStockReservationRepository reservations,
			OrderStatusHistoryRepository histories,
			CouponService couponService) {
		this.orders = orders;
		this.reservations = reservations;
		this.histories = histories;
		this.couponService = couponService;
	}

	// 處理期限小於或等於指定時間的未付款結帳，並回傳取消筆數。
	@Transactional
	public int expireDueCheckouts(Instant now) {
		Objects.requireNonNull(now, "now must not be null");
		List<Order> dueOrders = orders.findDueForExpiration(
				PaymentStatus.unpaid, OrderStatus.cancelled, now);
		int expiredCount = 0;

		for (Order order : dueOrders) {
			if (!order.expire(now)) {
				continue;
			}

			// 系統逾時時將已綁定的 claim 標記為 expired。
			couponService.invalidateAppliedClaim(
					order.getId(),
					CouponClaimStatus.expired,
					now);
			List<Long> orderItemIds = order.getItems().stream()
					.map(OrderItem::getId)
					.toList();
			if (!orderItemIds.isEmpty()) {
				reservations.findActiveByOrderItemIdIn(orderItemIds)
						.forEach(reservation -> reservation.expire(now));
			}
			histories.save(OrderStatusHistory.of(
					order.getId(), OrderStatus.cancelled, now, "Checkout expired"));
			expiredCount++;
		}

		return expiredCount;
	}
}
