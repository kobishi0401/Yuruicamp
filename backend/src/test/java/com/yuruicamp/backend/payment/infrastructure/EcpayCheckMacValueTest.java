package com.yuruicamp.backend.payment.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

/**
 * 對齊 .ecpay-skill/test-vectors/checkmacvalue.json 的 AIO／Callback 向量。
 */
class EcpayCheckMacValueTest {

	private static final String HASH_KEY = "pwFHCqoQZGmho4w6";
	private static final String HASH_IV = "EkRm7iFT261dpevs";

	@Test
	void generatesSha256BaselineVector() {
		Map<String, String> params = new LinkedHashMap<>();
		params.put("MerchantID", "3002607");
		params.put("MerchantTradeNo", "Test1234567890");
		params.put("MerchantTradeDate", "2025/01/01 12:00:00");
		params.put("PaymentType", "aio");
		params.put("TotalAmount", "100");
		params.put("TradeDesc", "測試");
		params.put("ItemName", "測試商品");
		params.put("ReturnURL", "https://example.com/notify");
		params.put("ChoosePayment", "ALL");
		params.put("EncryptType", "1");

		assertThat(EcpayCheckMacValue.generate(params, HASH_KEY, HASH_IV, "SHA256"))
				.isEqualTo("291CBA324D31FB5A4BBBFDF2CFE5D32598524753AFD4959C3BF590C5B2F57FB2");
	}

	@Test
	void verifiesCallbackVector() {
		Map<String, String> params = new LinkedHashMap<>();
		params.put("MerchantID", "3002607");
		params.put("MerchantTradeNo", "Test1234567890");
		params.put("RtnCode", "1");
		params.put("RtnMsg", "Succeeded");
		params.put("TradeNo", "2301011234567890");
		params.put("TradeAmt", "100");
		params.put("PaymentDate", "2025/01/01 12:05:00");
		params.put("PaymentType", "Credit_CreditCard");
		params.put("TradeDate", "2025/01/01 12:00:00");
		params.put("SimulatePaid", "0");
		params.put("CheckMacValue", "2AB536D86AFF8E1086744D59175040A32538C96B1C28C4135B551BD728E913B8");

		assertThat(EcpayCheckMacValue.verify(params, HASH_KEY, HASH_IV, "SHA256")).isTrue();
	}

	@Test
	void rejectsTamperedCheckMacValue() {
		Map<String, String> params = new LinkedHashMap<>();
		params.put("MerchantID", "3002607");
		params.put("MerchantTradeNo", "Test1234567890");
		params.put("RtnCode", "1");
		params.put("CheckMacValue", "0000000000000000000000000000000000000000000000000000000000000000");

		assertThat(EcpayCheckMacValue.verify(params, HASH_KEY, HASH_IV, "SHA256")).isFalse();
	}
}
