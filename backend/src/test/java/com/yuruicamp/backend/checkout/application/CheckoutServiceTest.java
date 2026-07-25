package com.yuruicamp.backend.checkout.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import com.yuruicamp.backend.catalog.domain.EquipmentItem;
import com.yuruicamp.backend.catalog.domain.Product;
import com.yuruicamp.backend.catalog.domain.ProductVariant;
import com.yuruicamp.backend.catalog.infrastructure.EquipmentImageRepository;
import com.yuruicamp.backend.checkout.api.CheckoutCreateRequest;
import com.yuruicamp.backend.checkout.api.CheckoutSessionResponse;
import com.yuruicamp.backend.checkout.api.CheckoutUpdateRequest;
import com.yuruicamp.backend.checkout.infrastructure.CheckoutProductRepository;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.customer.domain.Customer;
import com.yuruicamp.backend.customer.infrastructure.CustomerRepository;
import com.yuruicamp.backend.coupon.application.CouponService;
import com.yuruicamp.backend.coupon.domain.CouponClaimStatus;
import com.yuruicamp.backend.inventory.domain.InventoryStock;
import com.yuruicamp.backend.inventory.infrastructure.InventoryStockRepository;
import com.yuruicamp.backend.inventory.infrastructure.ProductStockReservationRepository;
import com.yuruicamp.backend.order.domain.Order;
import com.yuruicamp.backend.order.domain.OrderItem;
import com.yuruicamp.backend.order.domain.OrderStatus;
import com.yuruicamp.backend.order.domain.PaymentStatus;
import com.yuruicamp.backend.order.infrastructure.OrderRepository;
import com.yuruicamp.backend.order.infrastructure.OrderStatusHistoryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import com.yuruicamp.backend.branch.infrastructure.BranchRepository;

// 驗證建立結帳的冪等與空值處理。
class CheckoutServiceTest {

	private CustomerRepository customers;
	private CheckoutProductRepository products;
	private InventoryStockRepository stocks;
	private ProductStockReservationRepository reservations;
	private OrderRepository orders;
	private OrderStatusHistoryRepository histories;
	private EquipmentImageRepository images;
	private CouponService couponService;
	private BranchRepository branches;
	private CheckoutService service;

	// 每個測試開始前建立乾淨的模擬元件。
	@BeforeEach
	void setUp() {
		customers = mock(CustomerRepository.class);
		products = mock(CheckoutProductRepository.class);
		stocks = mock(InventoryStockRepository.class);
		reservations = mock(ProductStockReservationRepository.class);
		orders = mock(OrderRepository.class);
		histories = mock(OrderStatusHistoryRepository.class);
		images = mock(EquipmentImageRepository.class);
		couponService = mock(CouponService.class);
		branches = mock(BranchRepository.class);
		when(couponService.appliedClaimId(any())).thenReturn(null);
		service = new CheckoutService(customers, products, stocks, reservations, orders, histories, images,
				couponService, branches);
	}

	// 相同請求重送時應回傳原本的訂單。
	@Test
	void sameIdempotencyKeyReturnsOriginalCheckoutWithoutCreatingAgain() {
		AtomicReference<Order> savedOrder = arrangeSuccessfulCreation();
		CheckoutCreateRequest request = request("checkout-key-001", null);

		CheckoutSessionResponse first = service.create("C001", request);
		CheckoutSessionResponse replay = service.create("C001", request);

		assertThat(replay.orderId()).isEqualTo(first.orderId());
		assertThat(replay.shipping().recipientName()).isEqualTo("PENDING_CHECKOUT");
		assertThat(replay.shipping().phone()).isEqualTo("PENDING_CHECKOUT");
		assertThat(savedOrder.get().getCheckoutIdempotencyKey()).isEqualTo("checkout-key-001");
		assertThat(savedOrder.get().getCheckoutRequestHash()).hasSize(64);
		verify(orders).saveAndFlush(any(Order.class));
	}

	// 相同冪等鍵搭配不同內容時應回傳衝突。
	@Test
	void reusedIdempotencyKeyWithDifferentPayloadReturnsConflict() {
		arrangeSuccessfulCreation();
		service.create("C001", request("checkout-key-002", null));

		CheckoutCreateRequest changed = request("checkout-key-002",
				new CheckoutCreateRequest.Shipping("delivery", "Amy", "0912345678", "台北市", null));

		assertThatThrownBy(() -> service.create("C001", changed))
				.isInstanceOfSatisfying(BusinessException.class, ex ->
						assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.CONFLICT));
	}

	// 沒有冪等鍵時不應存取資料庫。
	@Test
	void missingIdempotencyKeyIsRejectedBeforeDatabaseAccess() {
		CheckoutCreateRequest request = request(" ", null);

		assertThatThrownBy(() -> service.create("C001", request))
				.isInstanceOfSatisfying(BusinessException.class, ex ->
						assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
		verify(customers, never()).findByIdForCheckout(any());
	}

	// 庫存不足時應顯示商品名稱與剩餘數量，不顯示內部規格 ID。
	@Test
	void insufficientStockReturnsProductNameAndAvailableQuantity() {
		arrangeSuccessfulCreation();
		InventoryStock stock = mock(InventoryStock.class);
		when(stock.getLocationId()).thenReturn("L001");
		when(stock.getOnHandQuantity()).thenReturn(2);
		when(stocks.lockStoreStocksByVariantId("V001")).thenReturn(List.of(stock));
		when(reservations.activeQuantity("V001", "L001")).thenReturn(0);
		CheckoutCreateRequest request = new CheckoutCreateRequest(
				List.of(new CheckoutCreateRequest.Item("V001", 3)),
				"ecpay-credit",
				null,
				"checkout-stock-insufficient");

		assertThatThrownBy(() -> service.create("C001", request))
				.isInstanceOfSatisfying(BusinessException.class, ex -> {
					assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.STOCK_INSUFFICIENT);
					assertThat(ex.getDetails()).hasSize(1);
					assertThat(ex.getDetails().getFirst().field()).isEqualTo("stock");
					assertThat(ex.getDetails().getFirst().reason())
							.isEqualTo("測試商品商品數量剩餘: 2");
				});
	}

	// 更新完整收件資料後應進入可付款狀態並保存付款方式。
	@Test
	void updateCompletesDraftAndChangesPaymentMethod() {
		Order order = editableOrder(Instant.now().plusSeconds(300));
		when(orders.findForCustomerForUpdate("O-C4", "C001"))
				.thenReturn(Optional.of(order));
		CheckoutUpdateRequest request = new CheckoutUpdateRequest(
				new CheckoutUpdateRequest.Shipping("delivery", " 王小明 ", " 0912345678 ", " 台北市信義區 ", null),
				"cod",
				null);

		CheckoutSessionResponse response = service.update("C001", "O-C4", request);

		assertThat(response.checkoutStep()).isEqualTo("ready_to_pay");
		assertThat(response.paymentMethod()).isEqualTo("cod");
		assertThat(response.shipping().recipientName()).isEqualTo("王小明");
		assertThat(response.shipping().phone()).isEqualTo("0912345678");
		assertThat(response.shipping().address()).isEqualTo("台北市信義區");
		assertThat(response.couponClaimId()).isNull();
	}

	// 不屬於目前會員的訂單不可更新。
	@Test
	void updateRejectsOrderOwnedByAnotherCustomer() {
		when(orders.findForCustomerForUpdate("O-C4", "C001"))
				.thenReturn(Optional.empty());
		CheckoutUpdateRequest request = paymentUpdate("cod");

		assertThatThrownBy(() -> service.update("C001", "O-C4", request))
				.isInstanceOfSatisfying(BusinessException.class, ex ->
						assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.FORBIDDEN));
	}

	// 已付款 Checkout 不可再修改。
	@Test
	void updateRejectsPaidCheckout() {
		Order order = editableOrder(Instant.now().plusSeconds(300));
		ReflectionTestUtils.setField(order, "paymentStatus", PaymentStatus.paid);
		when(orders.findForCustomerForUpdate("O-C4", "C001"))
				.thenReturn(Optional.of(order));

		assertThatThrownBy(() -> service.update("C001", "O-C4", paymentUpdate("cod")))
				.isInstanceOfSatisfying(BusinessException.class, ex ->
						assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.CONFLICT));
	}

	// 已取消或已到期 Checkout 應回傳 CHECKOUT_EXPIRED。
	@Test
	void updateRejectsCancelledAndExpiredCheckout() {
		Order cancelled = editableOrder(Instant.now().plusSeconds(300));
		cancelled.cancel();
		Order expired = editableOrder(Instant.now().minusSeconds(1));
		when(orders.findForCustomerForUpdate("O-CANCELLED", "C001"))
				.thenReturn(Optional.of(cancelled));
		when(orders.findForCustomerForUpdate("O-EXPIRED", "C001"))
				.thenReturn(Optional.of(expired));

		assertThatThrownBy(() -> service.update("C001", "O-CANCELLED", paymentUpdate("cod")))
				.isInstanceOfSatisfying(BusinessException.class, ex ->
						assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.CHECKOUT_EXPIRED));
		assertThatThrownBy(() -> service.update("C001", "O-EXPIRED", paymentUpdate("cod")))
				.isInstanceOfSatisfying(BusinessException.class, ex ->
						assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.CHECKOUT_EXPIRED));
		assertThat(cancelled.getStatus()).isEqualTo(OrderStatus.cancelled);
	}

	// F-2 支援在既有 Checkout 套用會員優惠券。
	@Test
	void updateAppliesCouponClaim() {
		Order order = editableOrder(Instant.now().plusSeconds(300));
		when(orders.findForCustomerForUpdate("O-C4", "C001"))
				.thenReturn(Optional.of(order));
		when(couponService.applyToOrder(
				org.mockito.ArgumentMatchers.eq(order),
				org.mockito.ArgumentMatchers.eq("C001"),
				org.mockito.ArgumentMatchers.eq(99L),
				org.mockito.ArgumentMatchers.any(Instant.class)))
				.thenReturn(99L);
		when(couponService.appliedClaimId("O-C4")).thenReturn(99L);
		CheckoutUpdateRequest request = new CheckoutUpdateRequest(null, "cod", 99L);

		CheckoutSessionResponse response = service.update("C001", "O-C4", request);

		assertThat(response.couponClaimId()).isEqualTo(99L);
		verify(couponService).applyToOrder(
				org.mockito.ArgumentMatchers.eq(order),
				org.mockito.ArgumentMatchers.eq("C001"),
				org.mockito.ArgumentMatchers.eq(99L),
				org.mockito.ArgumentMatchers.any(Instant.class));
	}

	// 本人讀取 Checkout 時應回傳同一份訂單與商品快照。
	@Test
	void getReturnsOwnedCheckoutSnapshot() {
		Order order = editableOrder(Instant.now().plusSeconds(300));
		when(orders.findForCustomer("O-C4", "C001"))
				.thenReturn(Optional.of(order));

		CheckoutSessionResponse response = service.get("C001", " O-C4 ");

		assertThat(response.orderId()).isEqualTo("O-C4");
		assertThat(response.paymentStatus()).isEqualTo("unpaid");
		assertThat(response.checkoutStep()).isEqualTo("draft");
	}

	// 他人的 Checkout 不可由目前會員讀取。
	@Test
	void getRejectsOrderOwnedByAnotherCustomer() {
		when(orders.findForCustomer("O-OTHER", "C001"))
				.thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.get("C001", "O-OTHER"))
				.isInstanceOfSatisfying(BusinessException.class, ex ->
						assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.FORBIDDEN));
	}

	// 空白訂單 ID 應在查詢資料庫前被拒絕。
	@Test
	void getRejectsBlankOrderId() {
		assertThatThrownBy(() -> service.get("C001", " "))
				.isInstanceOfSatisfying(BusinessException.class, ex ->
						assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));

		verify(orders, never()).findForCustomer(any(), any());
	}

	// COD 成立時應在同一流程消耗目前訂單已套用的優惠券。
	@Test
	void confirmCodConsumesAppliedCouponClaim() {
		Order order = new Order();
		order.initialize("O-COD", "C001", "cod-key", "cod-request-hash",
				"Buyer", "buyer@example.com", "Buyer", "Taipei",
				"0912345678", com.yuruicamp.backend.order.domain.ShippingMethod.delivery, null,
				com.yuruicamp.backend.order.domain.PaymentMethod.cod,
				Instant.now(), Instant.now().plusSeconds(300));
		order.setPricing(new BigDecimal("100.00"), BigDecimal.ZERO, new BigDecimal("20.00"));
		when(orders.findForCustomerForUpdate("O-COD", "C001")).thenReturn(Optional.of(order));
		when(couponService.appliedClaimId("O-COD")).thenReturn(99L);
		when(reservations.findActiveByOrderItemIdIn(List.of())).thenReturn(List.of());

		CheckoutSessionResponse response = service.confirmCod("C001", "O-COD");

		assertThat(response.checkoutStep()).isEqualTo("completed");
		assertThat(response.couponClaimId()).isEqualTo(99L);
		verify(couponService).consumeAppliedClaim(
				org.mockito.ArgumentMatchers.eq("O-COD"),
				org.mockito.ArgumentMatchers.any(Instant.class));
	}

	// 會員主動取消時應撤銷訂單已綁定的優惠券。
	@Test
	void cancelRevokesAppliedCouponClaim() {
		Order order = editableOrder(Instant.now().plusSeconds(300));
		when(orders.findForCustomerForUpdate("O-C4", "C001")).thenReturn(Optional.of(order));
		when(reservations.findActiveByOrderItemIdIn(List.of())).thenReturn(List.of());

		CheckoutSessionResponse response = service.cancel("C001", "O-C4");

		assertThat(response.status()).isEqualTo("cancelled");
		verify(couponService).invalidateAppliedClaim(
				org.mockito.ArgumentMatchers.eq("O-C4"),
				org.mockito.ArgumentMatchers.eq(CouponClaimStatus.revoked),
				org.mockito.ArgumentMatchers.any(Instant.class));
	}

	// 不支援的付款方式應回傳驗證錯誤。
	@Test
	void updateRejectsUnsupportedPaymentMethod() {
		Order order = editableOrder(Instant.now().plusSeconds(300));
		when(orders.findForCustomerForUpdate("O-C4", "C001"))
				.thenReturn(Optional.of(order));

		assertThatThrownBy(() -> service.update("C001", "O-C4", paymentUpdate("cash")))
				.isInstanceOfSatisfying(BusinessException.class, ex ->
						assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
	}

	// 準備測試建立訂單需要的商品、庫存與會員資料。
	private AtomicReference<Order> arrangeSuccessfulCreation() {
		Customer customer = new Customer();
		customer.setId("C001");
		AtomicReference<Order> savedOrder = new AtomicReference<>();
		when(customers.findByIdForCheckout("C001")).thenReturn(Optional.of(customer));
		when(orders.findByCheckoutIdempotencyKey("C001", "checkout-key-001"))
				.thenAnswer(invocation -> Optional.ofNullable(savedOrder.get()));
		when(orders.findByCheckoutIdempotencyKey("C001", "checkout-key-002"))
				.thenAnswer(invocation -> Optional.ofNullable(savedOrder.get()));

		ProductVariant variant = mock(ProductVariant.class);
		Product product = mock(Product.class);
		EquipmentItem equipment = mock(EquipmentItem.class);
		InventoryStock stock = mock(InventoryStock.class);
		when(variant.getId()).thenReturn("V001");
		when(variant.getSku()).thenReturn("SKU-001");
		when(variant.getSpecification()).thenReturn("標準");
		when(variant.getPrice()).thenReturn(new BigDecimal("100.00"));
		when(variant.getProduct()).thenReturn(product);
		when(product.getId()).thenReturn("P001");
		when(product.getItem()).thenReturn(equipment);
		when(equipment.getId()).thenReturn("E001");
		when(equipment.getName()).thenReturn("測試商品");
		when(stock.getLocationId()).thenReturn("L001");
		when(stock.getOnHandQuantity()).thenReturn(10);
		when(products.findSellableById("V001")).thenReturn(Optional.of(variant));
		when(stocks.lockStoreStocksByVariantId("V001")).thenReturn(List.of(stock));
		when(reservations.activeQuantity("V001", "L001")).thenReturn(0);
		when(images.findByItemIdAndSortOrder("E001", 0)).thenReturn(Optional.empty());
		when(orders.saveAndFlush(any(Order.class))).thenAnswer(invocation -> {
			Order order = invocation.getArgument(0);
			long itemId = 1L;
			for (OrderItem item : order.getItems()) {
				ReflectionTestUtils.setField(item, "id", itemId++);
			}
			savedOrder.set(order);
			return order;
		});
		return savedOrder;
	}

	// 建立只有一項商品的測試請求。
	private static CheckoutCreateRequest request(String idempotencyKey,
			CheckoutCreateRequest.Shipping shipping) {
		return new CheckoutCreateRequest(
				List.of(new CheckoutCreateRequest.Item("V001", 1)),
				"ecpay-credit", shipping, idempotencyKey);
	}

	// 建立可供 C-4 更新的待付款 Checkout。
	private static Order editableOrder(Instant expiresAt) {
		Order order = new Order();
		order.initialize("O-C4", "C001", "c4-key", "c4-request-hash",
				"Buyer", "buyer@example.com", "PENDING_CHECKOUT", "PENDING_CHECKOUT",
				"PENDING_CHECKOUT", com.yuruicamp.backend.order.domain.ShippingMethod.delivery, null,
				com.yuruicamp.backend.order.domain.PaymentMethod.ecpay_credit,
				Instant.now(), expiresAt);

		return order;
	}

	// 建立只修改付款方式的 C-4 請求。
	private static CheckoutUpdateRequest paymentUpdate(String paymentMethod) {
		return new CheckoutUpdateRequest(null, paymentMethod, null);
	}
}
