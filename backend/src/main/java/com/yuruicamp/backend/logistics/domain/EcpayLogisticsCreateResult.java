package com.yuruicamp.backend.logistics.domain;

/**
 * 綠界國內物流建單結果（/Express/Create pipe-separated 解析後）。
 */
public record EcpayLogisticsCreateResult(
		boolean success,
		String rtnCode,
		String rtnMsg,
		String allPayLogisticsId,
		String cvsPaymentNo,
		String merchantTradeNo) {

	public static EcpayLogisticsCreateResult failed(String rtnCode, String rtnMsg) {
		return new EcpayLogisticsCreateResult(false, rtnCode, rtnMsg, null, null, null);
	}
}
