package com.yuruicamp.backend.logistics.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
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
import com.yuruicamp.backend.logistics.domain.EcpayLogisticsCreateResult;
import com.yuruicamp.backend.logistics.infrastructure.EcpayLogisticsGateway;
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
class EcpayLogisticsCreateServiceTest {

	private static final String DELIVERY_ADDRESS = "408 臺中市 南屯區 公益路190號";

	@Mock
	private OrderRepository orders;

	@Mock
	private EcpayLogisticsGateway logisticsGateway;

	private YuruicampProperties properties;
	private EcpayLogisticsCreateService service;

	@BeforeEach
	void setUp() {
		properties = new YuruicampProperties();
		properties.getEcpay().setPublicApiBaseUrl("https://example.ngrok.app/api");
		properties.getEcpayLogistics().setLogisticsSubType("FAMI");
		properties.getEcpayLogistics().setHomeLogisticsSubType("TCAT");
		service = new EcpayLogisticsCreateService(orders, logisticsGateway, properties);
	}

	@Test
	void deliveryOrderCreatesHomeShipmentWithAddressSnapshot() {
		Order order = deliveryOrder("O1", "王小明", "0912345678", DELIVERY_ADDRESS);
		when(orders.findByIdForUpdate("O1")).thenReturn(Optional.of(order));
		when(logisticsGateway.buildCreateHomeFields(
				anyString(), anyString(), anyInt(), anyString(), anyString(), anyString(),
				anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), eq("TCAT")))
				.thenReturn(Map.of("LogisticsType", "HOME"));
		when(logisticsGateway.createHomeOrder(any()))
				.thenReturn(new EcpayLogisticsCreateResult(true, "1", "OK", "LG123", null, "ORD0001123456"));

		EcpayLogisticsCreateResult result = service.createShipment("O1");

		assertThat(result.allPayLogisticsId()).isEqualTo("LG123");
		assertThat(order.getEcpayLogisticsId()).isEqualTo("LG123");
		verify(logisticsGateway).createHomeOrder(any());
		verify(logisticsGateway, never()).createCvsOrder(any());
		verify(orders).save(order);
	}

	@Test
	void deliveryOrderWithPendingAddressCannotShip() {
		Order order = deliveryOrder("O1", "PENDING_CHECKOUT", "0912345678", "台北市信義區");
		when(orders.findByIdForUpdate("O1")).thenReturn(Optional.of(order));

		assertThatThrownBy(() -> service.createShipment("O1"))
				.isInstanceOf(BusinessException.class)
				.hasMessageContaining("Shipping address is incomplete");
	}

	@Test
	void deliveryOrderWithoutPostalCodeCannotShip() {
		Order order = deliveryOrder("O1", "王小明", "0912345678", "臺中市 南屯區 公益路190號");
		when(orders.findByIdForUpdate("O1")).thenReturn(Optional.of(order));

		assertThatThrownBy(() -> service.createShipment("O1"))
				.isInstanceOf(BusinessException.class)
				.hasMessageContaining("postal code");
	}

	@Test
	void cvsOrderStillCreatesCvsShipment() {
		Order order = cvsOrder("O1", "006598");
		when(orders.findByIdForUpdate("O1")).thenReturn(Optional.of(order));
		when(logisticsGateway.buildCreateCvsFields(
				anyString(), anyString(), anyInt(), anyString(), anyString(), anyString(),
				anyString(), anyString(), eq("006598"), eq("FAMI")))
				.thenReturn(Map.of("LogisticsType", "CVS"));
		when(logisticsGateway.createCvsOrder(any()))
				.thenReturn(new EcpayLogisticsCreateResult(true, "1", "OK", "CVS123", "999", "ORD0001123456"));

		service.createShipment("O1");

		verify(logisticsGateway).createCvsOrder(any());
		verify(logisticsGateway, never()).createHomeOrder(any());
	}

	@Test
	void pickupOrderDoesNotCallGateway() {
		Order order = pickupOrder("O1");
		when(orders.findByIdForUpdate("O1")).thenReturn(Optional.of(order));

		EcpayLogisticsCreateResult result = service.createShipment("O1");

		assertThat(result).isNull();
		verify(logisticsGateway, never()).createCvsOrder(any());
		verify(logisticsGateway, never()).createHomeOrder(any());
		verify(orders, never()).save(any());
	}

	@Test
	void alreadyCreatedLogisticsIsIdempotent() {
		Order order = deliveryOrder("O1", "王小明", "0912345678", DELIVERY_ADDRESS);
		order.assignEcpayLogistics("EXISTING123", null);
		when(orders.findByIdForUpdate("O1")).thenReturn(Optional.of(order));

		EcpayLogisticsCreateResult result = service.createShipment("O1");

		assertThat(result.success()).isTrue();
		assertThat(result.allPayLogisticsId()).isEqualTo("EXISTING123");
		verify(logisticsGateway, never()).createHomeOrder(any());
		verify(orders, never()).save(any());
	}

	@Test
	void homeCreateSuccessWithoutLogisticsIdThrowsConflictAndDoesNotSave() {
		Order order = deliveryOrder("O1", "王小明", "0912345678", DELIVERY_ADDRESS);
		when(orders.findByIdForUpdate("O1")).thenReturn(Optional.of(order));
		when(logisticsGateway.buildCreateHomeFields(
				anyString(), anyString(), anyInt(), anyString(), anyString(), anyString(),
				anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), anyString()))
				.thenReturn(Map.of("LogisticsType", "HOME"));
		when(logisticsGateway.createHomeOrder(any()))
				.thenReturn(new EcpayLogisticsCreateResult(true, "1", "OK", null, null, "ORD0229"));

		assertThatThrownBy(() -> service.createShipment("O1"))
				.isInstanceOf(BusinessException.class)
				.hasMessageContaining("AllPayLogisticsID is missing");
		verify(orders, never()).save(any());
		assertThat(order.getEcpayLogisticsId()).isNull();
	}

	@Test
	void homeCreateFailureThrowsConflict() {
		Order order = deliveryOrder("O1", "王小明", "0912345678", DELIVERY_ADDRESS);
		when(orders.findByIdForUpdate("O1")).thenReturn(Optional.of(order));
		when(logisticsGateway.buildCreateHomeFields(
				anyString(), anyString(), anyInt(), anyString(), anyString(), anyString(),
				anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), anyString()))
				.thenReturn(Map.of("LogisticsType", "HOME"));
		when(logisticsGateway.createHomeOrder(any()))
				.thenReturn(EcpayLogisticsCreateResult.failed("10500040", "ReceiverAddress invalid"));

		assertThatThrownBy(() -> service.createShipment("O1"))
				.isInstanceOf(BusinessException.class)
				.hasMessageContaining("ECPay logistics create failed");
	}

	@Test
	void homeFieldsParseReceiverZipAndUseConfiguredSender() {
		Order order = deliveryOrder("O1", "王小明", "0912345678", DELIVERY_ADDRESS);
		when(orders.findByIdForUpdate("O1")).thenReturn(Optional.of(order));
		when(logisticsGateway.buildCreateHomeFields(
				anyString(), anyString(), anyInt(), anyString(), anyString(), anyString(),
				anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), eq("TCAT")))
				.thenReturn(Map.of("LogisticsType", "HOME"));
		when(logisticsGateway.createHomeOrder(any()))
				.thenReturn(new EcpayLogisticsCreateResult(true, "1", "OK", "LG123", null, "ORD0001123456"));

		service.createShipment("O1");

		verify(logisticsGateway).buildCreateHomeFields(
				anyString(), anyString(), anyInt(), anyString(), anyString(), anyString(),
				eq("100"), eq("台北市中正區忠孝西路一段50號"),
				eq("王小明"), eq("0912345678"), eq("408"), eq("台中市南屯區公益路190號"), eq("TCAT"));
	}

	@Test
	void cvsOrderRejectsInvalidRecipientBeforeGateway() {
		Order order = cvsOrder("O1", "006598");
		order.updateShipping("Po-Jung Chen", "0912345678", order.getShippingAddress(),
				ShippingMethod.cvs, null, order.getCvsStoreId(), order.getCvsStoreName(), order.getCvsSubType());
		when(orders.findByIdForUpdate("O1")).thenReturn(Optional.of(order));

		assertThatThrownBy(() -> service.createShipment("O1"))
				.isInstanceOf(BusinessException.class)
				.hasMessageContaining("綠界物流格式");
		verify(logisticsGateway, never()).createCvsOrder(any());
	}

	private static Order deliveryOrder(String id, String name, String phone, String address) {
		Order order = new Order();
		order.initialize(
				id, "ORD-0001", "C1", null, null,
				"Buyer", "buyer@test.com", name, address, phone,
				ShippingMethod.delivery, null, PaymentMethod.ecpay_credit, Instant.now(), null);
		order.setPricing(BigDecimal.valueOf(100), BigDecimal.ZERO, BigDecimal.ZERO);
		return order;
	}

	private static Order cvsOrder(String id, String storeId) {
		Order order = new Order();
		order.initialize(
				id, "ORD-0001", "C1", null, null,
				"Buyer", "buyer@test.com", "Recipient", "全家門市地址", "0912345678",
				ShippingMethod.cvs, null, storeId, "全家測試店", "FAMI",
				PaymentMethod.ecpay_credit, Instant.now(), null);
		order.setPricing(BigDecimal.valueOf(100), BigDecimal.ZERO, BigDecimal.ZERO);
		return order;
	}

	private static Order pickupOrder(String id) {
		Order order = new Order();
		order.initialize(
				id, "ORD-0001", "C1", null, null,
				"Buyer", "buyer@test.com", "Recipient", "門市自取", "0912345678",
				ShippingMethod.pickup, "BR001", PaymentMethod.ecpay_credit, Instant.now(), null);
		order.setPricing(BigDecimal.valueOf(100), BigDecimal.ZERO, BigDecimal.ZERO);
		return order;
	}
}
