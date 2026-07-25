package com.yuruicamp.backend.payment.infrastructure;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

import com.yuruicamp.backend.config.YuruicampProperties;
import com.yuruicamp.backend.payment.domain.EcpayRefundResult;
import org.springframework.stereotype.Component;

/**
 * 本機／沙箱共用：用設定檔 HashKey／HashIV 簽 CMV。
 * stub=true 時 actionUrl 指本機假付款頁；stub=false 時指綠界 Cashier。
 */
@Component
public class StubEcpayGateway implements EcpayGateway {

	private static final DateTimeFormatter TRADE_DATE = DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm:ss");

	private final YuruicampProperties.Ecpay ecpay;

	public StubEcpayGateway(YuruicampProperties properties) {
		this.ecpay = properties.getEcpay();
	}

	@Override
	public boolean verifyNotify(Map<String, String> params) {
		return EcpayCheckMacValue.verify(params, ecpay.getHashKey(), ecpay.getHashIv(), "SHA256");
	}

	@Override
	public Map<String, String> buildStubPaidNotify(
			String merchantTradeNo,
			String tradeNo,
			int tradeAmt,
			String customField1) {
		String now = LocalDateTime.now().format(TRADE_DATE);
		Map<String, String> params = new LinkedHashMap<>();
		params.put("MerchantID", ecpay.getMerchantId());
		params.put("MerchantTradeNo", merchantTradeNo);
		params.put("RtnCode", "1");
		params.put("RtnMsg", "Succeeded");
		params.put("TradeNo", tradeNo);
		params.put("TradeAmt", String.valueOf(tradeAmt));
		params.put("PaymentDate", now);
		params.put("PaymentType", "Credit_CreditCard");
		params.put("TradeDate", now);
		params.put("SimulatePaid", "0");
		if (customField1 != null && !customField1.isBlank()) {
			params.put("CustomField1", customField1);
		}
		params.put("CheckMacValue",
				EcpayCheckMacValue.generate(params, ecpay.getHashKey(), ecpay.getHashIv(), "SHA256"));
		return params;
	}

	@Override
	public Map<String, String> buildAioCheckoutFields(EcpayCheckoutRequest request, String merchantTradeNo) {
		String now = LocalDateTime.now().format(TRADE_DATE);
		String apiBase = trimTrailingSlash(ecpay.getPublicApiBaseUrl());
		Map<String, String> params = new LinkedHashMap<>();
		params.put("MerchantID", ecpay.getMerchantId());
		params.put("MerchantTradeNo", merchantTradeNo);
		params.put("MerchantTradeDate", now);
		params.put("PaymentType", "aio");
		params.put("TotalAmount", String.valueOf(request.tradeAmt()));
		params.put("TradeDesc", truncate(request.tradeDesc(), 200));
		params.put("ItemName", truncate(request.itemName(), 200));
		// AIO 的 ReturnURL = 伺服器 Notify（付款真相）
		params.put("ReturnURL", apiBase + "/payments/ecpay/notify");
		// 瀏覽器導回（不當 paid 依據）
		params.put("OrderResultURL", apiBase + "/payments/ecpay/return");
		params.put("ChoosePayment", request.choosePayment());
		params.put("EncryptType", "1");
		params.put("CustomField1", request.customField1());
		params.put("CheckMacValue",
				EcpayCheckMacValue.generate(params, ecpay.getHashKey(), ecpay.getHashIv(), "SHA256"));
		return params;
	}

	@Override
	public String checkoutActionUrl() {
		if (ecpay.isStub()) {
			return trimTrailingSlash(ecpay.getPublicApiBaseUrl()) + "/payments/ecpay/stub/aio-checkout";
		}
		return ecpay.getPaymentUrl();
	}

	@Override
	public boolean isStub() {
		return ecpay.isStub();
	}

	@Override
	public String merchantId() {
		return ecpay.getMerchantId();
	}

	@Override
	public EcpayRefundResult refundFull(String merchantTradeNo, String providerTradeNo, BigDecimal tradeAmt) {
		// Stub：本機一律成功，方便 Admin 取消／退款 IT。 / Local stub always succeeds.
		if (ecpay.isStub()) {
			return EcpayRefundResult.ok();
		}
		// 真實綠界退款 HTTP 尚未接線；避免誤標本地已退款。
		return EcpayRefundResult.failed("Live ECPay refund HTTP is not wired yet; enable stub for local refunds");
	}

	private static String trimTrailingSlash(String value) {
		if (value == null || value.isBlank()) {
			return "";
		}
		return value.endsWith("/") ? value.substring(0, value.length() - 1) : value.trim();
	}

	private static String truncate(String value, int max) {
		if (value == null) {
			return "";
		}
		String trimmed = value.trim();
		return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
	}
}
