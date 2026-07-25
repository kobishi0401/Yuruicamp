package com.yuruicamp.backend.payment.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.coupon.domain.OrderCoupon;
import com.yuruicamp.backend.coupon.infrastructure.CouponClaimRepository;
import com.yuruicamp.backend.coupon.infrastructure.OrderCouponRepository;
import com.yuruicamp.backend.inventory.domain.ProductStockReservation;
import com.yuruicamp.backend.inventory.infrastructure.ProductStockReservationRepository;
import com.yuruicamp.backend.order.domain.Order;
import com.yuruicamp.backend.order.domain.OrderItem;
import com.yuruicamp.backend.order.domain.OrderStatus;
import com.yuruicamp.backend.order.domain.OrderStatusHistory;
import com.yuruicamp.backend.order.domain.PaymentStatus;
import com.yuruicamp.backend.order.infrastructure.OrderRepository;
import com.yuruicamp.backend.order.infrastructure.OrderStatusHistoryRepository;
import com.yuruicamp.backend.payment.domain.PaymentNotifyOutcome;
import com.yuruicamp.backend.payment.infrastructure.EcpayGateway;
import com.yuruicamp.backend.payment.infrastructure.PaymentNotificationRepository;
import com.yuruicamp.backend.payment.infrastructure.PaymentNotificationRepository.PayableKind;
import com.yuruicamp.backend.payment.infrastructure.PaymentNotificationRepository.PayableTarget;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * ECPay Notify 入帳服務（D-3）。
 *
 * <p>流程（新手可照順序讀）：
 * <ol>
 *   <li>驗 CheckMacValue；失敗 → {@link PaymentNotifyOutcome#SIGNATURE_INVALID}</li>
 *   <li>解析 MerchantTradeNo／CustomField1 → 訂單或預約</li>
 *   <li>若冪等鍵已存在 → 不改狀態，回 IGNORED_DUPLICATE</li>
 *   <li>RtnCode≠1 或金額不符或已取消 → 寫 failed，回 FAILED</li>
 *   <li>已 paid → 寫 ignored_duplicate，回 IGNORED_DUPLICATE</li>
 *   <li>否則 mark paid＋副作用（庫存 fulfilled／券 consumed），寫 success</li>
 * </ol>
 */
@Service
public class PaymentNotifyService {

	private static final Logger log = LoggerFactory.getLogger(PaymentNotifyService.class);
	private static final String PROVIDER_OK = "1";

	private final EcpayGateway ecpayGateway;
	private final PaymentNotificationRepository notifications;
	private final OrderRepository orders;
	private final OrderStatusHistoryRepository orderHistories;
	private final ProductStockReservationRepository productReservations;
	private final OrderCouponRepository orderCoupons;
	private final CouponClaimRepository couponClaims;
	private final ObjectMapper objectMapper;

	public PaymentNotifyService(
			EcpayGateway ecpayGateway,
			PaymentNotificationRepository notifications,
			OrderRepository orders,
			OrderStatusHistoryRepository orderHistories,
			ProductStockReservationRepository productReservations,
			OrderCouponRepository orderCoupons,
			CouponClaimRepository couponClaims,
			ObjectMapper objectMapper) {
		this.ecpayGateway = ecpayGateway;
		this.notifications = notifications;
		this.orders = orders;
		this.orderHistories = orderHistories;
		this.productReservations = productReservations;
		this.orderCoupons = orderCoupons;
		this.couponClaims = couponClaims;
		this.objectMapper = objectMapper;
	}

	/**
	 * 處理綠界 form POST 參數。
	 * 成功／冪等／業務失敗都應由 Controller 回 {@code 1|OK}；只有驗簽失敗例外。
	 */
	@Transactional
	public PaymentNotifyOutcome handleNotify(Map<String, String> rawParams) {
		Map<String, String> params = normalize(rawParams);
		if (!ecpayGateway.verifyNotify(params)) {
			log.warn("ECPay notify CheckMacValue invalid, merchantTradeNo={}",
					params.get("MerchantTradeNo"));
			return PaymentNotifyOutcome.SIGNATURE_INVALID;
		}

		String merchantTradeNo = trimToEmpty(params.get("MerchantTradeNo"));
		String providerTradeNo = trimToNull(params.get("TradeNo"));
		String rtnCode = trimToEmpty(params.get("RtnCode"));
		Instant now = Instant.now();
		String payloadJson = toJson(params);

		if (merchantTradeNo.isEmpty()) {
			log.warn("ECPay notify missing MerchantTradeNo");
			return PaymentNotifyOutcome.FAILED;
		}

		// 同一 (provider, merchant, tradeNo) 已處理過 → 直接冪等結束（不插第二列）。
		if (notifications.existsByTradeKey(merchantTradeNo, providerTradeNo)) {
			return PaymentNotifyOutcome.IGNORED_DUPLICATE;
		}

		Optional<PayableTarget> targetOpt = resolveTarget(params, merchantTradeNo);
		if (targetOpt.isEmpty()) {
			log.warn("ECPay notify cannot resolve order/booking, merchantTradeNo={}", merchantTradeNo);
			return PaymentNotifyOutcome.FAILED;
		}

		PayableTarget peek = targetOpt.get();
		if (!PROVIDER_OK.equals(rtnCode)) {
			insertSafe(merchantTradeNo, providerTradeNo, peek, payloadJson, "failed", now);
			return PaymentNotifyOutcome.FAILED;
		}

		if (!amountMatches(peek.total(), params.get("TradeAmt"))) {
			log.warn("ECPay notify amount mismatch, id={}, expected={}, tradeAmt={}",
					peek.id(), peek.total(), params.get("TradeAmt"));
			insertSafe(merchantTradeNo, providerTradeNo, peek, payloadJson, "failed", now);
			return PaymentNotifyOutcome.FAILED;
		}

		if (peek.kind() == PayableKind.ORDER) {
			return settleOrder(peek.id(), merchantTradeNo, providerTradeNo, payloadJson, now);
		}
		return settleBooking(peek.id(), merchantTradeNo, providerTradeNo, payloadJson, now);
	}

	/**
	 * Stub 專用：依 orderId／bookingId 組簽章後走同一條 Notify 路徑。
	 */
	@Transactional
	public PaymentNotifyOutcome simulatePaid(String orderId, String bookingId) {
		if (!ecpayGateway.isStub()) {
			throw new BusinessException(ErrorCode.NOT_FOUND, "ECPay stub is disabled");
		}
		boolean hasOrder = orderId != null && !orderId.isBlank();
		boolean hasBooking = bookingId != null && !bookingId.isBlank();
		if (hasOrder == hasBooking) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR,
					"Provide exactly one of orderId or bookingId");
		}

		PayableTarget target;
		String customField1;
		if (hasOrder) {
			target = notifications.findOrderById(orderId.trim())
					.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Order not found"));
			customField1 = "order:" + target.id();
		}
		else {
			target = notifications.findBookingById(bookingId.trim())
					.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Booking not found"));
			customField1 = "booking:" + target.id();
		}

		int tradeAmt = toTradeAmt(target.total());
		String tradeNo = "STUB" + System.currentTimeMillis();
		Map<String, String> notify = ecpayGateway.buildStubPaidNotify(
				target.id(), tradeNo, tradeAmt, customField1);
		return handleNotify(notify);
	}

	private PaymentNotifyOutcome settleOrder(
			String orderId,
			String merchantTradeNo,
			String providerTradeNo,
			String payloadJson,
			Instant now) {
		Order order = orders.findByIdForUpdate(orderId).orElse(null);
		if (order == null) {
			return PaymentNotifyOutcome.FAILED;
		}

		PayableTarget snapshot = new PayableTarget(
				order.getId(),
				PayableKind.ORDER,
				order.getPaymentStatus().name(),
				order.getStatus().name(),
				order.getTotal(),
				order.getStatus() == OrderStatus.cancelled);

		if (order.getPaymentStatus() == PaymentStatus.paid) {
			insertSafe(merchantTradeNo, providerTradeNo, snapshot, payloadJson, "ignored_duplicate", now);
			return PaymentNotifyOutcome.IGNORED_DUPLICATE;
		}
		if (order.getStatus() == OrderStatus.cancelled) {
			insertSafe(merchantTradeNo, providerTradeNo, snapshot, payloadJson, "failed", now);
			return PaymentNotifyOutcome.FAILED;
		}

		boolean marked = order.markPaid(now);
		if (!marked) {
			insertSafe(merchantTradeNo, providerTradeNo, snapshot, payloadJson, "ignored_duplicate", now);
			return PaymentNotifyOutcome.IGNORED_DUPLICATE;
		}

		fulfillProductReservations(order, now);
		consumeOrderCoupon(order.getId(), now);
		orderHistories.save(OrderStatusHistory.of(
				order.getId(), order.getStatus(), now, "ECPay notify: payment marked paid"));

		insertSafe(merchantTradeNo, providerTradeNo, snapshot, payloadJson, "success", now);
		return PaymentNotifyOutcome.SUCCESS;
	}

	private PaymentNotifyOutcome settleBooking(
			String bookingId,
			String merchantTradeNo,
			String providerTradeNo,
			String payloadJson,
			Instant now) {
		PayableTarget locked = notifications.lockBookingForUpdate(bookingId).orElse(null);
		if (locked == null) {
			return PaymentNotifyOutcome.FAILED;
		}

		if (locked.isPaid()) {
			insertSafe(merchantTradeNo, providerTradeNo, locked, payloadJson, "ignored_duplicate", now);
			return PaymentNotifyOutcome.IGNORED_DUPLICATE;
		}
		if (locked.cancelled()) {
			insertSafe(merchantTradeNo, providerTradeNo, locked, payloadJson, "failed", now);
			return PaymentNotifyOutcome.FAILED;
		}

		notifications.markBookingPaid(bookingId, now);
		notifications.insertBookingPaidHistory(bookingId, now);
		// 租借 reservation 維持 active，等後台 confirm／完成再 fulfilled（與 Admin 契約一致）。
		insertSafe(merchantTradeNo, providerTradeNo, locked, payloadJson, "success", now);
		return PaymentNotifyOutcome.SUCCESS;
	}

	private void fulfillProductReservations(Order order, Instant now) {
		List<Long> itemIds = order.getItems().stream().map(OrderItem::getId).toList();
		if (itemIds.isEmpty()) {
			return;
		}
		for (ProductStockReservation reservation : productReservations.findActiveByOrderItemIdIn(itemIds)) {
			reservation.fulfill(now);
		}
	}

	private void consumeOrderCoupon(String orderId, Instant now) {
		Optional<OrderCoupon> applied = orderCoupons.findByOrderId(orderId);
		if (applied.isEmpty()) {
			return;
		}
		couponClaims.findById(applied.get().getCouponClaimId()).ifPresent(claim -> {
			if (claim.consume(now)) {
				couponClaims.save(claim);
			}
		});
	}

	private Optional<PayableTarget> resolveTarget(Map<String, String> params, String merchantTradeNo) {
		String customField1 = trimToEmpty(params.get("CustomField1"));
		if (customField1.startsWith("order:")) {
			return notifications.findOrderById(customField1.substring("order:".length()).trim());
		}
		if (customField1.startsWith("booking:")) {
			return notifications.findBookingById(customField1.substring("booking:".length()).trim());
		}

		Optional<PayableTarget> order = notifications.findOrderById(merchantTradeNo);
		if (order.isPresent()) {
			return order;
		}
		return notifications.findBookingById(merchantTradeNo);
	}

	private void insertSafe(
			String merchantTradeNo,
			String providerTradeNo,
			PayableTarget target,
			String payloadJson,
			String result,
			Instant now) {
		String orderId = target.kind() == PayableKind.ORDER ? target.id() : null;
		String bookingId = target.kind() == PayableKind.BOOKING ? target.id() : null;
		try {
			notifications.insert(merchantTradeNo, providerTradeNo, orderId, bookingId, payloadJson, result, now);
		}
		catch (DataIntegrityViolationException ex) {
			// 並發重送撞上唯一鍵：當成已處理過。
			log.info("ECPay notify unique key race, merchantTradeNo={}", merchantTradeNo);
		}
	}

	private static boolean amountMatches(BigDecimal expected, String tradeAmtRaw) {
		if (expected == null || tradeAmtRaw == null || tradeAmtRaw.isBlank()) {
			return false;
		}
		try {
			int expectedAmt = toTradeAmt(expected);
			int actual = Integer.parseInt(tradeAmtRaw.trim());
			return expectedAmt == actual;
		}
		catch (NumberFormatException | ArithmeticException ex) {
			return false;
		}
	}

	/** 綠界 TradeAmt 為整數元；DB 金額四捨五入到元再比。 */
	static int toTradeAmt(BigDecimal total) {
		return total.setScale(0, RoundingMode.HALF_UP).intValueExact();
	}

	private String toJson(Map<String, String> params) {
		try {
			return objectMapper.writeValueAsString(params);
		}
		catch (JsonProcessingException ex) {
			throw new IllegalStateException("Cannot serialize ECPay notify payload", ex);
		}
	}

	private static Map<String, String> normalize(Map<String, String> raw) {
		Map<String, String> normalized = new LinkedHashMap<>();
		if (raw == null) {
			return normalized;
		}
		raw.forEach((key, value) -> {
			if (key != null && value != null) {
				normalized.put(key, value);
			}
		});
		return normalized;
	}

	private static String trimToEmpty(String value) {
		return value == null ? "" : value.trim();
	}

	private static String trimToNull(String value) {
		if (value == null) {
			return null;
		}
		String trimmed = value.trim();
		return trimmed.isEmpty() ? null : trimmed;
	}
}
