package com.yuruicamp.backend.logistics.application;

import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.config.YuruicampProperties;
import com.yuruicamp.backend.logistics.domain.EcpayLogisticsCreateResult;
import com.yuruicamp.backend.logistics.domain.EcpayReceiverNameRules;
import com.yuruicamp.backend.logistics.infrastructure.EcpayLogisticsGateway;
import com.yuruicamp.backend.order.domain.Order;
import com.yuruicamp.backend.order.domain.ShippingMethod;
import com.yuruicamp.backend.order.infrastructure.OrderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admin 出貨時呼叫綠界 /Express/Create 建立物流單（CVS 超商取貨或 HOME 宅配）。
 */
@Service
public class EcpayLogisticsCreateService {

	private static final String PENDING_CHECKOUT = "PENDING_CHECKOUT";
	private static final DateTimeFormatter TRADE_DATE = DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm:ss");

	private final OrderRepository orders;
	private final EcpayLogisticsGateway logisticsGateway;
	private final YuruicampProperties properties;

	public EcpayLogisticsCreateService(
			OrderRepository orders,
			EcpayLogisticsGateway logisticsGateway,
			YuruicampProperties properties) {
		this.orders = orders;
		this.logisticsGateway = logisticsGateway;
		this.properties = properties;
	}

	/**
	 * 依訂單配送方式建立綠界物流單：cvs → FAMI；delivery → HOME/TCAT；pickup → 不呼叫。
	 */
	@Transactional
	public EcpayLogisticsCreateResult createShipment(String orderId) {
		Order order = orders.findByIdForUpdate(orderId)
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Order not found"));
		return switch (order.getShippingMethod()) {
			case cvs -> createCvsShipment(order);
			case delivery -> createHomeShipment(order);
			case pickup -> null;
		};
	}

	/** 相容舊呼叫端；新程式請用 {@link #createShipment(String)}。 */
	@Transactional
	public EcpayLogisticsCreateResult createCvsShipment(String orderId) {
		Order order = orders.findByIdForUpdate(orderId)
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Order not found"));
		if (order.getShippingMethod() != ShippingMethod.cvs) {
			return null;
		}
		return createCvsShipment(order);
	}

	private EcpayLogisticsCreateResult createCvsShipment(Order order) {
		EcpayLogisticsCreateResult existing = existingResult(order);
		if (existing != null) {
			return existing;
		}
		if (order.getCvsStoreId() == null || order.getCvsStoreId().isBlank()) {
			throw new BusinessException(ErrorCode.CONFLICT, "CVS store is not selected for this order");
		}
		validateEcpayRecipientName(order);

		YuruicampProperties.EcpayLogistics cfg = properties.getEcpayLogistics();
		CreateContext ctx = buildCreateContext(order, cfg);
		String subType = order.getCvsSubType() == null || order.getCvsSubType().isBlank()
				? cfg.getLogisticsSubType() : order.getCvsSubType();

		Map<String, String> fields = logisticsGateway.buildCreateCvsFields(
				ctx.merchantTradeNo(),
				ctx.tradeDate(),
				ctx.goodsAmount(),
				cfg.getGoodsName(),
				cfg.getSenderName(),
				cfg.getSenderCellPhone(),
				order.getRecipientName(),
				order.getShippingPhone(),
				order.getCvsStoreId(),
				subType);

		return persistCreateResult(order, logisticsGateway.createCvsOrder(fields));
	}

	private EcpayLogisticsCreateResult createHomeShipment(Order order) {
		EcpayLogisticsCreateResult existing = existingResult(order);
		if (existing != null) {
			return existing;
		}
		validateDeliveryAddress(order);
		validateEcpayRecipientName(order);

		YuruicampProperties.EcpayLogistics cfg = properties.getEcpayLogistics();
		CreateContext ctx = buildCreateContext(order, cfg);

		Map<String, String> fields = logisticsGateway.buildCreateHomeFields(
				ctx.merchantTradeNo(),
				ctx.tradeDate(),
				ctx.goodsAmount(),
				cfg.getGoodsName(),
				cfg.getSenderName(),
				cfg.getSenderCellPhone(),
				order.getRecipientName(),
				order.getShippingPhone(),
				order.getShippingAddress(),
				cfg.getHomeLogisticsSubType());

		return persistCreateResult(order, logisticsGateway.createHomeOrder(fields));
	}

	private EcpayLogisticsCreateResult existingResult(Order order) {
		if (order.getEcpayLogisticsId() == null || order.getEcpayLogisticsId().isBlank()) {
			return null;
		}
		return new EcpayLogisticsCreateResult(
				true, "1", "Already created", order.getEcpayLogisticsId(),
				order.getEcpayCvsPaymentNo(), order.getDisplayNo());
	}

	private static void validateDeliveryAddress(Order order) {
		if (isIncompleteSnapshot(order.getRecipientName())
				|| isIncompleteSnapshot(order.getShippingPhone())
				|| isIncompleteSnapshot(order.getShippingAddress())) {
			throw new BusinessException(ErrorCode.CONFLICT, "Shipping address is incomplete for home delivery");
		}
	}

	private static void validateEcpayRecipientName(Order order) {
		EcpayReceiverNameRules.validateOrThrow(order.getRecipientName());
	}

	private static boolean isIncompleteSnapshot(String value) {
		return value == null || value.isBlank() || PENDING_CHECKOUT.equals(value.trim());
	}

	private EcpayLogisticsCreateResult persistCreateResult(Order order, EcpayLogisticsCreateResult result) {
		if (!result.success()) {
			throw new BusinessException(ErrorCode.CONFLICT,
					"ECPay logistics create failed: " + result.rtnCode() + " " + result.rtnMsg());
		}
		order.assignEcpayLogistics(result.allPayLogisticsId(), result.cvsPaymentNo());
		orders.save(order);
		return result;
	}

	private static CreateContext buildCreateContext(Order order, YuruicampProperties.EcpayLogistics cfg) {
		int goodsAmount = order.getTotal().setScale(0, RoundingMode.HALF_UP).intValueExact();
		if (goodsAmount < 1) {
			goodsAmount = 1;
		}
		return new CreateContext(
				buildCreateMerchantTradeNo(order.getDisplayNo()),
				LocalDateTime.now().format(TRADE_DATE),
				goodsAmount);
	}

	private static String buildCreateMerchantTradeNo(String displayNo) {
		String prefix = displayNo == null ? "LG" : displayNo.replace("-", "");
		if (prefix.length() > 12) {
			prefix = prefix.substring(0, 12);
		}
		int suffix = ThreadLocalRandom.current().nextInt(100_000, 999_999);
		String candidate = prefix + suffix;
		return candidate.length() <= 20 ? candidate : candidate.substring(0, 20);
	}

	private record CreateContext(String merchantTradeNo, String tradeDate, int goodsAmount) {
	}
}
