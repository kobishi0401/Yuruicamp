package com.yuruicamp.backend.logistics.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import com.yuruicamp.backend.config.YuruicampProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class EcpayLogisticsGatewayImplTest {

	private YuruicampProperties properties;
	private EcpayLogisticsGatewayImpl gateway;

	@BeforeEach
	void setUp() {
		properties = new YuruicampProperties();
		properties.getEcpay().setPublicApiBaseUrl("https://example.ngrok.app/api");
		properties.getEcpayLogistics().setHomeLogisticsSubType("TCAT");
		gateway = new EcpayLogisticsGatewayImpl(properties);
	}

	@Test
	void buildCreateHomeFieldsIncludesHomeTcatAndReceiverAddress() {
		var fields = gateway.buildCreateHomeFields(
				"ORD0001123456",
				"2026/07/29 12:00:00",
				500,
				"Yuruicamp商品",
				"Yuruicamp",
				"0912345678",
				"王小明",
				"0911222333",
				"台北市信義區信義路五段7號",
				"TCAT");

		assertThat(fields.get("LogisticsType")).isEqualTo("HOME");
		assertThat(fields.get("LogisticsSubType")).isEqualTo("TCAT");
		assertThat(fields.get("ReceiverAddress")).isEqualTo("台北市信義區信義路五段7號");
		assertThat(fields.get("ReceiverName")).isEqualTo("王小明");
		assertThat(fields.get("ReceiverCellPhone")).isEqualTo("0911222333");
		assertThat(fields).doesNotContainKey("ReceiverStoreID");
		assertThat(fields.get("ServerReplyURL")).isEqualTo("https://example.ngrok.app/api/logistics/ecpay/notify");
		assertThat(fields.get("CheckMacValue")).isNotBlank();
	}

	@Test
	void buildCreateCvsFieldsStillUsesCvsAndStoreId() {
		var fields = gateway.buildCreateCvsFields(
				"ORD0001123456",
				"2026/07/29 12:00:00",
				500,
				"Yuruicamp商品",
				"Yuruicamp",
				"0912345678",
				"王小明",
				"0911222333",
				"006598",
				"FAMI");

		assertThat(fields.get("LogisticsType")).isEqualTo("CVS");
		assertThat(fields.get("LogisticsSubType")).isEqualTo("FAMI");
		assertThat(fields.get("ReceiverStoreID")).isEqualTo("006598");
		assertThat(fields).doesNotContainKey("ReceiverAddress");
	}
}
