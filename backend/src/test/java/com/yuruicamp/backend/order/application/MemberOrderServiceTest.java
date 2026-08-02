package com.yuruicamp.backend.order.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.customer.domain.Customer;
import com.yuruicamp.backend.customer.infrastructure.CustomerRepository;
import com.yuruicamp.backend.order.domain.Order;
import com.yuruicamp.backend.order.domain.PaymentMethod;
import com.yuruicamp.backend.order.domain.ShippingMethod;
import com.yuruicamp.backend.order.infrastructure.OrderRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

@ExtendWith(MockitoExtension.class)
class MemberOrderServiceTest {

	@Mock
	private OrderRepository orders;

	@Mock
	private CustomerRepository customerRepository;

	@Mock
	private ApplicationEventPublisher eventPublisher;

	private MemberOrderService service;

	@BeforeEach
	void setUp() {
		service = new MemberOrderService(orders, customerRepository, eventPublisher);
	}

	@Test
	void notifyLineCsInquiryPublishesEventWhenOwnedAndLinked() {
		when(orders.findForCustomer("O1", "C1")).thenReturn(Optional.of(sampleOrder()));
		when(customerRepository.findById("C1")).thenReturn(Optional.of(customer("Uline1")));

		service.notifyLineCsInquiry("C1", "O1");

		ArgumentCaptor<OrderNotificationRequestedEvent> captor =
				ArgumentCaptor.forClass(OrderNotificationRequestedEvent.class);
		verify(eventPublisher).publishEvent(captor.capture());
		OrderNotificationRequestedEvent event = captor.getValue();
		assertThat(event.orderId()).isEqualTo("O1");
		assertThat(event.customerId()).isEqualTo("C1");
		assertThat(event.displayNo()).isEqualTo("YC-001");
		assertThat(event.status()).isEqualTo("unshipped");
		assertThat(event.paymentStatus()).isEqualTo("unpaid");
		assertThat(event.shippingMethod()).isEqualTo("delivery");
		assertThat(event.event()).isEqualTo("cs_inquiry");
	}

	@Test
	void notifyLineCsInquiryThrowsNotFoundWhenOrderMissingOrForeign() {
		when(orders.findForCustomer("O1", "C1")).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.notifyLineCsInquiry("C1", "O1"))
				.isInstanceOf(BusinessException.class)
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.NOT_FOUND);
		verify(eventPublisher, never()).publishEvent(any());
	}

	@Test
	void notifyLineCsInquiryThrowsLineNotLinkedWhenCustomerNotLinked() {
		when(orders.findForCustomer("O1", "C1")).thenReturn(Optional.of(sampleOrder()));
		when(customerRepository.findById("C1")).thenReturn(Optional.of(customer(null)));

		assertThatThrownBy(() -> service.notifyLineCsInquiry("C1", "O1"))
				.isInstanceOf(BusinessException.class)
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.LINE_NOT_LINKED);
		verify(eventPublisher, never()).publishEvent(any());
	}

	private static Order sampleOrder() {
		Order order = new Order();
		order.initialize(
				"O1",
				"YC-001",
				"C1",
				null,
				null,
				"Buyer",
				"buyer@example.test",
				"Recipient",
				"台北市…",
				"0912345678",
				ShippingMethod.delivery,
				null,
				PaymentMethod.ecpay_credit,
				Instant.parse("2026-07-01T10:00:00Z"),
				Instant.parse("2026-07-01T10:15:00Z"));
		return order;
	}

	private static Customer customer(String lineUserId) {
		Customer customer = new Customer();
		customer.setId("C1");
		customer.setLineUserId(lineUserId);
		return customer;
	}
}
