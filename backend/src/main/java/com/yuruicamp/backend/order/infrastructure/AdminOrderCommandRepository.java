package com.yuruicamp.backend.order.infrastructure;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

// 鎖定訂單並以單一交易寫入履約／取消狀態與操作歷程。
@Repository
public class AdminOrderCommandRepository {

	private final JdbcTemplate jdbc;

	public AdminOrderCommandRepository(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public Optional<OrderState> lockById(String id) {
		return jdbc.query("""
				select id, customer_id, status::text, payment_method::text, payment_status::text,
				       refund_status::text, total
				from orders where id = ? for update
				""", (rs, rowNum) -> new OrderState(
				rs.getString("id"),
				rs.getString("customer_id"),
				rs.getString("status"),
				rs.getString("payment_method"),
				rs.getString("payment_status"),
				rs.getString("refund_status"),
				rs.getBigDecimal("total")), id)
				.stream()
				.findFirst();
	}

	public void updateStatus(String id, String status, Instant now) {
		jdbc.update("update orders set status = ?::order_status, updated_at = ? where id = ?",
				status, databaseTime(now), id);
	}

	public void completeCod(String id, Instant now) {
		OffsetDateTime occurredAt = databaseTime(now);

		jdbc.update("""
				update orders
				set status = 'completed', payment_status = 'paid', paid_at = coalesce(paid_at, ?), updated_at = ?
				where id = ?
				""", occurredAt, occurredAt, id);
	}

	/**
	 * 未付款取消：只改履約狀態。
	 * Unpaid cancel: fulfillment status only.
	 */
	public void cancelUnpaid(String id, Instant now) {
		jdbc.update("""
				update orders
				set status = 'cancelled', updated_at = ?
				where id = ?
				""", databaseTime(now), id);
	}

	/**
	 * 已付款取消＋全額退款成功後：履約 cancelled、付款／退款標 refunded。
	 * After paid cancel + successful full refund.
	 */
	public void cancelPaidAndRefunded(String id, Instant now) {
		jdbc.update("""
				update orders
				set status = 'cancelled',
				    payment_status = 'refunded',
				    refund_status = 'refunded',
				    updated_at = ?
				where id = ?
				""", databaseTime(now), id);
	}

	public long addHistory(String id, String status, Instant now, String actorId, String note) {
		return jdbc.queryForObject("""
				insert into order_status_history (order_id, status, occurred_at, actor_id, note)
				values (?, ?::order_status, ?, ?, ?)
				returning id
				""", Long.class, id, status, databaseTime(now), actorId, note);
	}

	public void addRefundEvent(String orderId, long sourceHistoryId, Instant now, String actorId, String note) {
		jdbc.update("""
				insert into order_event_history (source_history_id, order_id, event_type, occurred_at, actor_id, note)
				values (?, ?, 'refund', ?, ?, ?)
				""", sourceHistoryId, orderId, databaseTime(now), actorId, note);
	}

	public List<Long> findOrderItemIds(String orderId) {
		return jdbc.queryForList("select id from order_items where order_id = ?", Long.class, orderId);
	}

	/** 釋放仍為 active 的保留（未付款路徑）。fulfilled 終態不改。 */
	public int releaseActiveReservations(String orderId, Instant now) {
		List<Long> itemIds = findOrderItemIds(orderId);
		if (itemIds.isEmpty()) {
			return 0;
		}
		String placeholders = String.join(",", itemIds.stream().map(id -> "?").toList());
		Object[] args = new Object[itemIds.size() + 1];
		args[0] = databaseTime(now);
		for (int i = 0; i < itemIds.size(); i++) {
			args[i + 1] = itemIds.get(i);
		}
		return jdbc.update("""
				update product_stock_reservations
				set status = 'released', released_at = ?, fulfilled_at = null
				where status = 'active' and order_item_id in (%s)
				""".formatted(placeholders), args);
	}

	/** 未付款取消：清訂單套券並把 discount 歸零（claim 維持 claimed）。 */
	public void clearOrderCouponsForUnpaidCancel(String orderId, Instant now) {
		jdbc.update("delete from order_coupons where order_id = ?", orderId);
		jdbc.update("""
				update orders
				set discount = 0, total = subtotal + shipping_fee, updated_at = ?
				where id = ?
				""", databaseTime(now), orderId);
	}

	/**
	 * 已付款全額退：consumed claim → claimed（可再用）；保留 order_coupons 快照作稽核。
	 */
	public void rollbackConsumedCouponClaim(String orderId) {
		jdbc.update("""
				update coupon_claims claim
				set status = 'claimed'::coupon_claim_status, consumed_at = null
				where claim.status = 'consumed'::coupon_claim_status
				  and claim.id = (
				      select coupon_claim_id from order_coupons where order_id = ?
				  )
				""", orderId);
	}

	// 覆寫內部備註；空白已由 Service 轉成 null。
	public void updateInternalNote(String id, String internalNote, Instant now) {
		jdbc.update("""
				update orders
				set internal_note = ?, updated_at = ?
				where id = ?
				""", internalNote, databaseTime(now), id);
	}

	private static OffsetDateTime databaseTime(Instant value) {
		return OffsetDateTime.ofInstant(value, ZoneOffset.UTC);
	}

	public record OrderState(
			String id,
			String customerId,
			String status,
			String paymentMethod,
			String paymentStatus,
			String refundStatus,
			BigDecimal total) {
	}
}
