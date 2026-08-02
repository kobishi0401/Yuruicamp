package com.yuruicamp.backend.integration.n8n.application;

import com.yuruicamp.backend.order.application.OrderNotificationRequestedEvent;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 會員主動要求通知（例如「使用 LINE 追蹤訂單」）交易 commit 後才觸發 n8n 推播。
 * 與 {@link N8nOrderNotifyListener} 同構：{@code @Async("n8nNotifyExecutor")} 讓實際的 n8n HTTP 呼叫
 * 改在背景執行緒池執行，不會佔用會員 API 的 request 執行緒。例外處理已在 {@link N8nNotifyService} 內完成。
 */
@Component
public class N8nOrderNotificationRequestedListener {

	private final N8nNotifyService n8nNotifyService;

	public N8nOrderNotificationRequestedListener(N8nNotifyService n8nNotifyService) {
		this.n8nNotifyService = n8nNotifyService;
	}

	@Async("n8nNotifyExecutor")
	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void onOrderNotificationRequested(OrderNotificationRequestedEvent event) {
		n8nNotifyService.notifyOrderEvent(event);
	}
}
