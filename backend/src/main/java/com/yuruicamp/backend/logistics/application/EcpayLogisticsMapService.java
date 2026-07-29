package com.yuruicamp.backend.logistics.application;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.config.YuruicampProperties;
import com.yuruicamp.backend.logistics.infrastructure.EcpayLogisticsGateway;
import com.yuruicamp.backend.logistics.infrastructure.EcpayLogisticsMapSessionRepository;
import com.yuruicamp.backend.order.domain.Order;
import com.yuruicamp.backend.order.domain.PaymentStatus;
import com.yuruicamp.backend.order.infrastructure.OrderRepository;
import com.yuruicamp.backend.payment.api.EcpayLaunchResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Checkout 超商選店：產生 ECPay 電子地圖表單（FAMI B2C）。
 */
@Service
public class EcpayLogisticsMapService {

	private final OrderRepository orders;
	private final EcpayLogisticsGateway logisticsGateway;
	private final EcpayLogisticsMapSessionRepository mapSessions;
	private final YuruicampProperties properties;

	public EcpayLogisticsMapService(
			OrderRepository orders,
			EcpayLogisticsGateway logisticsGateway,
			EcpayLogisticsMapSessionRepository mapSessions,
			YuruicampProperties properties) {
		this.orders = orders;
		this.logisticsGateway = logisticsGateway;
		this.mapSessions = mapSessions;
		this.properties = properties;
	}

	@Transactional
	public EcpayLaunchResponse launchMap(String customerId, String orderId) {
		Order order = orders.findForCustomerForUpdate(orderId, customerId)
				.orElseThrow(() -> new BusinessException(ErrorCode.FORBIDDEN,
						"Order not found or not owned by customer"));
		Instant now = Instant.now();
		if (order.getPaymentStatus() != PaymentStatus.unpaid) {
			throw new BusinessException(ErrorCode.CONFLICT, "Paid order cannot change CVS store");
		}
		if (!order.isCheckoutEditable(now)) {
			throw new BusinessException(ErrorCode.CHECKOUT_EXPIRED, "Checkout is cancelled or expired");
		}

		String merchantTradeNo = buildMapMerchantTradeNo(order.getDisplayNo());
		mapSessions.save(merchantTradeNo, order.getId(), now);
		Map<String, String> fields = logisticsGateway.buildMapFormFields(merchantTradeNo);

		return new EcpayLaunchResponse(
				order.getId(),
				null,
				merchantTradeNo,
				logisticsGateway.mapActionUrl(),
				fields,
				order.getCheckoutExpiresAt() == null ? null : order.getCheckoutExpiresAt().toString());
	}

	@Transactional
	public String applyMapResult(Map<String, String> params) {
		// 綠界 stage 電子地圖 callback 官方不回 CheckMacValue；本機 stub 會帶簽章。
		validateMapCallback(params);
		String merchantTradeNo = params.get("MerchantTradeNo");
		if (merchantTradeNo == null || merchantTradeNo.isBlank()) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR, "MerchantTradeNo is required");
		}
		String orderId = mapSessions.findOrderId(merchantTradeNo.trim())
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Map session not found"));

		Order order = orders.findByIdForUpdate(orderId)
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Order not found"));

		String storeId = firstNonBlank(params.get("CVSStoreID"), params.get("ReceiverStoreID"));
		String storeName = firstNonBlank(params.get("CVSStoreName"), params.get("StoreName"));
		String storeAddress = firstNonBlank(params.get("CVSAddress"), params.get("Address"));
		if (storeId == null || storeId.isBlank()) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR, "CVSStoreID is required");
		}

		String subType = properties.getEcpayLogistics().getLogisticsSubType();
		order.applyCvsStoreSelection(normalizeStoreId(storeId), storeName, storeAddress, subType);
		orders.save(order);

		return buildCheckoutRedirect(order.getId(), "cvsMap=ok");
	}

	/**
	 * 地圖選店 callback 驗證：MerchantID 必須吻合；CheckMacValue 僅在 stub 有帶時才驗 MD5。
	 */
	private void validateMapCallback(Map<String, String> params) {
		String merchantId = params.get("MerchantID");
		if (merchantId == null || !merchantId.trim().equals(logisticsGateway.merchantId())) {
			throw new BusinessException(ErrorCode.FORBIDDEN, "Invalid logistics map MerchantID");
		}
		String checkMac = params.get("CheckMacValue");
		if (checkMac != null && !checkMac.isBlank() && !logisticsGateway.verifyCallback(params)) {
			throw new BusinessException(ErrorCode.FORBIDDEN, "Invalid logistics map CheckMacValue");
		}
	}

	private String buildCheckoutRedirect(String orderId, String query) {
		String base = trimTrailingSlash(properties.getEcpay().getFrontendBaseUrl())
				+ properties.getEcpay().getOrderFailurePath();
		String separator = base.contains("?") ? "&" : "?";
		return base + separator + query + "&orderId=" + urlEncode(orderId);
	}

	private static String buildMapMerchantTradeNo(String displayNo) {
		String prefix = displayNo == null ? "MAP" : displayNo.replace("-", "");
		if (prefix.length() > 10) {
			prefix = prefix.substring(0, 10);
		}
		int suffix = ThreadLocalRandom.current().nextInt(100_000, 999_999);
		String candidate = prefix + suffix;
		return candidate.length() <= 20 ? candidate : candidate.substring(0, 20);
	}

	private static String normalizeStoreId(String storeId) {
		String trimmed = storeId.trim();
		return trimmed.length() <= 6 ? trimmed : trimmed.substring(trimmed.length() - 6);
	}

	private static String firstNonBlank(String... values) {
		for (String value : values) {
			if (value != null && !value.isBlank()) {
				return value.trim();
			}
		}
		return null;
	}

	private static String trimTrailingSlash(String value) {
		if (value == null || value.isBlank()) {
			return "";
		}
		return value.endsWith("/") ? value.substring(0, value.length() - 1) : value.trim();
	}

	private static String urlEncode(String value) {
		return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8);
	}
}
