package com.yuruicamp.backend.logistics.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.util.Map;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.yuruicamp.backend.logistics.infrastructure.EcpayLogisticsGateway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;

@ExtendWith(MockitoExtension.class)
class EcpayLogisticsNotifyServiceTest {

	@Mock
	private EcpayLogisticsGateway logisticsGateway;

	private EcpayLogisticsNotifyService service;
	private ListAppender<ILoggingEvent> logAppender;

	@BeforeEach
	void setUp() {
		service = new EcpayLogisticsNotifyService(logisticsGateway);
		Logger logger = (Logger) LoggerFactory.getLogger(EcpayLogisticsNotifyService.class);
		logAppender = new ListAppender<>();
		logAppender.start();
		logger.addAppender(logAppender);
	}

	@AfterEach
	void tearDown() {
		Logger logger = (Logger) LoggerFactory.getLogger(EcpayLogisticsNotifyService.class);
		logger.detachAppender(logAppender);
	}

	@Test
	void handleLogsTraceableIdentifiers() {
		Map<String, String> params = Map.of(
				"AllPayLogisticsID", "1234567",
				"MerchantTradeNo", "ORD0001123456",
				"RtnCode", "300",
				"RtnMsg", "訂單處理中");

		service.handle(params);

		assertThat(logAppender.list)
				.anySatisfy(event -> {
					assertThat(event.getFormattedMessage()).contains("ECPay logistics notify");
					assertThat(event.getFormattedMessage()).contains("AllPayLogisticsID=1234567");
					assertThat(event.getFormattedMessage()).contains("MerchantTradeNo=ORD0001123456");
					assertThat(event.getFormattedMessage()).contains("RtnCode=300");
				});
	}

	@Test
	void verifyDelegatesToGateway() {
		Map<String, String> params = Map.of("CheckMacValue", "ABC");
		when(logisticsGateway.verifyCallback(params)).thenReturn(true);

		assertThat(service.verify(params)).isTrue();
	}
}
