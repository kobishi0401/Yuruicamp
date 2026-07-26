package com.yuruicamp.backend.payment.application;

import static org.assertj.core.api.Assertions.assertThat;

import static org.mockito.Mockito.when;

import java.util.Map;
import java.util.Optional;

import com.yuruicamp.backend.commerce.application.DisplayNoService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class EcpayReturnServiceTest {

	@Mock
	private DisplayNoService displayNoService;

	@Test
	void redirectsOrderSuccessWithoutMarkingPaid() {
		var props = new com.yuruicamp.backend.config.YuruicampProperties();
		props.getEcpay().setFrontendBaseUrl("http://127.0.0.1:5173");
		props.getEcpay().setOrderSuccessPath("/storefront/pages/checkout-success.html");
		when(displayNoService.findOrderDisplayNo("O-TEST-1")).thenReturn(Optional.of("ORD-0042"));
		var service = new EcpayReturnService(props, displayNoService);

		String url = service.resolveFrontendRedirect(Map.of(
				"RtnCode", "1",
				"CustomField1", "order:O-TEST-1",
				"MerchantTradeNo", "YABC"));

		assertThat(url).startsWith("http://127.0.0.1:5173/storefront/pages/checkout-success.html?");
		assertThat(url).contains("orderId=O-TEST-1");
		assertThat(url).contains("displayNo=ORD-0042");
		assertThat(url).doesNotContain("paymentResult=failed");
	}

	@Test
	void redirectsBookingFailure() {
		var props = new com.yuruicamp.backend.config.YuruicampProperties();
		props.getEcpay().setFrontendBaseUrl("http://127.0.0.1:5173/");
		props.getEcpay().setBookingFailurePath("/booking/pages/booking-checkout.html");
		when(displayNoService.findBookingDisplayNo("B-TEST-1")).thenReturn(Optional.empty());
		var service = new EcpayReturnService(props, displayNoService);

		String url = service.resolveFrontendRedirect(Map.of(
				"RtnCode", "0",
				"CustomField1", "booking:B-TEST-1"));

		assertThat(url).contains("/booking/pages/booking-checkout.html?");
		assertThat(url).contains("bookingId=B-TEST-1");
		assertThat(url).contains("paymentResult=failed");
	}
}
