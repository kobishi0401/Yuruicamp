package com.yuruicamp.backend.order.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;

import com.yuruicamp.backend.common.api.PageMeta;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.customer.domain.Customer;
import com.yuruicamp.backend.customer.infrastructure.CustomerRepository;
import com.yuruicamp.backend.order.api.MemberOrderResponse;
import com.yuruicamp.backend.order.domain.Order;
import com.yuruicamp.backend.order.domain.OrderItem;
import com.yuruicamp.backend.order.infrastructure.OrderRepository;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 組裝目前登入會員可讀取的訂單列表與詳情。
@Service
public class MemberOrderService {

	private final OrderRepository orders;
	private final CustomerRepository customerRepository;
	private final ApplicationEventPublisher eventPublisher;

	public MemberOrderService(
			OrderRepository orders,
			CustomerRepository customerRepository,
			ApplicationEventPublisher eventPublisher) {
		this.orders = orders;
		this.customerRepository = customerRepository;
		this.eventPublisher = eventPublisher;
	}

	@Transactional(readOnly = true)
	public MemberOrders list(String customerId) {
		validateCustomer(customerId);

		List<MemberOrderResponse> data = orders.findAllForCustomer(customerId)
				.stream()
				.map(this::toResponse)
				.toList();
		int size = data.size();
		int totalPages = size == 0 ? 0 : 1;

		return new MemberOrders(data, new PageMeta(0, size, size, totalPages));
	}

	@Transactional(readOnly = true)
	public MemberOrderResponse get(String customerId, String orderId) {
		validateCustomer(customerId);
		if (orderId == null || orderId.isBlank()) {
			throw notFound();
		}

		Order order = orders.findForCustomer(orderId.trim(), customerId)
				.orElseThrow(this::notFound);

		return toResponse(order);
	}

	// 會員主動要求以 LINE 追蹤這張訂單：驗證歸屬與 LINE 綁定後發佈事件，不直接呼叫 n8n（見 OrderNotificationRequestedEvent 的訂閱者）。
	@Transactional(readOnly = true)
	public void notifyLineCsInquiry(String customerId, String orderId) {
		validateCustomer(customerId);
		if (orderId == null || orderId.isBlank()) {
			throw notFound();
		}

		Order order = orders.findForCustomer(orderId.trim(), customerId)
				.orElseThrow(this::notFound);
		Customer customer = customerRepository.findById(customerId)
				.orElseThrow(this::notFound);
		if (customer.getLineUserId() == null || customer.getLineUserId().isBlank()) {
			throw new BusinessException(ErrorCode.LINE_NOT_LINKED, "LINE account is not linked");
		}

		eventPublisher.publishEvent(new OrderNotificationRequestedEvent(
				order.getId(),
				customerId,
				order.getDisplayNo(),
				order.getStatus() != null ? order.getStatus().name() : null,
				order.getPaymentStatus() != null ? order.getPaymentStatus().name() : null,
				order.getShippingMethod() != null ? order.getShippingMethod().name() : null,
				"cs_inquiry"));
	}

	private void validateCustomer(String customerId) {
		if (customerId == null || customerId.isBlank()) {
			throw new BusinessException(ErrorCode.UNAUTHORIZED, "Authenticated customer is required");
		}
	}

	private BusinessException notFound() {
		return new BusinessException(ErrorCode.NOT_FOUND, "Order not found");
	}

	private MemberOrderResponse toResponse(Order order) {
		List<MemberOrderResponse.Item> items = order.getItems()
				.stream()
				.map(this::toItem)
				.toList();

		return new MemberOrderResponse(
				order.getId(),
				order.getDisplayNo(),
				order.getCustomerId(),
				order.getBuyerName(),
				order.getBuyerEmail(),
				order.getRecipientName(),
				order.getShippingAddress(),
				order.getShippingPhone(),
				money(order.getSubtotal()),
				money(order.getShippingFee()),
				money(order.getDiscount()),
				money(order.getTotal()),
				order.getPaymentMethod().name().replace('_', '-'),
				order.getPaymentStatus().name(),
				order.getRefundStatus().name(),
				order.getStatus().name(),
				instant(order.getPlacedAt()),
				instant(order.getPaidAt()),
				instant(order.getCheckoutExpiresAt()),
				items);
	}

	private MemberOrderResponse.Item toItem(OrderItem item) {
		BigDecimal lineTotal = item.getUnitPrice()
				.multiply(BigDecimal.valueOf(item.getQuantity()));

		return new MemberOrderResponse.Item(
				item.getId(),
				item.getProductId(),
				item.getVariantId(),
				item.getSku(),
				item.getProductName(),
				item.getSpecification(),
				item.getBrandName(),
				item.getImageUrl(),
				money(item.getUnitPrice()),
				item.getQuantity(),
				money(lineTotal));
	}

	private String money(BigDecimal value) {
		return value.setScale(2, RoundingMode.HALF_UP).toPlainString();
	}

	private String instant(Instant value) {
		return value == null ? null : value.toString();
	}

	public record MemberOrders(List<MemberOrderResponse> data, PageMeta meta) {
	}
}
