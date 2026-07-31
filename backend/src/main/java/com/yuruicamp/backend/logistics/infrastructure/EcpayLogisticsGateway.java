package com.yuruicamp.backend.logistics.infrastructure;

import java.util.Map;

import com.yuruicamp.backend.logistics.domain.EcpayLogisticsCreateResult;

/**
 * 綠界國內物流（CMV-MD5）閘道：電子地圖、建單、驗簽。
 */
public interface EcpayLogisticsGateway {

	boolean verifyCallback(Map<String, String> params);

	Map<String, String> buildMapFormFields(String merchantTradeNo);

	Map<String, String> buildCreateCvsFields(
			String merchantTradeNo,
			String merchantTradeDate,
			int goodsAmount,
			String goodsName,
			String senderName,
			String senderCellPhone,
			String receiverName,
			String receiverCellPhone,
			String receiverStoreId,
			String logisticsSubType);

	Map<String, String> buildCreateHomeFields(
			String merchantTradeNo,
			String merchantTradeDate,
			int goodsAmount,
			String goodsName,
			String senderName,
			String senderCellPhone,
			String senderZipCode,
			String senderAddress,
			String receiverName,
			String receiverCellPhone,
			String receiverZipCode,
			String receiverAddress,
			String logisticsSubType);

	String mapActionUrl();

	String createActionUrl();

	/** B2C／宅配列印託運單（printTradeDocument）表單欄位。 */
	Map<String, String> buildPrintTradeDocumentFields(String allPayLogisticsId);

	String printTradeDocumentActionUrl();

	EcpayLogisticsCreateResult createCvsOrder(Map<String, String> fields);

	EcpayLogisticsCreateResult createHomeOrder(Map<String, String> fields);

	boolean isStub();

	String merchantId();
}
