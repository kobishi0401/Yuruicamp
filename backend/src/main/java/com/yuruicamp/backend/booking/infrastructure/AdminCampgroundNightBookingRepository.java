package com.yuruicamp.backend.booking.infrastructure;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * 用途：後台月曆「單晚占用預約」JDBC（Admin UX follow-up ticket 02）。
 * 占用規則對齊 get_zone_availability：policy occupying statuses + [check_in, check_out)。
 */
@Repository
public class AdminCampgroundNightBookingRepository {

	private final NamedParameterJdbcTemplate jdbc;

	public AdminCampgroundNightBookingRepository(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public List<NightBookingRow> findOccupyingForNight(
			String campgroundId,
			LocalDate date,
			String zoneId) {
		MapSqlParameterSource parameters = new MapSqlParameterSource()
				.addValue("campgroundId", campgroundId)
				.addValue("date", date)
				.addValue("zoneId", zoneId);
		String zoneFilter = zoneId == null ? "" : " AND sz.zone_id = :zoneId ";

		return jdbc.query("""
				SELECT b.id, b.display_no, b.customer_id, c.name AS customer_name,
				       sz.zone_id, sz.zone_type_snapshot, sz.quantity,
				       b.status::text AS status, b.check_in, b.check_out
				FROM bookings b
				JOIN booking_selected_zones sz ON sz.booking_id = b.id
				JOIN booking_policy_occupying_statuses pos
				  ON pos.policy_id = 1 AND pos.status = b.status
				JOIN customers c ON c.id = b.customer_id
				JOIN campground_zones z ON z.id = sz.zone_id AND z.active = true
				WHERE b.campground_id = :campgroundId
				  AND :date >= b.check_in
				  AND :date < b.check_out
				  AND sz.quantity > 0
				""" + zoneFilter + """
				ORDER BY b.check_in ASC, b.id ASC, sz.zone_id ASC
				""", parameters, this::mapRow);
	}

	private NightBookingRow mapRow(ResultSet rs, int rowNum) throws SQLException {
		return new NightBookingRow(
				rs.getString("id"),
				rs.getString("display_no"),
				rs.getString("customer_id"),
				rs.getString("customer_name"),
				rs.getString("zone_id"),
				rs.getString("zone_type_snapshot"),
				rs.getInt("quantity"),
				rs.getString("status"),
				rs.getObject("check_in", LocalDate.class),
				rs.getObject("check_out", LocalDate.class));
	}

	public record NightBookingRow(
			String bookingId,
			String displayNo,
			String customerId,
			String customerName,
			String zoneId,
			String zoneType,
			int quantity,
			String status,
			LocalDate checkIn,
			LocalDate checkOut) {
	}
}
