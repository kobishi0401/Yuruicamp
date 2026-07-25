package com.yuruicamp.backend.checkout.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.yuruicamp.backend.branch.domain.Branch;
import com.yuruicamp.backend.branch.infrastructure.BranchRepository;
import com.yuruicamp.backend.catalog.domain.EquipmentImage;
import com.yuruicamp.backend.catalog.domain.EquipmentItem;
import com.yuruicamp.backend.catalog.domain.ProductVariant;
import com.yuruicamp.backend.catalog.infrastructure.EquipmentImageRepository;
import com.yuruicamp.backend.checkout.api.CheckoutCreateRequest;
import com.yuruicamp.backend.checkout.api.CheckoutSessionResponse;
import com.yuruicamp.backend.checkout.api.CheckoutUpdateRequest;
import com.yuruicamp.backend.checkout.infrastructure.CheckoutProductRepository;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.common.api.ApiErrorBody.ErrorDetail;
import com.yuruicamp.backend.customer.domain.Customer;
import com.yuruicamp.backend.customer.infrastructure.CustomerRepository;
import com.yuruicamp.backend.coupon.application.CouponService;
import com.yuruicamp.backend.coupon.domain.CouponClaimStatus;
import com.yuruicamp.backend.inventory.domain.InventoryStock;
import com.yuruicamp.backend.inventory.domain.ProductStockReservation;
import com.yuruicamp.backend.inventory.infrastructure.InventoryStockRepository;
import com.yuruicamp.backend.inventory.infrastructure.ProductStockReservationRepository;
import com.yuruicamp.backend.order.domain.Order;
import com.yuruicamp.backend.order.domain.OrderItem;
import com.yuruicamp.backend.order.domain.OrderStatus;
import com.yuruicamp.backend.order.domain.OrderStatusHistory;
import com.yuruicamp.backend.order.domain.PaymentMethod;
import com.yuruicamp.backend.order.domain.PaymentStatus;
import com.yuruicamp.backend.order.domain.ShippingMethod;
import com.yuruicamp.backend.order.infrastructure.OrderRepository;
import com.yuruicamp.backend.order.infrastructure.OrderStatusHistoryRepository;

@Service
// 處理建立、更新、取消 Checkout 與保留庫存。
public class CheckoutService {
	private static final Duration HOLD = Duration.ofMinutes(15);
	private static final String PENDING = "PENDING_CHECKOUT";
	private final CustomerRepository customers;
	private final CheckoutProductRepository products;
	private final InventoryStockRepository stocks;
	private final ProductStockReservationRepository reservations;
	private final OrderRepository orders;
	private final OrderStatusHistoryRepository histories;
	private final EquipmentImageRepository images;
	private final CouponService couponService;
	private final BranchRepository branches;

	// 準備 Checkout 流程需要使用的資料庫元件。
	public CheckoutService(CustomerRepository customers, CheckoutProductRepository products,
			InventoryStockRepository stocks, ProductStockReservationRepository reservations,
			OrderRepository orders, OrderStatusHistoryRepository histories,
			EquipmentImageRepository images, CouponService couponService,
			BranchRepository branches) {
		this.customers = customers;
		this.products = products;
		this.stocks = stocks;
		this.reservations = reservations;
		this.orders = orders;
		this.histories = histories;
		this.images = images;
		this.couponService = couponService;
		this.branches = branches;
	}

	// 建立待付款訂單，並保留商品庫存 15 分鐘。
	@Transactional
	public CheckoutSessionResponse create(String customerId, CheckoutCreateRequest request) {
		validateCreateInput(customerId, request);
		String idempotencyKey = request.idempotencyKey().trim();
		Map<String, Integer> requested = mergeRequestedItems(request.items());
		PaymentMethod paymentMethod = parsePaymentMethod(request.paymentMethod());
		String requestHash = fingerprint(requested, paymentMethod, request.shipping(), request.couponClaimId());

		Customer customer = customers.findByIdForCheckout(customerId)
				.orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED, "Customer not found"));
		Optional<Order> replay = orders.findByCheckoutIdempotencyKey(customerId, idempotencyKey);
		if (replay.isPresent()) {
			Order existing = replay.get();
			if (!requestHash.equals(existing.getCheckoutRequestHash())) {
				throw new BusinessException(ErrorCode.CONFLICT,
						"Idempotency key was already used with a different checkout request");
			}
			return toResponse(existing);
		}

		Instant now = Instant.now();
		Instant expires = now.plus(HOLD);
		CheckoutCreateRequest.Shipping shipping = request.shipping();
		ShippingSnapshot shippingSnapshot = resolveCreateShipping(shipping);
		String recipient = firstNonBlank(shipping == null ? null : shipping.recipientName(), customer.getName(), PENDING);
		String phone = firstNonBlank(shipping == null ? null : shipping.phone(), customer.getPhone(), PENDING);
		Order order = new Order();
		order.initialize(newOrderId(), customerId, idempotencyKey, requestHash,
				firstNonBlank(customer.getName(), PENDING), firstNonBlank(customer.getEmail(), PENDING),
				recipient, shippingSnapshot.address(), phone, shippingSnapshot.method(),
				shippingSnapshot.pickupBranchId(), paymentMethod, now, expires);
		BigDecimal subtotal = BigDecimal.ZERO;
		List<ReservationDraft> reserveDrafts = new ArrayList<>();

		for (var entry : requested.entrySet()) {
			ProductVariant variant = products.findSellableById(entry.getKey())
					.orElseThrow(() -> new BusinessException(ErrorCode.VARIANT_NOT_SELLABLE,
							"Variant not sellable: " + entry.getKey()));
			InventoryStock stock = selectAvailableStock(variant, entry.getValue());
			EquipmentItem equipment = variant.getProduct().getItem();
			String brand = equipment.getBrand() == null ? "" : equipment.getBrand().getName();
			String image = images.findByItemIdAndSortOrder(equipment.getId(), 0)
					.map(EquipmentImage::getUrl)
					.orElse(null);
			OrderItem orderItem = OrderItem.snapshot(order, variant.getProduct().getId(), variant.getId(),
					variant.getSku(), equipment.getName(), variant.getSpecification(), brand, image,
					variant.getPrice(), entry.getValue());

			order.addItem(orderItem);
			subtotal = subtotal.add(variant.getPrice().multiply(BigDecimal.valueOf(entry.getValue())));
			reserveDrafts.add(new ReservationDraft(variant.getId(), stock.getLocationId(), entry.getValue()));
		}

		order.setPricing(subtotal, BigDecimal.ZERO, BigDecimal.ZERO);
		Order saved = orders.saveAndFlush(order);
		if (request.couponClaimId() != null) {
			couponService.applyToOrder(saved, customerId, request.couponClaimId(), now);
		}

		for (int i = 0; i < saved.getItems().size(); i++) {
			OrderItem item = saved.getItems().get(i);
			ReservationDraft draft = reserveDrafts.get(i);
			reservations.save(ProductStockReservation.active(item.getId(), draft.variantId(),
					draft.locationId(), draft.quantity(), saved.getId() + ":" + item.getId(), now, expires));
		}

		histories.save(OrderStatusHistory.of(saved.getId(), OrderStatus.unshipped, now,
				"Checkout draft created"));

		return toResponse(saved);
	}

	// 讀取會員自己的 Checkout，不修改訂單或庫存保留狀態。
	@Transactional(readOnly = true)
	public CheckoutSessionResponse get(String customerId, String orderId) {
		validateCheckoutIdentity(customerId, orderId);

		Order order = orders.findForCustomer(orderId.trim(), customerId)
				.orElseThrow(() -> new BusinessException(
						ErrorCode.FORBIDDEN,
						"Order not found or not owned by customer"));

		return toResponse(order);
	}

	// 更新會員自己的未付款 Checkout 收件資料與付款方式。
	@Transactional
	public CheckoutSessionResponse update(String customerId, String orderId,
			CheckoutUpdateRequest request) {
		validateUpdateInput(customerId, orderId, request);
		Order order = orders.findForCustomerForUpdate(orderId, customerId)
				.orElseThrow(() -> new BusinessException(ErrorCode.FORBIDDEN,
						"Order not found or not owned by customer"));
		Instant now = Instant.now();

		if (order.getPaymentStatus() != PaymentStatus.unpaid) {
			throw new BusinessException(ErrorCode.CONFLICT,
					"Paid order cannot be updated here");
		}
		if (!order.isCheckoutEditable(now)) {
			throw new BusinessException(ErrorCode.CHECKOUT_EXPIRED,
					"Checkout is cancelled or expired");
		}

		CheckoutUpdateRequest.Shipping shipping = request.shipping();
		if (shipping != null) {
			ShippingSnapshot shippingSnapshot = resolveUpdateShipping(shipping, order);
			order.updateShipping(
					updatedValue(shipping.recipientName(), order.getRecipientName()),
					updatedValue(shipping.phone(), order.getShippingPhone()),
					shippingSnapshot.address(), shippingSnapshot.method(), shippingSnapshot.pickupBranchId());
		}
		if (request.paymentMethod() != null) {
			order.changePaymentMethod(parsePaymentMethod(request.paymentMethod()));
		}
		if (request.couponClaimId() != null) {
			couponService.applyToOrder(order, customerId, request.couponClaimId(), now);
		}
		else if (request.shipping() == null && request.paymentMethod() == null) {
			couponService.applyToOrder(order, customerId, null, now);
		}

		return toResponse(order);
	}

	// 確認貨到付款成立，移除 Checkout 與庫存保留的倒數期限。
	@Transactional
	public CheckoutSessionResponse confirmCod(String customerId, String orderId) {
		validateCheckoutIdentity(customerId, orderId);
		Order order = orders.findForCustomerForUpdate(orderId.trim(), customerId)
				.orElseThrow(() -> new BusinessException(ErrorCode.FORBIDDEN,
						"Order not found or not owned by customer"));
		Instant now = Instant.now();
		if (order.getPaymentMethod() != PaymentMethod.cod) {
			throw new BusinessException(ErrorCode.CONFLICT, "Only COD checkout can be confirmed here");
		}
		if (!order.isCheckoutEditable(now) || !hasCompleteShipping(order)) {
			throw new BusinessException(ErrorCode.CHECKOUT_EXPIRED,
					"Checkout is incomplete, cancelled or expired");
		}
		order.confirmCod();
		// COD 訂單成立時消耗優惠券；沒有套券時此操作不會修改資料。
		couponService.consumeAppliedClaim(order.getId(), now);
		reservations.findActiveByOrderItemIdIn(order.getItems().stream().map(OrderItem::getId).toList())
				.forEach(ProductStockReservation::confirmWithoutExpiry);
		histories.save(OrderStatusHistory.of(orderId, OrderStatus.unshipped, now, "COD order confirmed"));
		return toResponse(order);
	}

	// 取消會員自己的未付款訂單，並釋放庫存。
	@Transactional
	public CheckoutSessionResponse cancel(String customerId, String orderId) {
		Order order = orders.findForCustomerForUpdate(orderId, customerId)
				.orElseThrow(() -> new BusinessException(ErrorCode.FORBIDDEN,
						"Order not found or not owned by customer"));

		if (order.getPaymentStatus() != PaymentStatus.unpaid) {
			throw new BusinessException(ErrorCode.CONFLICT, "Paid order cannot be cancelled here");
		}

		Instant now = Instant.now();
		order.cancel();
		// 會員主動取消時撤銷已綁定的 claim，避免取消訂單的券再次使用。
		couponService.invalidateAppliedClaim(order.getId(), CouponClaimStatus.revoked, now);
		reservations.findActiveByOrderItemIdIn(order.getItems().stream().map(OrderItem::getId).toList())
				.forEach(reservation -> reservation.release(now));
		histories.save(OrderStatusHistory.of(orderId, OrderStatus.cancelled, now, "Cancelled by customer"));

		return toResponse(order);
	}

	// 找出庫存足夠的門市庫位。
	private InventoryStock selectAvailableStock(ProductVariant variant, int requested) {
		String variantId = variant.getId();
		int available = 0;

		for (InventoryStock stock : stocks.lockStoreStocksByVariantId(variantId)) {
			int locationAvailable = Math.max(0,
					stock.getOnHandQuantity() - reservations.activeQuantity(variantId, stock.getLocationId()));
			available = Math.max(available, locationAvailable);
			if (locationAvailable >= requested) {
				return stock;
			}
		}

		// 缺貨明細顯示商品名稱與目前可用數量，避免把內部 variantId 顯示給買家。
		String productName = variant.getProduct().getItem().getName();
		throw new BusinessException(ErrorCode.STOCK_INSUFFICIENT,
				"商品庫存不足",
				List.of(new ErrorDetail("stock", productName + "商品數量剩餘: " + available)));
	}

	// 檢查會員、商品與冪等鍵是否有填寫。
	private static void validateCreateInput(String customerId, CheckoutCreateRequest request) {
		if (customerId == null || customerId.isBlank() || request == null
				|| request.items() == null || request.items().isEmpty()
				|| request.idempotencyKey() == null || request.idempotencyKey().isBlank()) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR,
					"customerId, items and idempotencyKey are required");
		}
		if (request.idempotencyKey().trim().length() > 128) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR, "idempotencyKey must not exceed 128 characters");
		}
		for (CheckoutCreateRequest.Item item : request.items()) {
			if (item == null || item.variantId() == null || item.variantId().isBlank() || item.quantity() < 1) {
				throw new BusinessException(ErrorCode.VALIDATION_ERROR,
						"Each checkout item requires variantId and a positive quantity");
			}
		}
	}

	// 檢查更新請求至少包含收件、付款方式或優惠券操作。
	private static void validateUpdateInput(String customerId, String orderId,
			CheckoutUpdateRequest request) {
		if (customerId == null || customerId.isBlank()
				|| orderId == null || orderId.isBlank()
				|| request == null) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR,
					"customerId, orderId and request are required");
		}
		boolean hasShippingUpdate = request.shipping() != null
				&& (request.shipping().recipientName() != null
						|| request.shipping().phone() != null
						|| request.shipping().address() != null
						|| request.shipping().method() != null
						|| request.shipping().pickupBranchId() != null);
		boolean hasPaymentUpdate = request.paymentMethod() != null;
		// 空的更新內容視為清除目前優惠券，讓 couponClaimId=null 能完成清除操作。
		if (hasPaymentUpdate && request.paymentMethod().isBlank()) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR,
					"paymentMethod must not be blank");
		}
		validateShippingValue(request.shipping() == null ? null : request.shipping().recipientName(),
				"recipientName");
		validateShippingValue(request.shipping() == null ? null : request.shipping().phone(),
				"phone");
		validateShippingValue(request.shipping() == null ? null : request.shipping().address(),
				"address");
	}

	// 檢查 Checkout 讀取需要的會員與訂單 ID。
	private static void validateCheckoutIdentity(String customerId, String orderId) {
		if (customerId == null || customerId.isBlank()
				|| orderId == null || orderId.isBlank()) {
			throw new BusinessException(
					ErrorCode.VALIDATION_ERROR,
					"customerId and orderId are required");
		}
	}

	// 已提供的收件欄位不可只包含空白。
	private static void validateShippingValue(String value, String field) {
		if (value != null && value.isBlank()) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR,
					field + " must not be blank");
		}
	}

	// 欄位未提供時保留原值，有提供時移除前後空白。
	private static String updatedValue(String value, String currentValue) {
		return value == null ? currentValue : value.trim();
	}

	// 合併相同規格的數量，並固定商品順序。
	private static Map<String, Integer> mergeRequestedItems(List<CheckoutCreateRequest.Item> items) {
		Map<String, Integer> requested = new TreeMap<>();
		try {
			for (CheckoutCreateRequest.Item item : items) {
				requested.merge(item.variantId().trim(), item.quantity(), Math::addExact);
			}
		}
		catch (ArithmeticException ex) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR, "Checkout item quantity is too large");
		}
		return requested;
	}

	// 取得第一個有內容的文字，全部空白時使用草稿佔位文字。
	private static String firstNonBlank(String... values) {
		for (String value : values) {
			if (value != null && !value.isBlank()) {
				return value.trim();
			}
		}
		return PENDING;
	}

	// 產生請求指紋，用來判斷相同冪等鍵的內容是否一致。
	private static String fingerprint(Map<String, Integer> items, PaymentMethod paymentMethod,
			CheckoutCreateRequest.Shipping shipping, Long couponClaimId) {
		StringBuilder canonical = new StringBuilder();
		appendCanonical(canonical, paymentMethod.name());
		appendCanonical(canonical, shipping == null ? null : shipping.recipientName());
		appendCanonical(canonical, shipping == null ? null : shipping.phone());
		appendCanonical(canonical, shipping == null ? null : shipping.address());
		appendCanonical(canonical, shipping == null ? null : shipping.method());
		appendCanonical(canonical, shipping == null ? null : shipping.pickupBranchId());
		appendCanonical(canonical, couponClaimId == null ? null : couponClaimId.toString());
		items.forEach((variantId, quantity) -> {
			appendCanonical(canonical, variantId);
			appendCanonical(canonical, String.valueOf(quantity));
		});
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256")
					.digest(canonical.toString().getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(digest);
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException("SHA-256 is not available", ex);
		}
	}

	// 加入欄位長度，避免不同資料組合出相同內容。
	private static void appendCanonical(StringBuilder target, String value) {
		String normalized = value == null ? "" : value.trim();
		target.append(normalized.length()).append(':').append(normalized).append('|');
	}

	// 將 API 的付款方式文字轉成後端列舉值。
	private static PaymentMethod parsePaymentMethod(String raw) {
		if (raw == null || raw.isBlank()) {
			return PaymentMethod.ecpay_credit;
		}
		try {
			return PaymentMethod.valueOf(raw.replace('-', '_'));
		}
		catch (IllegalArgumentException ex) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR, "Unsupported paymentMethod: " + raw);
		}
	}

	// 產生符合資料庫長度的訂單編號。
	private static String newOrderId() {
		return "O" + UUID.randomUUID().toString().replace("-", "").substring(0, 31);
	}

	// 將金額轉成兩位小數文字。
	private static String money(BigDecimal value) {
		return value.setScale(2, RoundingMode.HALF_UP).toPlainString();
	}

	// 將訂單資料轉成前端需要的結帳回應。
	private CheckoutSessionResponse toResponse(Order order) {
		var items = order.getItems().stream()
				.map(item -> new CheckoutSessionResponse.Item(item.getId(), item.getProductId(),
						item.getVariantId(), item.getSku(), item.getProductName(), item.getSpecification(),
						item.getBrandName(), item.getImageUrl(), money(item.getUnitPrice()), item.getQuantity(),
						money(item.getUnitPrice().multiply(BigDecimal.valueOf(item.getQuantity())))))
				.toList();
		String branchName = order.getPickupBranchId() == null ? null
				: branches.findById(order.getPickupBranchId()).map(Branch::getName).orElse(null);
		var shipping = new CheckoutSessionResponse.Shipping(order.getShippingMethod().name(),
				order.getRecipientName(), order.getShippingPhone(), order.getShippingAddress(),
				order.getPickupBranchId(), branchName);
		var pricing = new CheckoutSessionResponse.Pricing(money(order.getSubtotal()),
				money(order.getShippingFee()), money(order.getDiscount()), money(order.getTotal()));
		boolean ready = hasCompleteShipping(order);
		boolean codConfirmed = order.getPaymentMethod() == PaymentMethod.cod
				&& order.getCheckoutExpiresAt() == null
				&& order.getStatus() != OrderStatus.cancelled;
		return new CheckoutSessionResponse(order.getId(), order.getPaymentStatus().name(),
				order.getPaymentMethod().name().replace('_', '-'), order.getStatus().name(),
				order.getCheckoutExpiresAt() == null ? null : order.getCheckoutExpiresAt().toString(),
				pricing, items, shipping, couponService.appliedClaimId(order.getId()),
				codConfirmed ? "completed" : ready ? "ready_to_pay" : "draft");
	}

	// 建立時依配送方式解析並驗證地址來源。
	private ShippingSnapshot resolveCreateShipping(CheckoutCreateRequest.Shipping shipping) {
		ShippingMethod method = parseShippingMethod(shipping == null ? null : shipping.method());
		if (method == ShippingMethod.pickup) {
			return pickupSnapshot(shipping == null ? null : shipping.pickupBranchId());
		}
		return new ShippingSnapshot(method,
				firstNonBlank(shipping == null ? null : shipping.address(), PENDING), null);
	}

	// 更新時未提供配送欄位就沿用原值；改為門市取貨時由門市主檔取得地址。
	private ShippingSnapshot resolveUpdateShipping(CheckoutUpdateRequest.Shipping shipping, Order order) {
		ShippingMethod method = shipping.method() == null
				? order.getShippingMethod() : parseShippingMethod(shipping.method());
		if (method == ShippingMethod.pickup) {
			String branchId = shipping.pickupBranchId() == null
					? order.getPickupBranchId() : shipping.pickupBranchId();
			return pickupSnapshot(branchId);
		}
		return new ShippingSnapshot(method,
				updatedValue(shipping.address(), order.getShippingAddress()), null);
	}

	private ShippingSnapshot pickupSnapshot(String branchId) {
		if (branchId == null || branchId.isBlank()) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR,
					"pickupBranchId is required for pickup shipping");
		}
		Branch branch = branches.findById(branchId.trim())
				.orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_ERROR,
						"Pickup branch not found: " + branchId));
		return new ShippingSnapshot(ShippingMethod.pickup, branch.getAddress(), branch.getId());
	}

	private static ShippingMethod parseShippingMethod(String raw) {
		if (raw == null || raw.isBlank()) return ShippingMethod.delivery;
		try {
			return ShippingMethod.valueOf(raw.trim());
		}
		catch (IllegalArgumentException ex) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR, "Unsupported shipping method: " + raw);
		}
	}

	private static boolean hasCompleteShipping(Order order) {
		return !PENDING.equals(order.getRecipientName())
				&& !PENDING.equals(order.getShippingPhone())
				&& !PENDING.equals(order.getShippingAddress());
	}

	// 暫存建立庫存保留紀錄需要的資料。
	private record ReservationDraft(String variantId, String locationId, int quantity) {
	}

	private record ShippingSnapshot(ShippingMethod method, String address, String pickupBranchId) {
	}
}
