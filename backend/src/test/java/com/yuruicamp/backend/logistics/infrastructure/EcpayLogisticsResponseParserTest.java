package com.yuruicamp.backend.logistics.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import com.yuruicamp.backend.logistics.domain.EcpayLogisticsCreateResult;
import org.junit.jupiter.api.Test;

class EcpayLogisticsResponseParserTest {

	@Test
	void parsesSuccessfulCreateResponse() {
		String body = "1|OK|AllPayLogisticsID=1234567&CVSPaymentNo=999&MerchantTradeNo=ORD0001123456";

		EcpayLogisticsCreateResult result = EcpayLogisticsResponseParser.parseCreateResponse(body);

		assertThat(result.success()).isTrue();
		assertThat(result.allPayLogisticsId()).isEqualTo("1234567");
		assertThat(result.cvsPaymentNo()).isEqualTo("999");
		assertThat(result.merchantTradeNo()).isEqualTo("ORD0001123456");
	}

	@Test
	void parsesFailedCreateResponse() {
		EcpayLogisticsCreateResult result = EcpayLogisticsResponseParser.parseCreateResponse("10500040|GoodsAmount out of range|");

		assertThat(result.success()).isFalse();
		assertThat(result.rtnCode()).isEqualTo("10500040");
	}
}
