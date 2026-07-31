package com.yuruicamp.backend.logistics.application;

import java.util.Map;

import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.logistics.infrastructure.EcpayLogisticsGateway;
import com.yuruicamp.backend.order.api.AdminLogisticsPrintLaunchResponse;
import com.yuruicamp.backend.order.domain.Order;
import com.yuruicamp.backend.order.infrastructure.OrderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admin 列印託運單：組綠界 printTradeDocument launch（不改 Order Status）。
 */
@Service
public class EcpayLogisticsPrintService {

	private final OrderRepository orders;
	private final EcpayLogisticsGateway logisticsGateway;

	public EcpayLogisticsPrintService(OrderRepository orders, EcpayLogisticsGateway logisticsGateway) {
		this.orders = orders;
		this.logisticsGateway = logisticsGateway;
	}

	@Transactional(readOnly = true)
	public AdminLogisticsPrintLaunchResponse launchPrintTradeDocument(String orderId) {
		Order order = orders.findById(orderId)
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Order not found"));
		String logisticsId = order.getEcpayLogisticsId();
		if (logisticsId == null || logisticsId.isBlank()) {
			throw new BusinessException(ErrorCode.CONFLICT, "Order has no ECPay logistics id to print");
		}
		if (logisticsGateway.isStub()) {
			throw new BusinessException(ErrorCode.CONFLICT,
					"ECPay logistics stub is enabled; set YURUICAMP_ECPAY_LOGISTICS_STUB=false to print Trade Documents");
		}
		if (logisticsId.regionMatches(true, 0, "STUB", 0, 4)) {
			throw new BusinessException(ErrorCode.CONFLICT,
					"Cannot print Trade Document for stub logistics id; re-ship with logistics stub disabled");
		}

		Map<String, String> fields = logisticsGateway.buildPrintTradeDocumentFields(logisticsId.trim());
		return new AdminLogisticsPrintLaunchResponse(
				order.getId(),
				logisticsGateway.printTradeDocumentActionUrl(),
				fields);
	}
}
