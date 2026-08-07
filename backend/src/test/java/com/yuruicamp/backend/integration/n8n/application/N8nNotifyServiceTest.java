package com.yuruicamp.backend.integration.n8n.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;

import com.sun.net.httpserver.HttpServer;
import com.yuruicamp.backend.config.YuruicampProperties;
import com.yuruicamp.backend.customer.domain.Customer;
import com.yuruicamp.backend.customer.infrastructure.CustomerRepository;
import com.yuruicamp.backend.order.application.OrderNotificationRequestedEvent;
import com.yuruicamp.backend.order.application.OrderStatusChangedEvent;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class N8nNotifyServiceTest {

	@Mock
	private CustomerRepository customerRepository;

	private final List<String> receivedBodies = new CopyOnWriteArrayList<>();
	private final List<String> receivedSecretHeaders = new CopyOnWriteArrayList<>();

	private YuruicampProperties properties;
	private N8nNotifyService service;
	private HttpServer webhookServer;

	@BeforeEach
	void setUp() throws IOException {
		properties = new YuruicampProperties();
		service = new N8nNotifyService(customerRepository, properties);

		webhookServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		webhookServer.createContext("/notify", exchange -> {
			receivedBodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
			receivedSecretHeaders.add(exchange.getRequestHeaders().getFirst("X-Yuruicamp-Notify-Secret"));
			exchange.sendResponseHeaders(200, -1);
			exchange.close();
		});
		webhookServer.start();
	}

	@AfterEach
	void tearDown() {
		webhookServer.stop(0);
	}

	@Test
	void doesNotCallWebhookWhenCustomerNotLinkedToLine() {
		properties.getN8n().setNotifyWebhookUrl(webhookUrl());
		properties.getN8n().setNotifySecret("local-test-secret");
		when(customerRepository.findById("C1")).thenReturn(Optional.of(customer(null)));

		service.notifyOrderEvent(sampleEvent("shipped"));

		assertThat(receivedBodies).isEmpty();
	}

	@Test
	void postsRichPayloadWithSecretHeaderWhenCustomerLinked() {
		properties.getN8n().setNotifyWebhookUrl(webhookUrl());
		properties.getN8n().setNotifySecret("local-test-secret");
		when(customerRepository.findById("C1")).thenReturn(Optional.of(customer("Uline1")));

		service.notifyOrderEvent(sampleEvent("shipped"));

		assertThat(receivedBodies).hasSize(1);
		String body = receivedBodies.get(0);
		assertThat(body).contains("\"lineUserId\":\"Uline1\"");
		assertThat(body).contains("\"orderId\":\"O1\"");
		assertThat(body).contains("\"orderDisplayNo\":\"YC-001\"");
		assertThat(body).contains("\"status\":\"shipped\"");
		assertThat(body).contains("\"paymentStatus\":\"paid\"");
		assertThat(body).contains("\"shippingMethod\":\"delivery\"");
		assertThat(body).contains("\"event\":\"shipped\"");
		assertThat(receivedSecretHeaders.get(0)).isEqualTo("local-test-secret");
	}

	@Test
	void doesNotCallOrThrowWhenWebhookUrlAndSecretBothNotConfigured() {
		assertThatCode(() -> service.notifyOrderEvent(sampleEvent("shipped")))
				.doesNotThrowAnyException();

		assertThat(receivedBodies).isEmpty();
		verifyNoInteractions(customerRepository);
	}

	@Test
	void doesNotCallWhenWebhookUrlConfiguredButSecretBlank() {
		properties.getN8n().setNotifyWebhookUrl(webhookUrl());
		// notifySecret 未設定：URL 有設定但密鑰空白視同停用，避免送出空密鑰 Header

		service.notifyOrderEvent(sampleEvent("shipped"));

		assertThat(receivedBodies).isEmpty();
		verifyNoInteractions(customerRepository);
	}

	@Test
	void doesNotThrowWhenHttpCallFails() {
		// 127.0.0.1:1 沒有服務在監聽，連線會被立即拒絕，用來模擬呼叫失敗
		properties.getN8n().setNotifyWebhookUrl("http://127.0.0.1:1/notify");
		properties.getN8n().setNotifySecret("local-test-secret");
		when(customerRepository.findById("C1")).thenReturn(Optional.of(customer("Uline1")));

		assertThatCode(() -> service.notifyOrderEvent(sampleEvent("shipped")))
				.doesNotThrowAnyException();
	}

	@Test
	void doesNotCallWebhookForCsInquiryWhenCustomerNotLinkedToLine() {
		properties.getN8n().setNotifyWebhookUrl(webhookUrl());
		properties.getN8n().setNotifySecret("local-test-secret");
		when(customerRepository.findById("C1")).thenReturn(Optional.of(customer(null)));

		service.notifyOrderEvent(sampleCsInquiryEvent());

		assertThat(receivedBodies).isEmpty();
	}

	@Test
	void postsCsInquiryPayloadWithSecretHeaderWhenCustomerLinked() {
		properties.getN8n().setNotifyWebhookUrl(webhookUrl());
		properties.getN8n().setNotifySecret("local-test-secret");
		when(customerRepository.findById("C1")).thenReturn(Optional.of(customer("Uline1")));

		service.notifyOrderEvent(sampleCsInquiryEvent());

		assertThat(receivedBodies).hasSize(1);
		String body = receivedBodies.get(0);
		assertThat(body).contains("\"lineUserId\":\"Uline1\"");
		assertThat(body).contains("\"orderId\":\"O1\"");
		assertThat(body).contains("\"orderDisplayNo\":\"YC-001\"");
		assertThat(body).contains("\"event\":\"cs_inquiry\"");
		assertThat(receivedSecretHeaders.get(0)).isEqualTo("local-test-secret");
	}

	@Test
	void doesNotCallOrThrowForCsInquiryWhenWebhookNotConfigured() {
		assertThatCode(() -> service.notifyOrderEvent(sampleCsInquiryEvent()))
				.doesNotThrowAnyException();

		assertThat(receivedBodies).isEmpty();
		verifyNoInteractions(customerRepository);
	}

	@Test
	void doesNotThrowForCsInquiryWhenHttpCallFails() {
		properties.getN8n().setNotifyWebhookUrl("http://127.0.0.1:1/notify");
		properties.getN8n().setNotifySecret("local-test-secret");
		when(customerRepository.findById("C1")).thenReturn(Optional.of(customer("Uline1")));

		assertThatCode(() -> service.notifyOrderEvent(sampleCsInquiryEvent()))
				.doesNotThrowAnyException();
	}

	private String webhookUrl() {
		return "http://127.0.0.1:" + webhookServer.getAddress().getPort() + "/notify";
	}

	private static OrderStatusChangedEvent sampleEvent(String event) {
		return new OrderStatusChangedEvent("O1", "C1", "YC-001", event, "paid", "delivery", event);
	}

	private static OrderNotificationRequestedEvent sampleCsInquiryEvent() {
		return new OrderNotificationRequestedEvent("O1", "C1", "YC-001", "unshipped", "unpaid", "delivery", "cs_inquiry");
	}

	private static Customer customer(String lineUserId) {
		Customer customer = new Customer();
		customer.setId("C1");
		customer.setLineUserId(lineUserId);

		return customer;
	}
}
