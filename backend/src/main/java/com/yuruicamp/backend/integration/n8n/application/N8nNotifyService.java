package com.yuruicamp.backend.integration.n8n.application;

import java.time.Duration;
import java.time.Instant;

import com.yuruicamp.backend.config.YuruicampProperties;
import com.yuruicamp.backend.customer.domain.Customer;
import com.yuruicamp.backend.customer.infrastructure.CustomerRepository;
import com.yuruicamp.backend.order.application.OrderNotificationRequestedEvent;
import com.yuruicamp.backend.order.application.OrderStatusChangedEvent;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

/**
 * 訂單狀態變更後主動通知 n8n（後端 -> n8n），供 n8n 呼叫 LINE Push Message API 推播給會員。
 * Fire-and-forget：任何失敗都在內部吞掉並記 warn log，呼叫方不可因此受影響。
 */
@Service
public class N8nNotifyService {

	private static final Logger log = LoggerFactory.getLogger(N8nNotifyService.class);
	private static final Duration HTTP_TIMEOUT = Duration.ofSeconds(3);
	private static final String SECRET_HEADER = "X-Yuruicamp-Notify-Secret";

	private final CustomerRepository customerRepository;
	private final YuruicampProperties.N8n n8nProperties;
	private final RestClient restClient;

	public N8nNotifyService(CustomerRepository customerRepository, YuruicampProperties properties) {
		this.customerRepository = customerRepository;
		this.n8nProperties = properties.getN8n();
		this.restClient = buildRestClient();
	}

	/**
	 * 通知 n8n 一筆訂單狀態變更事件；會員未綁定 LINE、或 Webhook URL／密鑰任一未設定時皆為 no-op。
	 */
	public void notifyOrderEvent(OrderStatusChangedEvent event) {
		try {
			doNotify(event.orderId(), event.customerId(), event.displayNo(),
					event.status(), event.paymentStatus(), event.shippingMethod(), event.event());
		}
		catch (Exception ex) {
			// 通知失敗不可影響訂單主流程，這裡是最後防線
			log.warn("n8n order event notify failed: orderId={}, event={}", event.orderId(), event.event(), ex);
		}
	}

	/**
	 * 通知 n8n 一筆會員主動要求的通知（非訂單狀態變更）；同樣 fire-and-forget，共用同一段 webhook 邏輯。
	 */
	public void notifyOrderEvent(OrderNotificationRequestedEvent event) {
		try {
			doNotify(event.orderId(), event.customerId(), event.displayNo(),
					event.status(), event.paymentStatus(), event.shippingMethod(), event.event());
		}
		catch (Exception ex) {
			log.warn("n8n cs-inquiry notify failed: orderId={}, event={}", event.orderId(), event.event(), ex);
		}
	}

	private void doNotify(
			String orderId,
			String customerId,
			String displayNo,
			String status,
			String paymentStatus,
			String shippingMethod,
			String eventName) {
		String webhookUrl = n8nProperties.getNotifyWebhookUrl();
		String secret = n8nProperties.getNotifySecret();
		if (!StringUtils.hasText(webhookUrl) || !StringUtils.hasText(secret)) {
			log.debug("n8n notify webhook not configured, skip: orderId={}, event={}", orderId, eventName);
			return;
		}

		String lineUserId = customerRepository.findById(customerId)
				.map(Customer::getLineUserId)
				.orElse(null);
		if (!StringUtils.hasText(lineUserId)) {
			return;
		}

		NotifyPayload payload = new NotifyPayload(
				lineUserId,
				orderId,
				displayNo,
				status,
				paymentStatus,
				shippingMethod,
				eventName,
				Instant.now().toString());
		restClient.post()
				.uri(webhookUrl)
				.header(SECRET_HEADER, secret)
				.body(payload)
				.retrieve()
				.toBodilessEntity();
	}

	private static RestClient buildRestClient() {
		SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
		requestFactory.setConnectTimeout((int) HTTP_TIMEOUT.toMillis());
		requestFactory.setReadTimeout((int) HTTP_TIMEOUT.toMillis());

		return RestClient.builder()
				.requestFactory(requestFactory)
				.build();
	}

	private record NotifyPayload(
			String lineUserId,
			String orderId,
			String orderDisplayNo,
			String status,
			String paymentStatus,
			String shippingMethod,
			String event,
			String occurredAt) {
	}
}
