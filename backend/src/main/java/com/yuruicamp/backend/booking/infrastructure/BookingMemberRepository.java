package com.yuruicamp.backend.booking.infrastructure;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

// E-5 讀模型一律以 customerId 限制查詢，避免讀到其他會員的預約。
@Repository
public class BookingMemberRepository {

	private final JdbcTemplate jdbcTemplate;

	public BookingMemberRepository(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	public long countByCustomerId(String customerId) {
		Long total = jdbcTemplate.queryForObject("""
				select count(*)
				from bookings
				where customer_id = ?
				""", Long.class, customerId);

		return total == null ? 0 : total;
	}

	// 固定依建立時間與 ID 倒序，確保跨頁結果穩定。
	public List<BookingSummaryRow> findPageByCustomerId(
			String customerId,
			int size,
			long offset) {
		return jdbcTemplate.query("""
				select id, display_no, status::text, payment_status::text,
				       campground_name_snapshot, region_snapshot,
				       check_in, check_out, guest_count, final_amount, created_at
				from bookings
				where customer_id = ?
				order by created_at desc, id desc
				limit ? offset ?
				""", (rs, rowNum) -> new BookingSummaryRow(
				rs.getString("id"),
				rs.getString("display_no"),
				rs.getString("status"),
				rs.getString("payment_status"),
				rs.getString("campground_name_snapshot"),
				rs.getString("region_snapshot"),
				rs.getObject("check_in", LocalDate.class),
				rs.getObject("check_out", LocalDate.class),
				rs.getInt("guest_count"),
				rs.getBigDecimal("final_amount"),
				instant(rs, "created_at")), customerId, size, offset);
	}

	// bookingId 與 customerId 必須同時符合；他人資料與不存在使用相同行為。
	public Optional<BookingDetailRow> findOwnedBooking(String customerId, String bookingId) {
		return jdbcTemplate.query("""
				select id, display_no, status::text, payment_status::text, payment_method::text,
				       paid_at, checkout_expires_at, campground_id,
				       campground_name_snapshot, region_snapshot, check_in, check_out,
				       guest_count, weekday_count, holiday_count, zone_total,
				       rental_total, applied_discount, final_amount, created_at, updated_at
				from bookings
				where id = ? and customer_id = ?
				""", (rs, rowNum) -> new BookingDetailRow(
				rs.getString("id"),
				rs.getString("display_no"),
				rs.getString("status"),
				rs.getString("payment_status"),
				rs.getString("payment_method"),
				nullableInstant(rs, "paid_at"),
				nullableInstant(rs, "checkout_expires_at"),
				rs.getString("campground_id"),
				rs.getString("campground_name_snapshot"),
				rs.getString("region_snapshot"),
				rs.getObject("check_in", LocalDate.class),
				rs.getObject("check_out", LocalDate.class),
				rs.getInt("guest_count"),
				rs.getInt("weekday_count"),
				rs.getInt("holiday_count"),
				rs.getBigDecimal("zone_total"),
				rs.getBigDecimal("rental_total"),
				rs.getBigDecimal("applied_discount"),
				rs.getBigDecimal("final_amount"),
				instant(rs, "created_at"),
				instant(rs, "updated_at")), bookingId, customerId)
				.stream()
				.findFirst();
	}

	public List<SelectedZoneRow> findSelectedZones(String bookingId) {
		return jdbcTemplate.query("""
				select zone_id, zone_type_snapshot, price_weekday_snapshot,
				       price_holiday_snapshot, quantity
				from booking_selected_zones
				where booking_id = ?
				order by zone_id
				""", (rs, rowNum) -> new SelectedZoneRow(
				rs.getString("zone_id"),
				rs.getString("zone_type_snapshot"),
				rs.getBigDecimal("price_weekday_snapshot"),
				rs.getBigDecimal("price_holiday_snapshot"),
				rs.getInt("quantity")), bookingId);
	}

	public List<SelectedRentalRow> findSelectedRentals(String bookingId) {
		return jdbcTemplate.query("""
				select rental_listing_id, rental_sku_variant_id, sku_snapshot,
				       name_snapshot, specification_snapshot,
				       price_weekday_snapshot, price_holiday_snapshot,
				       discount_snapshot, quantity
				from booking_selected_rentals
				where booking_id = ?
				order by rental_listing_id
				""", (rs, rowNum) -> new SelectedRentalRow(
				rs.getString("rental_listing_id"),
				rs.getString("rental_sku_variant_id"),
				rs.getString("sku_snapshot"),
				rs.getString("name_snapshot"),
				rs.getString("specification_snapshot"),
				rs.getBigDecimal("price_weekday_snapshot"),
				rs.getBigDecimal("price_holiday_snapshot"),
				rs.getBigDecimal("discount_snapshot"),
				rs.getInt("quantity")), bookingId);
	}

	private static Instant instant(ResultSet rs, String column) throws SQLException {
		return rs.getObject(column, OffsetDateTime.class).toInstant();
	}

	private static Instant nullableInstant(ResultSet rs, String column) throws SQLException {
		OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
		return value == null ? null : value.toInstant();
	}

	public record BookingSummaryRow(
			String id,
			String displayNo,
			String status,
			String paymentStatus,
			String campgroundName,
			String region,
			LocalDate checkIn,
			LocalDate checkOut,
			int guestCount,
			BigDecimal finalAmount,
			Instant createdAt) {
	}

	public record BookingDetailRow(
			String id,
			String displayNo,
			String status,
			String paymentStatus,
			String paymentMethod,
			Instant paidAt,
			Instant checkoutExpiresAt,
			String campgroundId,
			String campgroundName,
			String region,
			LocalDate checkIn,
			LocalDate checkOut,
			int guestCount,
			int weekdayCount,
			int holidayCount,
			BigDecimal zoneTotal,
			BigDecimal rentalTotal,
			BigDecimal discount,
			BigDecimal finalAmount,
			Instant createdAt,
			Instant updatedAt) {
	}

	public record SelectedZoneRow(
			String zoneId,
			String type,
			BigDecimal priceWeekday,
			BigDecimal priceHoliday,
			int quantity) {
	}

	public record SelectedRentalRow(
			String rentalListingId,
			String rentalSkuVariantId,
			String sku,
			String name,
			String specification,
			BigDecimal priceWeekday,
			BigDecimal priceHoliday,
			BigDecimal discountRate,
			int quantity) {
	}
}
