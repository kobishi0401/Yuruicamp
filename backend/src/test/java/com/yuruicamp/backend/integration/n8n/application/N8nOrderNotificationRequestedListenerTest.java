package com.yuruicamp.backend.integration.n8n.application;

import static org.mockito.Mockito.verify;

import com.yuruicamp.backend.order.application.OrderNotificationRequestedEvent;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class N8nOrderNotificationRequestedListenerTest {

	@Mock
	private N8nNotifyService n8nNotifyService;

	private N8nOrderNotificationRequestedListener listener;

	@BeforeEach
	void setUp() {
		listener = new N8nOrderNotificationRequestedListener(n8nNotifyService);
	}

	@Test
	void delegatesEventToNotifyService() {
		OrderNotificationRequestedEvent event =
				new OrderNotificationRequestedEvent("O1", "C1", "YC-001", "unshipped", "unpaid", "delivery", "cs_inquiry");

		listener.onOrderNotificationRequested(event);

		verify(n8nNotifyService).notifyOrderEvent(event);
	}
}
