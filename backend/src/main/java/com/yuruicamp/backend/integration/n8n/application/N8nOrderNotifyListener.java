package com.yuruicamp.backend.integration.n8n.application;

import com.yuruicamp.backend.order.application.OrderStatusChangedEvent;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 訂單狀態變更交易 commit 後才觸發 n8n 推播。
 * {@code @Async("n8nNotifyExecutor")} 讓實際的 n8n HTTP 呼叫改在背景執行緒池執行，
 * 不會佔用呼叫端（後台出貨／完成／取消 API）的 request 執行緒，也不會讓該次 API 回應等 n8n 逾時。
 * 例外處理已在 {@link N8nNotifyService} 內完成，這裡不需要重複 try-catch。
 */
@Component
public class N8nOrderNotifyListener {

	private final N8nNotifyService n8nNotifyService;

	public N8nOrderNotifyListener(N8nNotifyService n8nNotifyService) {
		this.n8nNotifyService = n8nNotifyService;
	}

	@Async("n8nNotifyExecutor")
	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void onOrderStatusChanged(OrderStatusChangedEvent event) {
		n8nNotifyService.notifyOrderEvent(event);
	}
}
