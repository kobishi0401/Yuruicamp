package com.yuruicamp.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.Executor;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

class AsyncConfigTest {

	@Test
	void n8nNotifyExecutorIsRegisteredWithBoundedPool() {
		try (var context = new AnnotationConfigApplicationContext(AsyncConfig.class)) {
			Executor executor = context.getBean("n8nNotifyExecutor", Executor.class);

			assertThat(executor).isInstanceOf(ThreadPoolTaskExecutor.class);
			ThreadPoolTaskExecutor taskExecutor = (ThreadPoolTaskExecutor) executor;
			assertThat(taskExecutor.getCorePoolSize()).isEqualTo(2);
			assertThat(taskExecutor.getMaxPoolSize()).isEqualTo(4);
			assertThat(taskExecutor.getThreadNamePrefix()).isEqualTo("n8n-notify-");
		}
	}
}
