package com.yuruicamp.backend.payment.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.Locale;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

import com.yuruicamp.backend.booking.infrastructure.BookingLifecycleRepository;
import com.yuruicamp.backend.booking.infrastructure.BookingMemberRepository;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.order.domain.Order;
import com.yuruicamp.backend.order.domain.OrderItem;
import com.yuruicamp.backend.order.domain.OrderStatus;
import com.yuruicamp.backend.order.domain.PaymentMethod;
import com.yuruicamp.backend.order.domain.PaymentStatus;
import com.yuruicamp.backend.order.infrastructure.OrderRepository;
import com.yuruicamp.backend.payment.api.EcpayLaunchResponse;
import com.yuruicamp.backend.payment.infrastructure.EcpayCheckoutRequest;
import com.yuruicamp.backend.payment.infrastructure.EcpayGateway;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * D-2：為商城訂單／預約組 ECPay AIO 表單欄位。
 * <p>MerchantTradeNo 最長 20（綠界限制），真實業務 ID 放 CustomField1。
 */
@Service
public class EcpayLaunchService {

	private static final String PENDING = "PENDING";

	private final EcpayGateway ecpayGateway;
	private final OrderRepository orders;
	private final BookingLifecycleRepository bookingLifecycle;
	private final BookingMemberRepository bookingMembers;

	public EcpayLaunchService(
			EcpayGateway ecpayGateway,
			OrderRepository orders,
			BookingLifecycleRepository bookingLifecycle,
			BookingMemberRepository bookingMembers) {
		this.ecpayGateway = ecpayGateway;
		this.orders = orders;
		this.bookingLifecycle = bookingLifecycle;
		this.bookingMembers = bookingMembers;
	}

	@Transactional
	public EcpayLaunchResponse launchForOrder(String customerId, String orderId) {
		Order order = orders.findForCustomerForUpdate(orderId.trim(), customerId.trim())
				.orElseThrow(() -> new BusinessException(ErrorCode.FORBIDDEN,
						"Order not found or not owned by customer"));
		Instant now = Instant.now();
		assertOrderPayable(order, now);

		String itemName = order.getItems().stream()
				.map(OrderItem::getProductName)
				.filter(name -> name != null && !name.isBlank())
				.collect(Collectors.joining("#"));
		if (itemName.isBlank()) {
			itemName = "Yuruicamp order";
		}

		String merchantTradeNo = newMerchantTradeNo();
		var request = new EcpayCheckoutRequest(
				order.getId(),
				true,
				toTradeAmt(order.getTotal()),
				itemName,
				"Yuruicamp store order",
				choosePayment(order.getPaymentMethod()),
				order.getCheckoutExpiresAt() == null ? null : order.getCheckoutExpiresAt().toString());

		var fields = ecpayGateway.buildAioCheckoutFields(request, merchantTradeNo);
		return new EcpayLaunchResponse(
				order.getId(),
				null,
				merchantTradeNo,
				ecpayGateway.checkoutActionUrl(),
				fields,
				request.expiresAtIso());
	}

	@Transactional
	public EcpayLaunchResponse launchForBooking(String customerId, String bookingId) {
		var locked = bookingLifecycle.lockOwnedBooking(customerId.trim(), bookingId.trim())
				.orElseThrow(() -> new BusinessException(ErrorCode.FORBIDDEN,
						"Booking not found or not owned by customer"));
		Instant now = Instant.now();
		if (!"pending".equals(locked.status()) || !"unpaid".equals(locked.paymentStatus())) {
			throw new BusinessException(ErrorCode.CONFLICT,
					"Only pending unpaid booking can launch ECPay");
		}
		if (locked.checkoutExpiresAt() != null && !locked.checkoutExpiresAt().isAfter(now)) {
			throw new BusinessException(ErrorCode.CHECKOUT_EXPIRED, "Booking checkout expired");
		}
		if ("cod".equalsIgnoreCase(paymentMethodOf(customerId, bookingId))) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR,
					"Booking checkout does not support cod");
		}

		var detail = bookingMembers.findOwnedBooking(customerId.trim(), bookingId.trim())
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Booking not found"));

		String merchantTradeNo = newMerchantTradeNo();
		String itemName = detail.campgroundName() == null || detail.campgroundName().isBlank()
				? "Yuruicamp booking"
				: detail.campgroundName();
		var request = new EcpayCheckoutRequest(
				detail.id(),
				false,
				toTradeAmt(detail.finalAmount()),
				itemName,
				"Yuruicamp booking",
				choosePaymentFromDb(detail.paymentMethod()),
				detail.checkoutExpiresAt() == null ? null : detail.checkoutExpiresAt().toString());

		var fields = ecpayGateway.buildAioCheckoutFields(request, merchantTradeNo);
		return new EcpayLaunchResponse(
				null,
				detail.id(),
				merchantTradeNo,
				ecpayGateway.checkoutActionUrl(),
				fields,
				request.expiresAtIso());
	}

	private void assertOrderPayable(Order order, Instant now) {
		if (order.getPaymentStatus() == PaymentStatus.paid) {
			throw new BusinessException(ErrorCode.CONFLICT, "Order is already paid");
		}
		if (order.getStatus() == OrderStatus.cancelled) {
			throw new BusinessException(ErrorCode.CONFLICT, "Cancelled order cannot launch ECPay");
		}
		if (order.getPaymentMethod() == PaymentMethod.cod) {
			throw new BusinessException(ErrorCode.CONFLICT,
					"COD order must use confirm-cod, not ECPay");
		}
		if (!order.isCheckoutEditable(now)) {
			throw new BusinessException(ErrorCode.CHECKOUT_EXPIRED,
					"Checkout is incomplete, cancelled or expired");
		}
		if (PENDING.equals(order.getRecipientName())
				|| PENDING.equals(order.getShippingPhone())
				|| PENDING.equals(order.getShippingAddress())) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR,
					"Complete shipping before launching ECPay");
		}
	}

	private String paymentMethodOf(String customerId, String bookingId) {
		return bookingMembers.findOwnedBooking(customerId, bookingId)
				.map(row -> row.paymentMethod())
				.orElse("");
	}

	/** 綠界 MerchantTradeNo 最長 20；每次 launch 產生新號（可重複導轉）。 */
	static String newMerchantTradeNo() {
		long seconds = Instant.now().getEpochSecond();
		int rand = ThreadLocalRandom.current().nextInt(0x10000);
		String value = "Y" + Long.toString(seconds, 36).toUpperCase(Locale.ROOT)
				+ Integer.toString(rand, 16).toUpperCase(Locale.ROOT);
		return value.length() <= 20 ? value : value.substring(0, 20);
	}

	static int toTradeAmt(BigDecimal total) {
		return total.setScale(0, RoundingMode.HALF_UP).intValueExact();
	}

	static String choosePayment(PaymentMethod method) {
		return switch (method) {
			case ecpay_credit -> "Credit";
			case ecpay_atm -> "ATM";
			case ecpay_cvs -> "CVS";
			case ecpay_other -> "ALL";
			case cod -> throw new BusinessException(ErrorCode.CONFLICT, "COD cannot use ECPay");
		};
	}

	static String choosePaymentFromDb(String raw) {
		if (raw == null || raw.isBlank()) {
			return "Credit";
		}
		return switch (raw.trim()) {
			case "ecpay-credit" -> "Credit";
			case "ecpay-atm" -> "ATM";
			case "ecpay-cvs" -> "CVS";
			case "ecpay-other" -> "ALL";
			case "cod" -> throw new BusinessException(ErrorCode.VALIDATION_ERROR,
					"Booking checkout does not support cod");
			default -> "Credit";
		};
	}
}
