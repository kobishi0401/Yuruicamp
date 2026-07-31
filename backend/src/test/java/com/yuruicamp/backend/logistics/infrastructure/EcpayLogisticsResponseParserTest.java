package com.yuruicamp.backend.logistics.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import com.yuruicamp.backend.logistics.domain.EcpayLogisticsCreateResult;
import org.junit.jupiter.api.Test;

class EcpayLogisticsResponseParserTest {

	@Test
	void parsesOfficialTwoSegmentSuccessWithAllPayLogisticsId() {
		// Official ECPay server-side Create success: 1|{query} (not 1|OK|{query})
		String body = "1|MerchantID=2000132&MerchantTradeNo=ORD0229792286&RtnCode=300"
				+ "&RtnMsg=訂單處理中&AllPayLogisticsID=3603160&LogisticsType=HOME"
				+ "&LogisticsSubType=TCAT&GoodsAmount=1640&CVSPaymentNo=&CheckMacValue=ABC";

		EcpayLogisticsCreateResult result = EcpayLogisticsResponseParser.parseCreateResponse(body);

		assertThat(result.success()).isTrue();
		assertThat(result.rtnCode()).isEqualTo("300");
		assertThat(result.allPayLogisticsId()).isEqualTo("3603160");
		assertThat(result.merchantTradeNo()).isEqualTo("ORD0229792286");
		assertThat(result.rtnMsg()).isEqualTo("訂單處理中");
		assertThat(result.cvsPaymentNo()).isNull();
	}

	@Test
	void parsesOfficialCvsSuccessWithPaymentNo() {
		String body = "1|MerchantID=2000132&MerchantTradeNo=CVS1&RtnCode=300&RtnMsg=OK"
				+ "&AllPayLogisticsID=1234567&CVSPaymentNo=999&CheckMacValue=ABC";

		EcpayLogisticsCreateResult result = EcpayLogisticsResponseParser.parseCreateResponse(body);

		assertThat(result.success()).isTrue();
		assertThat(result.allPayLogisticsId()).isEqualTo("1234567");
		assertThat(result.cvsPaymentNo()).isEqualTo("999");
	}

	@Test
	void parsesFailedCreateResponse() {
		EcpayLogisticsCreateResult result = EcpayLogisticsResponseParser.parseCreateResponse(
				"0| ErrorMessage");

		assertThat(result.success()).isFalse();
		assertThat(result.rtnCode()).isEqualTo("0");
		assertThat(result.rtnMsg()).contains("ErrorMessage");
	}

	@Test
	void parsesNonOneLeadingCodeAsFailure() {
		EcpayLogisticsCreateResult result = EcpayLogisticsResponseParser.parseCreateResponse(
				"10500040|GoodsAmount out of range");

		assertThat(result.success()).isFalse();
		assertThat(result.rtnCode()).isEqualTo("10500040");
	}

	@Test
	void successWithoutAllPayLogisticsIdStillMarkedSuccessForCallerToHardFail() {
		String body = "1|MerchantID=2000132&RtnCode=300&RtnMsg=OK&CheckMacValue=ABC";

		EcpayLogisticsCreateResult result = EcpayLogisticsResponseParser.parseCreateResponse(body);

		assertThat(result.success()).isTrue();
		assertThat(result.allPayLogisticsId()).isNull();
	}
}
