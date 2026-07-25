package com.yuruicamp.backend.checkout.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import com.yuruicamp.backend.coupon.application.CouponService;
import com.yuruicamp.backend.coupon.domain.CouponClaimStatus;
import com.yuruicamp.backend.inventory.domain.ProductStockReservation;
import com.yuruicamp.backend.inventory.infrastructure.ProductStockReservationRepository;
import com.yuruicamp.backend.order.domain.Order;
import com.yuruicamp.backend.order.domain.OrderItem;
import com.yuruicamp.backend.order.domain.OrderStatus;
import com.yuruicamp.backend.order.domain.OrderStatusHistory;
import com.yuruicamp.backend.order.domain.PaymentMethod;
import com.yuruicamp.backend.order.domain.PaymentStatus;
import com.yuruicamp.backend.order.infrastructure.OrderRepository;
import com.yuruicamp.backend.order.infrastructure.OrderStatusHistoryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

// 驗證結帳逾時規則、庫存釋放與重複執行的冪等性。
class CheckoutExpirationServiceTest {

	private static final Instant NOW = Instant.parse("2026-07-21T08:00:00Z");

	private OrderRepository orders;

	private ProductStockReservationRepository reservations;

	private OrderStatusHistoryRepository histories;

	private CouponService couponService;

	private CheckoutExpirationService service;

	// 每個測試開始前建立乾淨的模擬資料庫元件。
	@BeforeEach
	void setUp() {
		orders = mock(OrderRepository.class);
		reservations = mock(ProductStockReservationRepository.class);
		histories = mock(OrderStatusHistoryRepository.class);
		couponService = mock(CouponService.class);
		service = new CheckoutExpirationService(orders, reservations, histories, couponService);
	}

	// 已到期未付款訂單應取消，active 保留帳應改成 expired。
	@Test
	void expiredUnpaidCheckoutIsCancelledAndReservationExpires() {
		Order order = orderDueAt(NOW.minusSeconds(1));
		OrderItem item = addItem(order, 41L);
		ProductStockReservation reservation = ProductStockReservation.active(
				item.getId(), "V001", "L001", 1, "expiry-41",
				NOW.minusSeconds(900), NOW.minusSeconds(1));
		whenDueOrdersReturn(order);
		when(reservations.findActiveByOrderItemIdIn(List.of(41L)))
				.thenReturn(List.of(reservation));

		int count = service.expireDueCheckouts(NOW);

		assertThat(count).isEqualTo(1);
		assertThat(order.getStatus()).isEqualTo(OrderStatus.cancelled);
		assertThat(reservation.getStatus()).isEqualTo("expired");
		assertThat(reservation.getReleasedAt()).isEqualTo(NOW);
		verify(couponService).invalidateAppliedClaim(
				"O-EXPIRY-TEST",
				CouponClaimStatus.expired,
				NOW);
		verify(histories).save(any(OrderStatusHistory.class));
	}

	// 到期時間剛好等於目前時間時仍應處理。
	@Test
	void expirationAtNowIsIncluded() {
		Order order = orderDueAt(NOW);
		whenDueOrdersReturn(order);

		assertThat(service.expireDueCheckouts(NOW)).isEqualTo(1);
		assertThat(order.getStatus()).isEqualTo(OrderStatus.cancelled);
	}

	// 尚未到期的訂單即使被查出也不應改變。
	@Test
	void futureCheckoutIsIgnoredByDomainGuard() {
		Order order = orderDueAt(NOW.plusSeconds(1));
		whenDueOrdersReturn(order);

		assertThat(service.expireDueCheckouts(NOW)).isZero();
		assertThat(order.getStatus()).isEqualTo(OrderStatus.unshipped);
		verify(histories, never()).save(any());
	}

	// 已付款訂單不應被逾時流程取消。
	@Test
	void paidCheckoutIsIgnoredByDomainGuard() {
		Order order = orderDueAt(NOW.minusSeconds(1));
		ReflectionTestUtils.setField(order, "paymentStatus", PaymentStatus.paid);
		whenDueOrdersReturn(order);

		assertThat(service.expireDueCheckouts(NOW)).isZero();
		assertThat(order.getStatus()).isEqualTo(OrderStatus.unshipped);
		verify(histories, never()).save(any());
	}

	// 已取消訂單重複掃描時不得再新增歷程。
	@Test
	void repeatedExpirationIsIdempotent() {
		Order order = orderDueAt(NOW.minusSeconds(1));
		whenDueOrdersReturn(order);

		assertThat(service.expireDueCheckouts(NOW)).isEqualTo(1);
		assertThat(service.expireDueCheckouts(NOW.plusSeconds(60))).isZero();
		verify(histories, times(1)).save(any(OrderStatusHistory.class));
	}

	// 建立指定結帳期限的未付款測試訂單。
	private static Order orderDueAt(Instant expiresAt) {
		Order order = new Order();
		order.initialize("O-EXPIRY-TEST", "C001", "expiry-key", "request-hash",
				"Buyer", "buyer@example.com", "Recipient", "Address", "0912345678",
				com.yuruicamp.backend.order.domain.ShippingMethod.delivery, null,
				PaymentMethod.ecpay_credit, NOW.minusSeconds(900), expiresAt);

		return order;
	}

	// 加入帶有資料庫識別碼的訂單明細。
	private static OrderItem addItem(Order order, long itemId) {
		OrderItem item = OrderItem.snapshot(order, "P001", "V001", "SKU-001",
				"測試商品", "標準", "測試品牌", null, new BigDecimal("100.00"), 1);
		ReflectionTestUtils.setField(item, "id", itemId);
		order.addItem(item);

		return item;
	}

	// 讓 Repository 模擬鎖定並回傳指定訂單。
	private void whenDueOrdersReturn(Order order) {
		when(orders.findDueForExpiration(PaymentStatus.unpaid, OrderStatus.cancelled, NOW))
				.thenReturn(List.of(order));
		when(orders.findDueForExpiration(PaymentStatus.unpaid, OrderStatus.cancelled, NOW.plusSeconds(60)))
				.thenReturn(List.of(order));
	}
}
