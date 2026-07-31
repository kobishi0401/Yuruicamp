package com.yuruicamp.backend.integration.n8n.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.customer.domain.Customer;
import com.yuruicamp.backend.customer.domain.CustomerStatus;
import com.yuruicamp.backend.customer.infrastructure.CustomerRepository;
import com.yuruicamp.backend.integration.n8n.api.N8nOrderCsCardResponse;
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
import org.springframework.data.domain.Pageable;

@ExtendWith(MockitoExtension.class)
class N8nCsOrderServiceTest {

	@Mock
	private CustomerRepository customerRepository;

	@Mock
	private OrderRepository orderRepository;

	private N8nCsOrderService service;

	@BeforeEach
	void setUp() {
		service = new N8nCsOrderService(customerRepository, orderRepository);
	}

	@Test
	void resolveReturnsNotLinkedWhenNoCustomer() {
		when(customerRepository.findByLineUserId("Umissing")).thenReturn(Optional.empty());

		var response = service.resolveByLineUserId("Umissing");

		assertThat(response.linked()).isFalse();
		assertThat(response.customerId()).isNull();
	}

	@Test
	void listRecentDefaultsLimitToOneAndCapsAtFive() {
		Customer customer = linkedCustomer();
		when(customerRepository.findByLineUserId("UlineA")).thenReturn(Optional.of(customer));
		when(orderRepository.findRecentForCustomer(eq("C-N8N"), any(Pageable.class)))
				.thenReturn(List.of(sampleOrder("YC-001")));

		List<N8nOrderCsCardResponse> cards = service.listRecentOrders("UlineA", null);
		assertThat(cards).hasSize(1);
		assertThat(cards.get(0).displayNo()).isEqualTo("YC-001");

		service.listRecentOrders("UlineA", 99);
		ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
		verify(orderRepository, atLeastOnce())
				.findRecentForCustomer(eq("C-N8N"), pageableCaptor.capture());
		assertThat(pageableCaptor.getAllValues().get(pageableCaptor.getAllValues().size() - 1).getPageSize())
				.isEqualTo(5);
	}

	@Test
	void listRecentThrowsNotLinkedWhenUnbound() {
		when(customerRepository.findByLineUserId("Umissing")).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.listRecentOrders("Umissing", 1))
				.isInstanceOf(BusinessException.class)
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.LINE_NOT_LINKED);
	}

	@Test
	void findByDisplayNoDoesNotLeakOtherCustomersOrders() {
		when(customerRepository.findByLineUserId("UlineA")).thenReturn(Optional.of(linkedCustomer()));
		when(orderRepository.findByCustomerIdAndDisplayNo("C-N8N", "YC-OTHER"))
				.thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.findByDisplayNo("UlineA", "YC-OTHER"))
				.isInstanceOf(BusinessException.class)
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.NOT_FOUND);
	}

	@Test
	void listRecentReturnsEmptyWhenLinkedCustomerHasNoOrders() {
		when(customerRepository.findByLineUserId("UlineA")).thenReturn(Optional.of(linkedCustomer()));
		when(orderRepository.findRecentForCustomer(eq("C-N8N"), any(Pageable.class)))
				.thenReturn(List.of());

		assertThat(service.listRecentOrders("UlineA", 1)).isEmpty();
	}

	@Test
	void csCardOmitsAddressPhoneAndDoesNotRequireItems() {
		when(customerRepository.findByLineUserId("UlineA")).thenReturn(Optional.of(linkedCustomer()));
		when(orderRepository.findRecentForCustomer(eq("C-N8N"), any(Pageable.class)))
				.thenReturn(List.of(sampleOrder("YC-002")));

		N8nOrderCsCardResponse card = service.listRecentOrders("UlineA", 1).get(0);

		assertThat(card.displayNo()).isEqualTo("YC-002");
		assertThat(card.status()).isEqualTo("unshipped");
		assertThat(card.paymentStatus()).isEqualTo("unpaid");
		assertThat(card.shippingMethod()).isEqualTo("delivery");
		assertThat(card.placedAt()).isNotNull();
		// response type intentionally has no shippingAddress / shippingPhone / items
	}

	private static Customer linkedCustomer() {
		Customer customer = new Customer();
		customer.setId("C-N8N");
		customer.setName("N8N");
		customer.setEmail("n8n@example.test");
		customer.setRegisteredAt(Instant.parse("2026-01-01T00:00:00Z"));
		customer.setPoints(0);
		customer.setFirstPurchaseUsed(false);
		customer.setAuthProvider("line");
		customer.setFirebaseUid("uid-n8n");
		customer.setLineUserId("UlineA");
		customer.setStatus(CustomerStatus.active);
		customer.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
		customer.setUpdatedAt(Instant.parse("2026-01-01T00:00:00Z"));
		return customer;
	}

	private static Order sampleOrder(String displayNo) {
		Order order = new Order();
		order.initialize(
				"O-N8N-1",
				displayNo,
				"C-N8N",
				null,
				null,
				"Buyer",
				"buyer@example.test",
				"Recipient",
				"秘密地址不應出現在 CS card",
				"0912345678",
				ShippingMethod.delivery,
				null,
				PaymentMethod.ecpay_credit,
				Instant.parse("2026-07-01T10:00:00Z"),
				Instant.parse("2026-07-01T10:15:00Z"));
		order.setPricing(BigDecimal.valueOf(1000), BigDecimal.ZERO, BigDecimal.ZERO);
		return order;
	}
}
