package com.yuruicamp.backend.logistics.application;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;

import com.yuruicamp.backend.logistics.infrastructure.EcpayLogisticsGateway;
import com.yuruicamp.backend.order.domain.Order;
import com.yuruicamp.backend.order.infrastructure.OrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 綠界物流狀態 ServerReplyURL：驗 MD5 後覆寫 Logistics Status Snapshot；必須回 {@code 1|OK}。
 * Does not mutate Order Status (ADR 0005).
 */
@Service
public class EcpayLogisticsNotifyService {

	private static final Logger log = LoggerFactory.getLogger(EcpayLogisticsNotifyService.class);

	private final EcpayLogisticsGateway logisticsGateway;
	private final OrderRepository orders;

	public EcpayLogisticsNotifyService(EcpayLogisticsGateway logisticsGateway, OrderRepository orders) {
		this.logisticsGateway = logisticsGateway;
		this.orders = orders;
	}

	public boolean verify(Map<String, String> params) {
		return logisticsGateway.verifyCallback(params);
	}

	@Transactional
	public void handle(Map<String, String> params) {
		String logisticsId = blankToNull(params.get("AllPayLogisticsID"));
		String merchantTradeNo = blankToNull(params.get("MerchantTradeNo"));
		String rtnCode = blankToNull(params.get("RtnCode"));
		String rtnMsg = blankToNull(params.get("RtnMsg"));
		log.info(
				"ECPay logistics notify: AllPayLogisticsID={} MerchantTradeNo={} RtnCode={} RtnMsg={}",
				logisticsId, merchantTradeNo, rtnCode, rtnMsg);

		if (logisticsId == null) {
			log.warn("ECPay logistics notify missing AllPayLogisticsID; snapshot skipped");
			return;
		}

		Optional<Order> locked = orders.findByEcpayLogisticsIdForUpdate(logisticsId);
		if (locked.isEmpty()) {
			log.warn(
					"ECPay logistics notify unmatched AllPayLogisticsID={}; acknowledging without snapshot",
					logisticsId);
			return;
		}

		Order order = locked.get();
		boolean changed = order.applyLogisticsStatusSnapshot(rtnCode, rtnMsg, Instant.now());
		if (changed) {
			orders.save(order);
			log.info(
					"ECPay logistics snapshot updated orderId={} AllPayLogisticsID={} RtnCode={}",
					order.getId(), logisticsId, rtnCode);
		}
	}

	private static String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}
}
