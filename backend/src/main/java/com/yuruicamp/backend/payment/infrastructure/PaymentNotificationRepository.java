package com.yuruicamp.backend.payment.infrastructure;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;

import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Notify 冪等紀錄與 Booking 入帳（Booking 沒有 JPA Entity，統一用 JDBC）。
 */
@Repository
public class PaymentNotificationRepository {

	private final JdbcTemplate jdbcTemplate;

	public PaymentNotificationRepository(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	/** 冪等鍵：provider + merchant_trade_no + COALESCE(provider_trade_no,'') */
	public boolean existsByTradeKey(String merchantTradeNo, String providerTradeNo) {
		String tradeNo = providerTradeNo == null ? "" : providerTradeNo;
		Integer count = jdbcTemplate.queryForObject("""
				select count(*)
				from payment_notifications
				where provider = 'ecpay'
				  and merchant_trade_no = ?
				  and coalesce(provider_trade_no, '') = ?
				""", Integer.class, merchantTradeNo, tradeNo);
		return count != null && count > 0;
	}

	public void insert(
			String merchantTradeNo,
			String providerTradeNo,
			String orderId,
			String bookingId,
			String rawPayloadJson,
			String result,
			Instant processedAt) {
		jdbcTemplate.update("""
				insert into payment_notifications (
				    provider, merchant_trade_no, provider_trade_no,
				    order_id, booking_id, raw_payload, result, processed_at
				)
				values (
				    'ecpay', ?, ?, ?, ?, ?::jsonb, ?, ?
				)
				""",
				merchantTradeNo,
				blankToNull(providerTradeNo),
				orderId,
				bookingId,
				rawPayloadJson,
				result,
				Timestamp.from(processedAt));
	}

	public Optional<PayableTarget> findOrderById(String orderId) {
		try {
			return Optional.ofNullable(jdbcTemplate.queryForObject("""
					select id, payment_status::text, status::text, total,
					       (status = 'cancelled') as cancelled
					from orders
					where id = ?
					""", (rs, rowNum) -> new PayableTarget(
					rs.getString("id"),
					PayableKind.ORDER,
					rs.getString("payment_status"),
					rs.getString("status"),
					rs.getBigDecimal("total"),
					rs.getBoolean("cancelled")), orderId));
		}
		catch (EmptyResultDataAccessException ex) {
			return Optional.empty();
		}
	}

	public Optional<PayableTarget> findBookingById(String bookingId) {
		try {
			return Optional.ofNullable(jdbcTemplate.queryForObject("""
					select id, payment_status::text, status::text, final_amount as total,
					       (status = 'cancelled') as cancelled
					from bookings
					where id = ?
					""", (rs, rowNum) -> new PayableTarget(
					rs.getString("id"),
					PayableKind.BOOKING,
					rs.getString("payment_status"),
					rs.getString("status"),
					rs.getBigDecimal("total"),
					rs.getBoolean("cancelled")), bookingId));
		}
		catch (EmptyResultDataAccessException ex) {
			return Optional.empty();
		}
	}

	/** 鎖定預約列，避免與逾時取消競爭。 */
	public Optional<PayableTarget> lockBookingForUpdate(String bookingId) {
		try {
			return Optional.ofNullable(jdbcTemplate.queryForObject("""
					select id, payment_status::text, status::text, final_amount as total,
					       (status = 'cancelled') as cancelled
					from bookings
					where id = ?
					for update
					""", (rs, rowNum) -> new PayableTarget(
					rs.getString("id"),
					PayableKind.BOOKING,
					rs.getString("payment_status"),
					rs.getString("status"),
					rs.getBigDecimal("total"),
					rs.getBoolean("cancelled")), bookingId));
		}
		catch (EmptyResultDataAccessException ex) {
			return Optional.empty();
		}
	}

	public void markBookingPaid(String bookingId, Instant paidAt) {
		jdbcTemplate.update("""
				update bookings
				set payment_status = 'paid',
				    paid_at = ?,
				    checkout_expires_at = null,
				    updated_at = ?
				where id = ?
				""", Timestamp.from(paidAt), Timestamp.from(paidAt), bookingId);
	}

	public void insertBookingPaidHistory(String bookingId, Instant occurredAt) {
		// 狀態維持 pending；歷程仍記一筆，方便後台看出「已收款待確認」。
		jdbcTemplate.update("""
				insert into booking_status_history (booking_id, status, occurred_at, actor_id, note)
				values (?, 'pending', ?, null, ?)
				""", bookingId, Timestamp.from(occurredAt), "ECPay notify: payment marked paid");
	}

	/** W3：找最近一筆成功 Notify，供全額退款對單。 */
	public Optional<TradeKey> findLatestSuccessTradeForOrder(String orderId) {
		try {
			return Optional.ofNullable(jdbcTemplate.queryForObject("""
					select merchant_trade_no, provider_trade_no
					from payment_notifications
					where provider = 'ecpay' and order_id = ? and result = 'success'
					order by processed_at desc, id desc
					limit 1
					""", (rs, rowNum) -> new TradeKey(
					rs.getString("merchant_trade_no"),
					rs.getString("provider_trade_no")), orderId));
		}
		catch (EmptyResultDataAccessException ex) {
			return Optional.empty();
		}
	}

	public Optional<TradeKey> findLatestSuccessTradeForBooking(String bookingId) {
		try {
			return Optional.ofNullable(jdbcTemplate.queryForObject("""
					select merchant_trade_no, provider_trade_no
					from payment_notifications
					where provider = 'ecpay' and booking_id = ? and result = 'success'
					order by processed_at desc, id desc
					limit 1
					""", (rs, rowNum) -> new TradeKey(
					rs.getString("merchant_trade_no"),
					rs.getString("provider_trade_no")), bookingId));
		}
		catch (EmptyResultDataAccessException ex) {
			return Optional.empty();
		}
	}

	private static String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value;
	}

	public enum PayableKind {
		ORDER,
		BOOKING
	}

	public record PayableTarget(
			String id,
			PayableKind kind,
			String paymentStatus,
			String status,
			BigDecimal total,
			boolean cancelled) {

		public boolean isPaid() {
			return "paid".equals(paymentStatus);
		}
	}

	public record TradeKey(String merchantTradeNo, String providerTradeNo) {
	}
}
