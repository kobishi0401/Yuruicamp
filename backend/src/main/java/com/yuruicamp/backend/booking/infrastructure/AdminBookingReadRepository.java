package com.yuruicamp.backend.booking.infrastructure;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.yuruicamp.backend.booking.api.AdminBookingDetailResponse;
import com.yuruicamp.backend.booking.api.AdminBookingListResponse;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

// 後台預約讀模型將分頁主檔與營位、租借、歷程分開查詢。
@Repository
public class AdminBookingReadRepository {

	private static final ZoneId TAIPEI = ZoneId.of("Asia/Taipei");
	private static final Map<String, String> SORT_COLUMNS = Map.of(
			"createdAt", "b.created_at",
			"checkIn", "b.check_in",
			"checkOut", "b.check_out",
			"finalAmount", "b.final_amount",
			"updatedAt", "b.updated_at");

	private final NamedParameterJdbcTemplate jdbc;

	public AdminBookingReadRepository(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public IdPage findIds(
			int page, int size, String query, List<String> statuses, List<String> paymentStatuses,
			List<String> campgroundIds, List<String> regions, Boolean hasRental,
			LocalDate checkInFrom, LocalDate checkInTo, LocalDate createdFrom, LocalDate createdTo,
			String sortField, String direction) {
		StringBuilder where = new StringBuilder(" where 1=1 ");
		MapSqlParameterSource parameters = new MapSqlParameterSource();
		if (!query.isBlank()) {
			where.append(" and (lower(b.id) like :query or lower(b.display_no) like :query or lower(b.customer_id) like :query or lower(c.name) like :query or lower(b.campground_name_snapshot) like :query) ");
			parameters.addValue("query", "%" + query.toLowerCase() + "%");
		}
		appendList(where, parameters, "b.status::text", "statuses", statuses);
		appendList(where, parameters, "b.payment_status::text", "paymentStatuses", paymentStatuses);
		appendList(where, parameters, "b.campground_id", "campgroundIds", campgroundIds);
		appendList(where, parameters, "b.region_snapshot", "regions", regions);
		if (hasRental != null) {
			where.append(hasRental
					? " and exists (select 1 from booking_selected_rentals r where r.booking_id = b.id) "
					: " and not exists (select 1 from booking_selected_rentals r where r.booking_id = b.id) ");
		}
		appendDate(where, parameters, "b.check_in", "checkInFrom", checkInFrom, false);
		appendDate(where, parameters, "b.check_in", "checkInTo", checkInTo, true);
		if (createdFrom != null) {
			where.append(" and b.created_at >= :createdFrom ");
			parameters.addValue("createdFrom", createdFrom.atStartOfDay(TAIPEI).toInstant());
		}
		if (createdTo != null) {
			where.append(" and b.created_at < :createdTo ");
			parameters.addValue("createdTo", createdTo.plusDays(1).atStartOfDay(TAIPEI).toInstant());
		}
		Long total = jdbc.queryForObject(
				"select count(*) from bookings b join customers c on c.id = b.customer_id" + where,
				parameters,
				Long.class);
		parameters.addValue("limit", size).addValue("offset", (long) page * size);
		List<String> ids = jdbc.queryForList(
				"select b.id from bookings b join customers c on c.id = b.customer_id" + where
						+ " order by " + SORT_COLUMNS.get(sortField) + " " + direction + ", b.id desc limit :limit offset :offset",
				parameters,
				String.class);

		return new IdPage(ids, total == null ? 0 : total);
	}

	public List<AdminBookingListResponse> findRows(List<String> ids) {
		if (ids.isEmpty()) {
			return List.of();
		}

		return jdbc.query("""
				select b.id, b.display_no, b.customer_id, c.name customer_name, b.campground_id,
				       b.campground_name_snapshot, b.region_snapshot, b.check_in, b.check_out,
				       b.guest_count, b.final_amount, b.payment_status::text, b.status::text,
				       b.created_at, b.updated_at,
				       exists(select 1 from booking_selected_rentals r where r.booking_id = b.id) has_rental
				from bookings b join customers c on c.id = b.customer_id where b.id in (:ids)
				""", new MapSqlParameterSource("ids", ids), (rs, rowNum) -> new AdminBookingListResponse(
				rs.getString("id"), rs.getString("display_no"), rs.getString("customer_id"),
				rs.getString("customer_name"),
				rs.getString("campground_id"), rs.getString("campground_name_snapshot"),
				rs.getString("region_snapshot"), rs.getObject("check_in", LocalDate.class),
				rs.getObject("check_out", LocalDate.class), rs.getInt("guest_count"),
				rs.getBoolean("has_rental"), money(rs.getBigDecimal("final_amount")),
				rs.getString("payment_status"), rs.getString("status"),
				instant(rs, "created_at"), instant(rs, "updated_at")));
	}

	public Optional<DetailRow> findDetail(String id) {
		return jdbc.query("""
				select b.*, c.name customer_name, c.status::text customer_status
				from bookings b join customers c on c.id = b.customer_id where b.id = :id
				""", new MapSqlParameterSource("id", id), (rs, rowNum) -> new DetailRow(
				rs.getString("id"), rs.getString("display_no"), rs.getString("customer_id"),
				rs.getString("customer_name"),
				rs.getString("customer_status"), rs.getString("campground_id"),
				rs.getString("campground_name_snapshot"), rs.getString("region_snapshot"),
				rs.getObject("check_in", LocalDate.class), rs.getObject("check_out", LocalDate.class),
				rs.getInt("guest_count"), rs.getInt("weekday_count"), rs.getInt("holiday_count"),
				rs.getBigDecimal("zone_total"), rs.getBigDecimal("rental_total"),
				rs.getBigDecimal("applied_discount"), rs.getBigDecimal("final_amount"),
				rs.getString("payment_method"), rs.getString("payment_status"),
				nullableInstant(rs, "paid_at"), rs.getString("status"),
				rs.getString("internal_note"),
				rs.getString("contact_name_snapshot"), rs.getString("contact_phone_snapshot"),
				rs.getString("contact_email_snapshot"),
				instant(rs, "created_at"), instant(rs, "updated_at")))
				.stream()
				.findFirst();
	}

	public List<ZoneLineRow> findZoneLines(String id) {
		return jdbc.query("""
				select zone_id, zone_type_snapshot, price_weekday_snapshot, price_holiday_snapshot, quantity
				from booking_selected_zones where booking_id = :id order by zone_id
				""", new MapSqlParameterSource("id", id), (rs, rowNum) -> new ZoneLineRow(
				rs.getString("zone_id"), rs.getString("zone_type_snapshot"),
				rs.getBigDecimal("price_weekday_snapshot"),
				rs.getBigDecimal("price_holiday_snapshot"), rs.getInt("quantity")));
	}

	public List<RentalLineRow> findRentalLines(String id) {
		return jdbc.query("""
				select rental_listing_id, rental_sku_variant_id, sku_snapshot, name_snapshot,
				       specification_snapshot, price_weekday_snapshot, price_holiday_snapshot,
				       discount_snapshot, quantity
				from booking_selected_rentals where booking_id = :id order by rental_listing_id
				""", new MapSqlParameterSource("id", id), (rs, rowNum) -> new RentalLineRow(
				rs.getString("rental_listing_id"), rs.getString("rental_sku_variant_id"),
				rs.getString("sku_snapshot"), rs.getString("name_snapshot"),
				rs.getString("specification_snapshot"), rs.getBigDecimal("price_weekday_snapshot"),
				rs.getBigDecimal("price_holiday_snapshot"), rs.getBigDecimal("discount_snapshot"),
				rs.getInt("quantity")));
	}

	public List<HistoryEntry> findHistoryEntries(String id) {
		return jdbc.query("""
				select h.status::text, h.occurred_at, h.actor_id, a.name actor_name, h.note
				from booking_status_history h left join admin_users a on a.id = h.actor_id
				where h.booking_id = :id order by h.occurred_at, h.id
				""", new MapSqlParameterSource("id", id), (rs, rowNum) -> new HistoryEntry(
				rs.getString("status"), instant(rs, "occurred_at"), rs.getString("actor_id"),
				rs.getString("actor_name"), rs.getString("note")));
	}

	private static void appendList(StringBuilder where, MapSqlParameterSource parameters,
			String column, String name, List<String> values) {
		if (!values.isEmpty()) {
			where.append(" and ").append(column).append(" in (:").append(name).append(") ");
			parameters.addValue(name, values);
		}
	}

	private static void appendDate(StringBuilder where, MapSqlParameterSource parameters,
			String column, String name, LocalDate value, boolean upper) {
		if (value != null) {
			where.append(" and ").append(column).append(upper ? " <= :" : " >= :").append(name);
			parameters.addValue(name, value);
		}
	}

	private static String money(BigDecimal value) {
		return value.setScale(2).toPlainString();
	}

	private static Instant instant(ResultSet rs, String column) throws SQLException {
		return rs.getObject(column, OffsetDateTime.class).toInstant();
	}

	private static Instant nullableInstant(ResultSet rs, String column) throws SQLException {
		OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
		return value == null ? null : value.toInstant();
	}

	public record IdPage(List<String> ids, long totalElements) {
	}

	public record DetailRow(
			String id, String displayNo, String customerId, String customerName, String customerStatus,
			String campgroundId, String campgroundName, String region, LocalDate checkIn,
			LocalDate checkOut, int guestCount, int weekdayCount, int holidayCount,
			BigDecimal zoneTotal, BigDecimal rentalTotal, BigDecimal discount, BigDecimal finalAmount,
			String paymentMethod, String paymentStatus, Instant paidAt, String status,
			String internalNote, String contactName, String contactPhone, String contactEmail,
			Instant createdAt, Instant updatedAt) {
	}

	public record ZoneLineRow(
			String zoneId, String type, BigDecimal priceWeekday, BigDecimal priceHoliday, int quantity) {
	}

	public record RentalLineRow(
			String rentalListingId, String rentalSkuVariantId, String sku, String name,
			String specification, BigDecimal priceWeekday, BigDecimal priceHoliday,
			BigDecimal discountRate, int quantity) {
	}

	public record HistoryEntry(
			String status, Instant occurredAt, String actorId, String actorName, String note) {
	}
}
