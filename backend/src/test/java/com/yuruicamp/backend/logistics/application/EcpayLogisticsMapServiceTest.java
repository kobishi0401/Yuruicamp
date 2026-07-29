package com.yuruicamp.backend.logistics.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.config.YuruicampProperties;
import com.yuruicamp.backend.logistics.infrastructure.EcpayLogisticsGateway;
import com.yuruicamp.backend.logistics.infrastructure.EcpayLogisticsMapSessionRepository;
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
class EcpayLogisticsMapServiceTest {

	@Mock
	private OrderRepository orders;

	@Mock
	private EcpayLogisticsGateway logisticsGateway;

	@Mock
	private EcpayLogisticsMapSessionRepository mapSessions;

	private YuruicampProperties properties;
	private EcpayLogisticsMapService service;

	@BeforeEach
	void setUp() {
		properties = new YuruicampProperties();
		properties.getEcpay().setFrontendBaseUrl("http://127.0.0.1:5173");
		properties.getEcpayLogistics().setLogisticsSubType("FAMI");
		service = new EcpayLogisticsMapService(orders, logisticsGateway, mapSessions, properties);
	}

	@Test
	void applyMapResultWithoutCheckMacValueAcceptsRealSandboxCallback() {
		Order order = pendingOrder("O1");
		when(logisticsGateway.merchantId()).thenReturn("2000132");
		when(mapSessions.findOrderId("ORD0228844871")).thenReturn(Optional.of("O1"));
		when(orders.findByIdForUpdate("O1")).thenReturn(Optional.of(order));

		Map<String, String> params = Map.of(
				"MerchantID", "2000132",
				"MerchantTradeNo", "ORD0228844871",
				"LogisticsSubType", "FAMI",
				"CVSStoreID", "006598",
				"CVSStoreName", "台醫店",
				"CVSAddress", "台北市中正區中山南路７號１樓",
				"CVSOutSide", "0");

		String redirect = service.applyMapResult(params);

		assertThat(redirect).contains("cvsMap=ok").contains("orderId=O1");
		assertThat(order.getShippingMethod()).isEqualTo(ShippingMethod.cvs);
		assertThat(order.getCvsStoreId()).isEqualTo("006598");
		verify(logisticsGateway, never()).verifyCallback(any());
		verify(orders).save(order);
	}

	@Test
	void applyMapResultWithCheckMacValueStillVerifiesStubSignature() {
		Order order = pendingOrder("O1");
		when(logisticsGateway.merchantId()).thenReturn("2000132");
		when(logisticsGateway.verifyCallback(any())).thenReturn(true);
		when(mapSessions.findOrderId("ORD0001123456")).thenReturn(Optional.of("O1"));
		when(orders.findByIdForUpdate("O1")).thenReturn(Optional.of(order));

		Map<String, String> params = Map.of(
				"MerchantID", "2000132",
				"MerchantTradeNo", "ORD0001123456",
				"CVSStoreID", "006598",
				"CVSStoreName", "Stub店",
				"CVSAddress", "台北市",
				"CheckMacValue", "ABC123");

		service.applyMapResult(params);

		verify(logisticsGateway).verifyCallback(params);
	}

	@Test
	void applyMapResultRejectsWrongMerchantId() {
		when(logisticsGateway.merchantId()).thenReturn("2000132");

		Map<String, String> params = Map.of(
				"MerchantID", "9999999",
				"MerchantTradeNo", "ORD0228844871",
				"CVSStoreID", "006598");

		assertThatThrownBy(() -> service.applyMapResult(params))
				.isInstanceOf(BusinessException.class)
				.hasMessageContaining("Invalid logistics map MerchantID");
	}

	@Test
	void applyMapResultRejectsTamperedStubCheckMacValue() {
		when(logisticsGateway.merchantId()).thenReturn("2000132");
		when(logisticsGateway.verifyCallback(any())).thenReturn(false);

		Map<String, String> params = Map.of(
				"MerchantID", "2000132",
				"MerchantTradeNo", "ORD0001123456",
				"CVSStoreID", "006598",
				"CheckMacValue", "BAD");

		assertThatThrownBy(() -> service.applyMapResult(params))
				.isInstanceOf(BusinessException.class)
				.hasMessageContaining("Invalid logistics map CheckMacValue");
	}

	private static Order pendingOrder(String id) {
		Order order = new Order();
		order.initialize(
				id, "ORD-0001", "C1", null, null,
				"Buyer", "buyer@test.com", "Recipient", "PENDING_CHECKOUT", "0912345678",
				ShippingMethod.delivery, null, PaymentMethod.ecpay_credit, Instant.now(),
				Instant.now().plusSeconds(3600));
		order.setPricing(BigDecimal.TEN, BigDecimal.ZERO, BigDecimal.ZERO);
		return order;
	}
}
