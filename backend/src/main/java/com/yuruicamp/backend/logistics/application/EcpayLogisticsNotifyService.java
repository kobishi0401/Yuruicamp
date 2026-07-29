package com.yuruicamp.backend.logistics.application;

import java.util.Map;

import com.yuruicamp.backend.logistics.infrastructure.EcpayLogisticsGateway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 綠界物流狀態 ServerReplyURL：驗 MD5 後記錄；必須回 {@code 1|OK}。
 */
@Service
public class EcpayLogisticsNotifyService {

	private static final Logger log = LoggerFactory.getLogger(EcpayLogisticsNotifyService.class);

	private final EcpayLogisticsGateway logisticsGateway;

	public EcpayLogisticsNotifyService(EcpayLogisticsGateway logisticsGateway) {
		this.logisticsGateway = logisticsGateway;
	}

	public boolean verify(Map<String, String> params) {
		return logisticsGateway.verifyCallback(params);
	}

	public void handle(Map<String, String> params) {
		String logisticsId = params.get("AllPayLogisticsID");
		String merchantTradeNo = params.get("MerchantTradeNo");
		String rtnCode = params.get("RtnCode");
		String rtnMsg = params.get("RtnMsg");
		log.info(
				"ECPay logistics notify: AllPayLogisticsID={} MerchantTradeNo={} RtnCode={} RtnMsg={}",
				logisticsId, merchantTradeNo, rtnCode, rtnMsg);
	}
}
