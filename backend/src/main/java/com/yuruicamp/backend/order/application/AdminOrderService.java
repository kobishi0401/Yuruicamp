package com.yuruicamp.backend.order.application;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.yuruicamp.backend.common.admin.AdminStatusLabels;
import com.yuruicamp.backend.common.api.PageMeta;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.order.api.AdminLogisticsPrintLaunchResponse;
import com.yuruicamp.backend.order.api.AdminOrderDetailResponse;
import com.yuruicamp.backend.order.api.AdminOrderListResponse;
import com.yuruicamp.backend.order.infrastructure.AdminOrderCommandRepository;
import com.yuruicamp.backend.order.infrastructure.AdminOrderReadRepository;
import com.yuruicamp.backend.payment.application.PaymentRefundService;
import com.yuruicamp.backend.logistics.application.EcpayLogisticsCreateService;
import com.yuruicamp.backend.logistics.application.EcpayLogisticsPrintService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 後台訂單：查詢、出貨／完成、未出貨取消（W3-01）與同交易退款（W3-02）。
 * Admin orders: query, ship/complete, unshipped cancel + refund-in-same-tx.
 */
@Service
public class AdminOrderService {

	private static final Set<String> STATUSES = Set.of("unshipped", "shipped", "completed", "returned", "cancelled");
	private static final Set<String> PAYMENT_STATUSES = Set.of("unpaid", "paid", "refunded");
	private static final Set<String> PAYMENT_METHODS = Set.of("ecpay-credit", "ecpay-atm", "ecpay-cvs", "ecpay-other", "cod");
	private static final Set<String> SORT_FIELDS = Set.of("placedAt", "total", "updatedAt");
	private static final Set<String> SORT_DIRECTIONS = Set.of("asc", "desc");

	private final AdminOrderReadRepository readRepository;
	private final AdminOrderCommandRepository commandRepository;
	private final PaymentRefundService paymentRefundService;
	private final EcpayLogisticsCreateService logisticsCreateService;
	private final EcpayLogisticsPrintService logisticsPrintService;

	public AdminOrderService(
			AdminOrderReadRepository readRepository,
			AdminOrderCommandRepository commandRepository,
			PaymentRefundService paymentRefundService,
			EcpayLogisticsCreateService logisticsCreateService,
			EcpayLogisticsPrintService logisticsPrintService) {
		this.readRepository = readRepository;
		this.commandRepository = commandRepository;
		this.paymentRefundService = paymentRefundService;
		this.logisticsCreateService = logisticsCreateService;
		this.logisticsPrintService = logisticsPrintService;
	}

	@Transactional(readOnly = true)
	public PagedOrders list(
			int page,
			int size,
			String query,
			List<String> statuses,
			List<String> paymentStatuses,
			List<String> paymentMethods,
			LocalDate placedFrom,
			LocalDate placedTo,
			String sort) {
		SortSpec sortSpec = validate(page, size, statuses, paymentStatuses, paymentMethods, placedFrom, placedTo, sort);
		var idPage = readRepository.findIds(page, size, normalize(query), statuses, paymentStatuses,
				paymentMethods, placedFrom, placedTo, sortSpec.field(), sortSpec.direction());
		Map<String, AdminOrderListResponse> byId = new HashMap<>();
		readRepository.findRows(idPage.ids()).forEach(row -> byId.put(row.id(), row));
		List<AdminOrderListResponse> data = new ArrayList<>();
		idPage.ids().forEach(id -> data.add(byId.get(id)));
		int totalPages = (int) Math.ceil((double) idPage.totalElements() / size);

		return new PagedOrders(data, new PageMeta(page, size, idPage.totalElements(), totalPages));
	}

	@Transactional(readOnly = true)
	public AdminOrderDetailResponse get(String id) {
		var row = readRepository.findDetail(id)
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Order not found"));

		return toDetail(row);
	}

	/**
	 * Launch ECPay Trade Document print (does not mutate Order Status or history).
	 */
	@Transactional(readOnly = true)
	public AdminLogisticsPrintLaunchResponse printLogisticsLabel(String id) {
		return logisticsPrintService.launchPrintTradeDocument(id);
	}

	@Transactional
	public AdminOrderDetailResponse ship(String id, String actorId, String note) {
		var order = lock(id);
		if ("shipped".equals(order.status())) {
			return get(id);
		}
		if (!"unshipped".equals(order.status())) {
			throw conflict("Only unshipped order can be shipped");
		}
		ensureNoRefund(order);
		boolean paidOnline = !"cod".equals(order.paymentMethod()) && "paid".equals(order.paymentStatus());
		boolean unpaidCod = "cod".equals(order.paymentMethod()) && "unpaid".equals(order.paymentStatus());
		if (!paidOnline && !unpaidCod) {
			throw conflict("Order payment state does not allow shipping");
		}
		logisticsCreateService.createShipment(id);
		Instant now = Instant.now();
		commandRepository.updateStatus(id, "shipped", now);
		commandRepository.addHistory(id, "shipped", now, actorId, cleanNote(note, "Order shipped by admin"));

		return get(id);
	}

	@Transactional
	public AdminOrderDetailResponse complete(String id, String actorId, String note) {
		var order = lock(id);
		if ("completed".equals(order.status())) {
			return get(id);
		}
		if (!"shipped".equals(order.status())) {
			throw conflict("Only shipped order can be completed");
		}
		ensureNoRefund(order);
		boolean cod = "cod".equals(order.paymentMethod());
		if (!cod && !"paid".equals(order.paymentStatus())) {
			throw conflict("Online order must be paid before completion");
		}
		Instant now = Instant.now();
		if (cod && "unpaid".equals(order.paymentStatus())) {
			commandRepository.completeCod(id, now);
		} else {
			commandRepository.updateStatus(id, "completed", now);
		}
		commandRepository.addHistory(id, "completed", now, actorId, cleanNote(note, "Order completed by admin"));

		return get(id);
	}

	/**
	 * W3-01／W3-02：未出貨取消。已付款線上單必須先退款成功才改本地狀態。
	 * Unshipped cancel; paid online requires provider refund before local mutation.
	 */
	@Transactional
	public AdminOrderDetailResponse cancel(String id, String actorId, String note) {
		var order = lock(id);
		if ("cancelled".equals(order.status())) {
			// 冪等回放 / Idempotent replay
			return get(id);
		}
		if (!"unshipped".equals(order.status())) {
			throw conflict("Only unshipped order can be cancelled (O2 return is out of scope)");
		}
		if ("refunded".equals(order.paymentStatus()) || !"none".equals(order.refundStatus())) {
			throw conflict("Order refund state does not allow cancel");
		}

		boolean onlinePaid = !"cod".equals(order.paymentMethod()) && "paid".equals(order.paymentStatus());
		boolean unpaid = "unpaid".equals(order.paymentStatus());
		if (!onlinePaid && !unpaid) {
			throw conflict("Order payment state does not allow cancel");
		}

		Instant now = Instant.now();
		String historyNote = cleanNote(note, "Order cancelled by admin");

		if (onlinePaid) {
			// 契約：先綠界退款，失敗則整筆 rollback、訂單維持 unshipped
			paymentRefundService.refundOrderFully(id, order.total());
			commandRepository.cancelPaidAndRefunded(id, now);
			commandRepository.releaseActiveReservations(id, now);
			commandRepository.rollbackConsumedCouponClaim(id);
			long historyId = commandRepository.addHistory(id, "cancelled", now, actorId, historyNote);
			commandRepository.addRefundEvent(id, historyId, now, actorId, "Full refund after admin cancel");
		} else {
			commandRepository.cancelUnpaid(id, now);
			commandRepository.releaseActiveReservations(id, now);
			commandRepository.clearOrderCouponsForUnpaidCancel(id, now);
			commandRepository.addHistory(id, "cancelled", now, actorId, historyNote);
		}

		return get(id);
	}

	/**
	 * 覆寫訂單內部備註；不變更履約或付款狀態。
	 */
	@Transactional
	public AdminOrderDetailResponse updateInternalNote(String id, String internalNote) {
		lock(id);
		Instant now = Instant.now();
		commandRepository.updateInternalNote(id, normalizeInternalNote(internalNote), now);

		return get(id);
	}

	private SortSpec validate(
			int page,
			int size,
			List<String> statuses,
			List<String> paymentStatuses,
			List<String> paymentMethods,
			LocalDate placedFrom,
			LocalDate placedTo,
			String sort) {
		if (page < 0 || size < 1 || size > 100) {
			throw validation("Invalid page or size");
		}
		validateValues(statuses, STATUSES, "status");
		validateValues(paymentStatuses, PAYMENT_STATUSES, "paymentStatus");
		validateValues(paymentMethods, PAYMENT_METHODS, "paymentMethod");
		if (placedFrom != null && placedTo != null && placedFrom.isAfter(placedTo)) {
			throw validation("placedFrom cannot be after placedTo");
		}
		String[] parts = sort.split(",", -1);
		if (parts.length != 2 || !SORT_FIELDS.contains(parts[0]) || !SORT_DIRECTIONS.contains(parts[1])) {
			throw validation("Invalid order sort");
		}

		return new SortSpec(parts[0], parts[1]);
	}

	private AdminOrderDetailResponse toDetail(AdminOrderReadRepository.DetailRow row) {
		List<AdminOrderDetailResponse.HistorySummary> history = readRepository.findHistoryEntries(row.id())
				.stream()
				.map(entry -> new AdminOrderDetailResponse.HistorySummary(
						entry.status(),
						entry.occurredAt(),
						entry.actorId(),
						entry.actorName(),
						entry.note(),
						AdminStatusLabels.orderHistoryLabel(entry.status(), entry.note())))
				.toList();

		return new AdminOrderDetailResponse(
				row.id(),
				row.displayNo(),
				new AdminOrderDetailResponse.CustomerSummary(row.customerId(), row.customerName(), row.customerStatus()),
				new AdminOrderDetailResponse.BuyerSummary(row.buyerName(), row.buyerEmail()),
				new AdminOrderDetailResponse.ShippingSummary(row.recipientName(), row.shippingPhone(), row.shippingAddress()),
				new AdminOrderDetailResponse.PricingSummary(
						money(row.subtotal()), money(row.shippingFee()), money(row.discount()), money(row.total())),
				row.paymentMethod(), row.paymentStatus(), row.refundStatus(), row.status(),
				row.internalNote(),
				row.placedAt(), row.paidAt(), row.updatedAt(),
				readRepository.findItems(row.id()), history,
				row.shippingMethod(), row.ecpayLogisticsId(),
				row.ecpayLogisticsRtnCode(), row.ecpayLogisticsRtnMsg(), row.ecpayLogisticsStatusAt());
	}

	private AdminOrderCommandRepository.OrderState lock(String id) {
		return commandRepository.lockById(id)
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Order not found"));
	}

	private void ensureNoRefund(AdminOrderCommandRepository.OrderState order) {
		if (!"none".equals(order.refundStatus()) || "refunded".equals(order.paymentStatus())) {
			throw conflict("Refunding or refunded order cannot change fulfillment state");
		}
	}

	private static void validateValues(List<String> values, Set<String> allowed, String field) {
		if (!allowed.containsAll(values)) {
			throw validation("Invalid " + field);
		}
	}

	private static String normalize(String value) {
		return value == null ? "" : value.trim();
	}

	private static String cleanNote(String note, String fallback) {
		return note == null || note.isBlank() ? fallback : note.trim();
	}

	private static String normalizeInternalNote(String note) {
		if (note == null || note.isBlank()) {
			return null;
		}

		return note.trim();
	}

	private static String money(java.math.BigDecimal value) {
		return value.setScale(2).toPlainString();
	}

	private static BusinessException validation(String message) {
		return new BusinessException(ErrorCode.VALIDATION_ERROR, message);
	}

	private static BusinessException conflict(String message) {
		return new BusinessException(ErrorCode.CONFLICT, message);
	}

	public record PagedOrders(List<AdminOrderListResponse> data, PageMeta meta) {
	}

	private record SortSpec(String field, String direction) {
	}
}
