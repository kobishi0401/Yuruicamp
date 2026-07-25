package com.yuruicamp.backend.booking.infrastructure;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

// 鎖定預約並同步寫入狀態歷程、租借履約／取消與退款結果。
@Repository
public class AdminBookingCommandRepository {

	private final JdbcTemplate jdbc;

	public AdminBookingCommandRepository(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public Optional<BookingState> lockById(String id) {
		return jdbc.query("""
				select id, status::text, payment_status::text, check_out, final_amount
				from bookings where id = ? for update
				""", (rs, rowNum) -> new BookingState(
				rs.getString("id"),
				rs.getString("status"),
				rs.getString("payment_status"),
				rs.getObject("check_out", LocalDate.class),
				rs.getBigDecimal("final_amount")), id)
				.stream()
				.findFirst();
	}

	public void updateStatus(String id, String status, Instant now) {
		jdbc.update("update bookings set status = ?::booking_status, updated_at = ? where id = ?",
				status, databaseTime(now), id);
	}

	/**
	 * 已付款取消＋退款成功：cancelled + payment refunded。
	 * Paid cancel after successful refund.
	 */
	public void cancelPaidAndRefunded(String id, Instant now) {
		jdbc.update("""
				update bookings
				set status = 'cancelled',
				    payment_status = 'refunded',
				    updated_at = ?
				where id = ?
				""", databaseTime(now), id);
	}

	public void fulfillRentalReservations(String id, Instant now) {
		jdbc.update("""
				update rental_stock_reservations reservation
				set status = 'fulfilled', fulfilled_at = ?, released_at = null
				where reservation.status = 'active'
				  and exists (
				      select 1
				      from booking_selected_rentals selected
				      where selected.id = reservation.booking_selected_rental_id
				        and selected.booking_id = ?
				  )
				""", databaseTime(now), id);
	}

	/** 取消時釋放仍 active 的租借保留（對齊 E-6）。 */
	public int releaseActiveRentalReservations(String bookingId, Instant releasedAt) {
		return jdbc.update("""
				update rental_stock_reservations reservation
				set status = 'released', released_at = ?, fulfilled_at = null
				where reservation.status = 'active'
				  and exists (
				      select 1
				      from booking_selected_rentals selected
				      where selected.id = reservation.booking_selected_rental_id
				        and selected.booking_id = ?
				  )
				""", databaseTime(releasedAt), bookingId);
	}

	public void addHistory(String id, String status, Instant now, String actorId, String note) {
		jdbc.update("""
				insert into booking_status_history (booking_id, status, occurred_at, actor_id, note)
				values (?, ?::booking_status, ?, ?, ?)
				""", id, status, databaseTime(now), actorId, note);
	}

	public void updateInternalNote(String id, String internalNote, Instant now) {
		jdbc.update("""
				update bookings
				set internal_note = ?, updated_at = ?
				where id = ?
				""", internalNote, databaseTime(now), id);
	}

	private static OffsetDateTime databaseTime(Instant value) {
		return OffsetDateTime.ofInstant(value, ZoneOffset.UTC);
	}

	public record BookingState(
			String id,
			String status,
			String paymentStatus,
			LocalDate checkOut,
			BigDecimal finalAmount) {
	}
}
