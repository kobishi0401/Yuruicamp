package com.yuruicamp.backend.logistics.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.logistics.infrastructure.EcpayLogisticsGateway;
import com.yuruicamp.backend.order.api.AdminLogisticsPrintLaunchResponse;
import com.yuruicamp.backend.order.domain.Order;
import com.yuruicamp.backend.order.domain.PaymentMethod;
import com.yuruicamp.backend.order.domain.ShippingMethod;
import com.yuruicamp.backend.order.infrastructure.OrderRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class EcpayLogisticsPrintServiceTest {

	@Mock
	private OrderRepository orders;

	@Mock
	private EcpayLogisticsGateway logisticsGateway;

	private EcpayLogisticsPrintService service;

	@BeforeEach
	void setUp() {
		service = new EcpayLogisticsPrintService(orders, logisticsGateway);
	}

	@Test
	void launchReturnsActionUrlAndSignedFields() {
		Order order = orderWithLogisticsId("1234567");
		when(orders.findById("O1")).thenReturn(Optional.of(order));
		when(logisticsGateway.isStub()).thenReturn(false);
		Map<String, String> fields = new LinkedHashMap<>();
		fields.put("MerchantID", "2000132");
		fields.put("AllPayLogisticsID", "1234567");
		fields.put("CheckMacValue", "ABC");
		when(logisticsGateway.buildPrintTradeDocumentFields("1234567")).thenReturn(fields);
		when(logisticsGateway.printTradeDocumentActionUrl())
				.thenReturn("https://logistics-stage.ecpay.com.tw/helper/printTradeDocument");

		AdminLogisticsPrintLaunchResponse launch = service.launchPrintTradeDocument("O1");

		assertThat(launch.orderId()).isEqualTo("O1");
		assertThat(launch.actionUrl()).endsWith("/helper/printTradeDocument");
		assertThat(launch.fields()).containsEntry("AllPayLogisticsID", "1234567");
		assertThat(launch.fields()).containsKey("CheckMacValue");
		verify(logisticsGateway).buildPrintTradeDocumentFields("1234567");
	}

	@Test
	void launchRejectsWhenStubEnabled() {
		when(orders.findById("O1")).thenReturn(Optional.of(orderWithLogisticsId("1234567")));
		when(logisticsGateway.isStub()).thenReturn(true);

		assertThatThrownBy(() -> service.launchPrintTradeDocument("O1"))
				.isInstanceOf(BusinessException.class)
				.hasMessageContaining("stub");
	}

	@Test
	void launchRejectsStubPrefixedLogisticsId() {
		when(orders.findById("O1")).thenReturn(Optional.of(orderWithLogisticsId("STUB123")));
		when(logisticsGateway.isStub()).thenReturn(false);

		assertThatThrownBy(() -> service.launchPrintTradeDocument("O1"))
				.isInstanceOf(BusinessException.class)
				.hasMessageContaining("stub logistics id");
	}

	@Test
	void launchRejectsMissingLogisticsId() {
		Order order = orderWithLogisticsId(null);
		when(orders.findById("O1")).thenReturn(Optional.of(order));

		assertThatThrownBy(() -> service.launchPrintTradeDocument("O1"))
				.isInstanceOf(BusinessException.class)
				.hasMessageContaining("no ECPay logistics id");
	}

	private static Order orderWithLogisticsId(String logisticsId) {
		Order order = new Order();
		order.initialize(
				"O1",
				"ORD-0001",
				"C1",
				null,
				null,
				"Buyer",
				"buyer@example.test",
				"收件人",
				"台北市",
				"0912345678",
				ShippingMethod.delivery,
				null,
				PaymentMethod.ecpay_credit,
				Instant.EPOCH,
				null);
		order.setPricing(BigDecimal.TEN, BigDecimal.ZERO, BigDecimal.ZERO);
		if (logisticsId != null) {
			order.assignEcpayLogistics(logisticsId, null);
		}
		return order;
	}
}
