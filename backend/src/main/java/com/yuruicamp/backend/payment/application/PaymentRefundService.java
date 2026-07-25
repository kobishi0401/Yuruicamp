package com.yuruicamp.backend.payment.application;

import java.math.BigDecimal;
import java.math.RoundingMode;

import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.payment.domain.EcpayRefundResult;
import com.yuruicamp.backend.payment.infrastructure.EcpayGateway;
import com.yuruicamp.backend.payment.infrastructure.PaymentNotificationRepository;
import org.springframework.stereotype.Service;

/**
 * W3：Admin 全額退款 port（先綠界／stub，再允許呼叫端改本地狀態）。
 * Full refund port — provider first, then local status updates by caller.
 */
@Service
public class PaymentRefundService {

	private final PaymentNotificationRepository notifications;
	private final EcpayGateway ecpayGateway;

	public PaymentRefundService(PaymentNotificationRepository notifications, EcpayGateway ecpayGateway) {
		this.notifications = notifications;
		this.ecpayGateway = ecpayGateway;
	}

	/** 商城訂單全額退款；失敗拋業務錯誤，成功才回傳。 */
	public void refundOrderFully(String orderId, BigDecimal total) {
		var trade = notifications.findLatestSuccessTradeForOrder(orderId)
				.orElseThrow(() -> new BusinessException(
						ErrorCode.PAYMENT_PROVIDER_CONFLICT,
						"No successful ECPay notify found for order refund"));
		runRefund(trade.merchantTradeNo(), trade.providerTradeNo(), total);
	}

	/** 預約全額退款。 */
	public void refundBookingFully(String bookingId, BigDecimal total) {
		var trade = notifications.findLatestSuccessTradeForBooking(bookingId)
				.orElseThrow(() -> new BusinessException(
						ErrorCode.PAYMENT_PROVIDER_CONFLICT,
						"No successful ECPay notify found for booking refund"));
		runRefund(trade.merchantTradeNo(), trade.providerTradeNo(), total);
	}

	private void runRefund(String merchantTradeNo, String providerTradeNo, BigDecimal total) {
		if (total == null || total.compareTo(BigDecimal.ZERO) < 0) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR, "Refund amount is invalid");
		}
		BigDecimal amount = total.setScale(0, RoundingMode.HALF_UP);
		EcpayRefundResult result = ecpayGateway.refundFull(merchantTradeNo, providerTradeNo, amount);
		if (!result.success()) {
			throw new BusinessException(ErrorCode.PAYMENT_REFUND_FAILED, result.message());
		}
	}
}
