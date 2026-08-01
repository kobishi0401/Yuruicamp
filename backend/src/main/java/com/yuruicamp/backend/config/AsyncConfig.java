package com.yuruicamp.backend.config;

import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionHandler;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
// 開啟 @Async，讓標有 @Async 的方法改在背景執行緒執行、不佔用呼叫端的 request 執行緒
@EnableAsync
public class AsyncConfig {

	private static final Logger log = LoggerFactory.getLogger(AsyncConfig.class);

	/**
	 * n8n 訂單事件推播專用執行緒池；容量有上限（避免無界佇列吃光記憶體），
	 * 佇列滿了只記 warn log 並丟棄該次通知，不可拋例外影響呼叫端（訂單主流程）。
	 * 本次不做 outbox／重試，通知丟失只記 log，不保證一定送達。
	 */
	@Bean
	Executor n8nNotifyExecutor() {
		ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
		executor.setCorePoolSize(2);
		executor.setMaxPoolSize(4);
		executor.setQueueCapacity(100);
		executor.setThreadNamePrefix("n8n-notify-");
		executor.setRejectedExecutionHandler(rejectionLogger());
		executor.initialize();

		return executor;
	}

	private RejectedExecutionHandler rejectionLogger() {
		return (task, pool) -> log.warn(
				"n8n notify executor saturated, dropping notify task: activeCount={}, queueSize={}",
				pool.getActiveCount(), pool.getQueue().size());
	}
}
