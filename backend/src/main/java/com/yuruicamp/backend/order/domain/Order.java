package com.yuruicamp.backend.order.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

import org.hibernate.annotations.ColumnTransformer;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

// 保存訂單、付款、收件與結帳狀態。
@Entity
@Table(name = "orders")
public class Order {

	@Id
	@Column(length = 32)
	private String id;

	@Column(name = "display_no", nullable = false, length = 16)
	private String displayNo;

	@Column(name = "customer_id", nullable = false, length = 32)
	private String customerId;

	@Column(name = "checkout_idempotency_key", length = 128)
	private String checkoutIdempotencyKey;

	@Column(name = "checkout_request_hash", length = 64)
	private String checkoutRequestHash;

	@Column(name = "buyer_name_snapshot", nullable = false)
	private String buyerName;

	@Column(name = "buyer_email_snapshot", nullable = false)
	private String buyerEmail;

	@Column(name = "recipient_name_snapshot", nullable = false)
	private String recipientName;

	@Column(name = "shipping_address_snapshot", nullable = false)
	private String shippingAddress;

	@Column(name = "shipping_phone_snapshot", nullable = false)
	private String shippingPhone;

	@Enumerated(EnumType.STRING)
	@JdbcTypeCode(SqlTypes.NAMED_ENUM)
	@Column(name = "shipping_method", nullable = false, columnDefinition = "shipping_method")
	private ShippingMethod shippingMethod;

	@Column(name = "pickup_branch_id", length = 32)
	private String pickupBranchId;

	/** 綠界超商門市代碼（ReceiverStoreID）。 */
	@Column(name = "cvs_store_id", length = 10)
	private String cvsStoreId;

	@Column(name = "cvs_store_name", length = 100)
	private String cvsStoreName;

	@Column(name = "cvs_sub_type", length = 20)
	private String cvsSubType;

	@Column(name = "ecpay_logistics_id", length = 20)
	private String ecpayLogisticsId;

	@Column(name = "ecpay_cvs_payment_no", length = 20)
	private String ecpayCvsPaymentNo;

	/** Latest ECPay logistics notify RtnCode (Logistics Status Snapshot). */
	@Column(name = "ecpay_logistics_rtn_code", length = 20)
	private String ecpayLogisticsRtnCode;

	/** Latest ECPay logistics notify RtnMsg (Logistics Status Snapshot). */
	@Column(name = "ecpay_logistics_rtn_msg", length = 200)
	private String ecpayLogisticsRtnMsg;

	@Column(name = "ecpay_logistics_status_at")
	private Instant ecpayLogisticsStatusAt;

	@Column(nullable = false)
	private BigDecimal subtotal;

	@Column(name = "shipping_fee", nullable = false)
	private BigDecimal shippingFee;

	@Column(nullable = false)
	private BigDecimal discount;

	@Column(nullable = false)
	private BigDecimal total;

	// 將付款方式字串明確轉成 PostgreSQL 的 payment_method ENUM。
	@Convert(converter = PaymentMethodConverter.class)
	@ColumnTransformer(write = "cast(? as payment_method)")
	@Column(name = "payment_method", nullable = false, columnDefinition = "payment_method")
	private PaymentMethod paymentMethod;

	@Enumerated(EnumType.STRING)
	@JdbcTypeCode(SqlTypes.NAMED_ENUM)
	@Column(name = "payment_status", nullable = false, columnDefinition = "payment_status")
	private PaymentStatus paymentStatus;

	@Enumerated(EnumType.STRING)
	@JdbcTypeCode(SqlTypes.NAMED_ENUM)
	@Column(name = "refund_status", nullable = false, columnDefinition = "refund_status")
	private RefundStatus refundStatus;

	@Enumerated(EnumType.STRING)
	@JdbcTypeCode(SqlTypes.NAMED_ENUM)
	@Column(nullable = false, columnDefinition = "order_status")
	private OrderStatus status;

	@Column(name = "placed_at", nullable = false)
	private Instant placedAt;

	@Column(name = "paid_at")
	private Instant paidAt;

	@Column(name = "checkout_expires_at")
	private Instant checkoutExpiresAt;

	@OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
	private List<OrderItem> items = new ArrayList<>();

	public String getId() {
		return id;
	}

	public String getDisplayNo() {
		return displayNo;
	}

	public String getCustomerId() {
		return customerId;
	}

	public String getCheckoutIdempotencyKey() {
		return checkoutIdempotencyKey;
	}

	public String getCheckoutRequestHash() {
		return checkoutRequestHash;
	}

	public List<OrderItem> getItems() {
		return items;
	}

	public PaymentMethod getPaymentMethod() {
		return paymentMethod;
	}

	public PaymentStatus getPaymentStatus() {
		return paymentStatus;
	}

	public RefundStatus getRefundStatus() {
		return refundStatus;
	}

	public OrderStatus getStatus() {
		return status;
	}

	public String getBuyerName() {
		return buyerName;
	}

	public String getBuyerEmail() {
		return buyerEmail;
	}

	public String getRecipientName() {
		return recipientName;
	}

	public String getShippingAddress() {
		return shippingAddress;
	}

	public String getShippingPhone() {
		return shippingPhone;
	}

	public ShippingMethod getShippingMethod() {
		return shippingMethod;
	}

	public String getPickupBranchId() {
		return pickupBranchId;
	}

	public String getCvsStoreId() {
		return cvsStoreId;
	}

	public String getCvsStoreName() {
		return cvsStoreName;
	}

	public String getCvsSubType() {
		return cvsSubType;
	}

	public String getEcpayLogisticsId() {
		return ecpayLogisticsId;
	}

	public String getEcpayCvsPaymentNo() {
		return ecpayCvsPaymentNo;
	}

	public String getEcpayLogisticsRtnCode() {
		return ecpayLogisticsRtnCode;
	}

	public String getEcpayLogisticsRtnMsg() {
		return ecpayLogisticsRtnMsg;
	}

	public Instant getEcpayLogisticsStatusAt() {
		return ecpayLogisticsStatusAt;
	}

	public BigDecimal getSubtotal() {
		return subtotal;
	}

	public BigDecimal getShippingFee() {
		return shippingFee;
	}

	public BigDecimal getDiscount() {
		return discount;
	}

	public BigDecimal getTotal() {
		return total;
	}

	public Instant getPlacedAt() {
		return placedAt;
	}

	public Instant getPaidAt() {
		return paidAt;
	}

	public Instant getCheckoutExpiresAt() {
		return checkoutExpiresAt;
	}

	// 建立待付款訂單，並保存冪等鍵與請求指紋。
	public void initialize(
			String id,
			String displayNo,
			String customerId,
			String checkoutIdempotencyKey,
			String checkoutRequestHash,
			String buyerName,
			String buyerEmail,
			String recipientName,
			String shippingAddress,
			String shippingPhone,
			ShippingMethod shippingMethod,
			String pickupBranchId,
			PaymentMethod paymentMethod,
			Instant now,
			Instant expiresAt) {
		initialize(id, displayNo, customerId, checkoutIdempotencyKey, checkoutRequestHash,
				buyerName, buyerEmail, recipientName, shippingAddress, shippingPhone,
				shippingMethod, pickupBranchId, null, null, null, paymentMethod, now, expiresAt);
	}

	public void initialize(
			String id,
			String displayNo,
			String customerId,
			String checkoutIdempotencyKey,
			String checkoutRequestHash,
			String buyerName,
			String buyerEmail,
			String recipientName,
			String shippingAddress,
			String shippingPhone,
			ShippingMethod shippingMethod,
			String pickupBranchId,
			String cvsStoreId,
			String cvsStoreName,
			String cvsSubType,
			PaymentMethod paymentMethod,
			Instant now,
			Instant expiresAt) {
		this.id = id;
		this.displayNo = displayNo;
		this.customerId = customerId;
		this.checkoutIdempotencyKey = checkoutIdempotencyKey;
		this.checkoutRequestHash = checkoutRequestHash;
		this.buyerName = buyerName;
		this.buyerEmail = buyerEmail;
		this.recipientName = recipientName;
		this.shippingAddress = shippingAddress;
		this.shippingPhone = shippingPhone;
		this.shippingMethod = shippingMethod;
		this.pickupBranchId = pickupBranchId;
		this.cvsStoreId = cvsStoreId;
		this.cvsStoreName = cvsStoreName;
		this.cvsSubType = cvsSubType;
		this.paymentMethod = paymentMethod;
		this.paymentStatus = PaymentStatus.unpaid;
		this.refundStatus = RefundStatus.none;
		this.status = OrderStatus.unshipped;
		this.placedAt = now;
		this.checkoutExpiresAt = expiresAt;
		this.subtotal = BigDecimal.ZERO;
		this.shippingFee = BigDecimal.ZERO;
		this.discount = BigDecimal.ZERO;
		this.total = BigDecimal.ZERO;
	}

	// 設定訂單金額，並重新計算最後總額。
	public void setPricing(BigDecimal subtotal, BigDecimal shippingFee, BigDecimal discount) {
		this.subtotal = subtotal;
		this.shippingFee = shippingFee;
		this.discount = discount;
		this.total = subtotal
				.add(shippingFee)
				.subtract(discount)
				.max(BigDecimal.ZERO);
	}

	// 將商品明細加入訂單。
	public void addItem(OrderItem item) {
		items.add(item);
	}

	// 將訂單狀態改成已取消。
	public void cancel() {
		this.status = OrderStatus.cancelled;
	}

	// 到期且仍未付款時取消訂單，重複執行不會再次變更狀態。
	public boolean expire(Instant now) {
		if (paymentStatus != PaymentStatus.unpaid
				|| status == OrderStatus.cancelled
				|| checkoutExpiresAt == null
				|| checkoutExpiresAt.isAfter(now)) {
			return false;
		}

		status = OrderStatus.cancelled;

		return true;
	}

	// 判斷 Checkout 是否仍可修改收件資料或付款方式。
	public boolean isCheckoutEditable(Instant now) {
		return paymentStatus == PaymentStatus.unpaid
				&& status != OrderStatus.cancelled
				&& checkoutExpiresAt != null
				&& checkoutExpiresAt.isAfter(now);
	}

	// 更新 Checkout 的收件快照。
	public void updateShipping(String recipientName, String phone, String address,
			ShippingMethod shippingMethod, String pickupBranchId,
			String cvsStoreId, String cvsStoreName, String cvsSubType) {
		this.recipientName = recipientName;
		this.shippingPhone = phone;
		this.shippingAddress = address;
		this.shippingMethod = shippingMethod;
		this.pickupBranchId = pickupBranchId;
		this.cvsStoreId = cvsStoreId;
		this.cvsStoreName = cvsStoreName;
		this.cvsSubType = cvsSubType;
	}

	/** 電子地圖選店 callback 寫入超商快照並切換為 cvs 配送。 */
	public void applyCvsStoreSelection(String storeId, String storeName, String storeAddress, String subType) {
		this.shippingMethod = ShippingMethod.cvs;
		this.pickupBranchId = null;
		this.cvsStoreId = storeId;
		this.cvsStoreName = storeName;
		this.cvsSubType = subType;
		this.shippingAddress = formatCvsAddress(storeName, storeAddress);
	}

	/** Admin 出貨成功後保存綠界物流編號。 */
	public void assignEcpayLogistics(String logisticsId, String cvsPaymentNo) {
		this.ecpayLogisticsId = logisticsId;
		this.ecpayCvsPaymentNo = cvsPaymentNo;
	}

	/**
	 * Overwrite Logistics Status Snapshot from ECPay notify.
	 * Does not change {@link OrderStatus}.
	 *
	 * @return true when code/msg changed and persistence is needed
	 */
	public boolean applyLogisticsStatusSnapshot(String rtnCode, String rtnMsg, Instant at) {
		String code = rtnCode == null || rtnCode.isBlank() ? null : rtnCode.trim();
		String msg = rtnMsg == null || rtnMsg.isBlank() ? null : rtnMsg.trim();
		if (msg != null && msg.length() > 200) {
			msg = msg.substring(0, 200);
		}
		if (Objects.equals(code, this.ecpayLogisticsRtnCode) && Objects.equals(msg, this.ecpayLogisticsRtnMsg)) {
			return false;
		}
		this.ecpayLogisticsRtnCode = code;
		this.ecpayLogisticsRtnMsg = msg;
		this.ecpayLogisticsStatusAt = at;
		return true;
	}

	private static String formatCvsAddress(String storeName, String storeAddress) {
		String name = storeName == null ? "" : storeName.trim();
		String address = storeAddress == null ? "" : storeAddress.trim();
		if (name.isEmpty() && address.isEmpty()) {
			return "PENDING_CHECKOUT";
		}
		if (name.isEmpty()) {
			return address;
		}
		if (address.isEmpty()) {
			return "全家便利商店 " + name;
		}
		return "全家便利商店 " + name + "｜" + address;
	}

	// 貨到付款確認後取消 Checkout 倒數，但訂單仍維持未付款。
	public void confirmCod() {
		this.checkoutExpiresAt = null;
	}

	// 更新 Checkout 的付款方式。
	public void changePaymentMethod(PaymentMethod paymentMethod) {
		this.paymentMethod = paymentMethod;
	}

	/**
	 * ECPay Notify 首次成功：標記已付款並清掉 Checkout 倒數。
	 * 已付過則回 false（呼叫端應走冪等 ignored_duplicate）。
	 * 已取消訂單不可再標 paid。
	 */
	public boolean markPaid(Instant now) {
		if (paymentStatus == PaymentStatus.paid) {
			return false;
		}
		if (status == OrderStatus.cancelled) {
			return false;
		}

		paymentStatus = PaymentStatus.paid;
		paidAt = now;
		checkoutExpiresAt = null;

		return true;
	}
}
