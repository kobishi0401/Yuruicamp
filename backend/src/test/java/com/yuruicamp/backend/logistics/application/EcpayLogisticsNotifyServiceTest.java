package com.yuruicamp.backend.logistics.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

import com.yuruicamp.backend.logistics.infrastructure.EcpayLogisticsGateway;
import com.yuruicamp.backend.order.domain.Order;
import com.yuruicamp.backend.order.domain.OrderStatus;
import com.yuruicamp.backend.order.domain.PaymentMethod;
import com.yuruicamp.backend.order.domain.ShippingMethod;
import com.yuruicamp.backend.order.infrastructure.OrderRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class EcpayLogisticsNotifyServiceTest {

	@Mock
	private EcpayLogisticsGateway logisticsGateway;

	@Mock
	private OrderRepository orders;

	private EcpayLogisticsNotifyService service;

	@BeforeEach
	void setUp() {
		service = new EcpayLogisticsNotifyService(logisticsGateway, orders);
	}

	@Test
	void handleOverwritesLogisticsStatusSnapshotWithoutChangingOrderStatus() {
		Order order = orderWithLogisticsId("1234567");
		when(orders.findByEcpayLogisticsIdForUpdate("1234567")).thenReturn(Optional.of(order));

		service.handle(Map.of(
				"AllPayLogisticsID", "1234567",
				"MerchantTradeNo", "ORD0001123456",
				"RtnCode", "300",
				"RtnMsg", "訂單處理中"));

		ArgumentCaptor<Order> saved = ArgumentCaptor.forClass(Order.class);
		verify(orders).save(saved.capture());
		assertThat(saved.getValue().getEcpayLogisticsRtnCode()).isEqualTo("300");
		assertThat(saved.getValue().getEcpayLogisticsRtnMsg()).isEqualTo("訂單處理中");
		assertThat(saved.getValue().getEcpayLogisticsStatusAt()).isNotNull();
		assertThat(saved.getValue().getStatus()).isEqualTo(OrderStatus.unshipped);
	}

	@Test
	void handleIsIdempotentWhenCodeAndMsgUnchanged() {
		Order order = orderWithLogisticsId("1234567");
		order.applyLogisticsStatusSnapshot("300", "訂單處理中", Instant.parse("2026-07-30T00:00:00Z"));
		when(orders.findByEcpayLogisticsIdForUpdate("1234567")).thenReturn(Optional.of(order));

		service.handle(Map.of(
				"AllPayLogisticsID", "1234567",
				"RtnCode", "300",
				"RtnMsg", "訂單處理中"));

		verify(orders, never()).save(any());
		assertThat(order.getStatus()).isEqualTo(OrderStatus.unshipped);
	}

	@Test
	void handleUnmatchedLogisticsIdDoesNotSave() {
		when(orders.findByEcpayLogisticsIdForUpdate("999")).thenReturn(Optional.empty());

		service.handle(Map.of(
				"AllPayLogisticsID", "999",
				"RtnCode", "300",
				"RtnMsg", "訂單處理中"));

		verify(orders, never()).save(any());
	}

	@Test
	void verifyDelegatesToGateway() {
		Map<String, String> params = Map.of("CheckMacValue", "ABC");
		when(logisticsGateway.verifyCallback(params)).thenReturn(true);

		assertThat(service.verify(params)).isTrue();
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
		order.assignEcpayLogistics(logisticsId, null);
		return order;
	}
}
