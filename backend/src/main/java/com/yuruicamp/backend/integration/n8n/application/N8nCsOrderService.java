package com.yuruicamp.backend.integration.n8n.application;

import java.util.List;

import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.customer.domain.Customer;
import com.yuruicamp.backend.customer.infrastructure.CustomerRepository;
import com.yuruicamp.backend.integration.n8n.api.N8nCustomerLinkResponse;
import com.yuruicamp.backend.integration.n8n.api.N8nOrderCsCardResponse;
import com.yuruicamp.backend.order.domain.Order;
import com.yuruicamp.backend.order.infrastructure.OrderRepository;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read-only CS order lookup for n8n, keyed by persisted LINE User ID.
 */
@Service
public class N8nCsOrderService {

	/** Default recent-order count when n8n omits {@code limit}. */
	public static final int DEFAULT_LIMIT = 1;
	/** Hard server max so chat payloads stay small. */
	public static final int MAX_LIMIT = 5;

	private final CustomerRepository customerRepository;
	private final OrderRepository orderRepository;

	public N8nCsOrderService(CustomerRepository customerRepository, OrderRepository orderRepository) {
		this.customerRepository = customerRepository;
		this.orderRepository = orderRepository;
	}

	@Transactional(readOnly = true)
	public N8nCustomerLinkResponse resolveByLineUserId(String lineUserId) {
		return customerRepository.findByLineUserId(requireLineUserId(lineUserId))
				.map(customer -> new N8nCustomerLinkResponse(true, customer.getId()))
				.orElseGet(() -> new N8nCustomerLinkResponse(false, null));
	}

	@Transactional(readOnly = true)
	public List<N8nOrderCsCardResponse> listRecentOrders(String lineUserId, Integer limit) {
		Customer customer = requireLinkedCustomer(lineUserId);
		int pageSize = normalizeLimit(limit);
		return orderRepository.findRecentForCustomer(customer.getId(), PageRequest.of(0, pageSize))
				.stream()
				.map(N8nCsOrderService::toCsCard)
				.toList();
	}

	@Transactional(readOnly = true)
	public N8nOrderCsCardResponse findByDisplayNo(String lineUserId, String displayNo) {
		Customer customer = requireLinkedCustomer(lineUserId);
		if (displayNo == null || displayNo.isBlank()) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR, "displayNo is required");
		}
		Order order = orderRepository
				.findByCustomerIdAndDisplayNo(customer.getId(), displayNo.trim())
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Order not found"));
		return toCsCard(order);
	}

	private Customer requireLinkedCustomer(String lineUserId) {
		return customerRepository.findByLineUserId(requireLineUserId(lineUserId))
				.orElseThrow(() -> new BusinessException(
						ErrorCode.LINE_NOT_LINKED,
						"LINE account is not linked to a member"));
	}

	private static String requireLineUserId(String lineUserId) {
		if (lineUserId == null || lineUserId.isBlank()) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR, "lineUserId is required");
		}
		return lineUserId.trim();
	}

	static int normalizeLimit(Integer limit) {
		if (limit == null || limit < 1) {
			return DEFAULT_LIMIT;
		}
		return Math.min(limit, MAX_LIMIT);
	}

	private static N8nOrderCsCardResponse toCsCard(Order order) {
		return new N8nOrderCsCardResponse(
				order.getDisplayNo(),
				order.getStatus() != null ? order.getStatus().name() : null,
				order.getPaymentStatus() != null ? order.getPaymentStatus().name() : null,
				order.getShippingMethod() != null ? order.getShippingMethod().name() : null,
				order.getEcpayLogisticsId(),
				order.getEcpayLogisticsRtnCode(),
				order.getEcpayLogisticsRtnMsg(),
				order.getEcpayLogisticsStatusAt(),
				order.getCvsStoreName(),
				order.getPlacedAt());
	}
}
