package com.yuruicamp.backend.booking.infrastructure;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * 用途：後台月曆可用性 JDBC（Admin UX ticket 03）。
 * 核心重點：直接讀 DB 函式 get_zone_availability 完整欄位，供 Service 加總。
 * Admin calendar availability via get_zone_availability.
 */
@Repository
public class AdminCampgroundAvailabilityRepository {

	private final NamedParameterJdbcTemplate jdbc;

	public AdminCampgroundAvailabilityRepository(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public List<ZoneAvailabilityDetailRow> findZoneAvailabilityDetailed(
			LocalDate from,
			LocalDate toInclusive,
			String campgroundId,
			String zoneId) {
		return jdbc.query("""
				SELECT zone_id, stay_date, total_sites, booked_quantity, blocked_quantity,
				       available_quantity, is_closed
				FROM get_zone_availability(:from, :to, :campgroundId, :zoneId)
				ORDER BY stay_date ASC, zone_id ASC
				""", new MapSqlParameterSource()
						.addValue("from", from)
						.addValue("to", toInclusive)
						.addValue("campgroundId", campgroundId)
						.addValue("zoneId", zoneId), this::mapAvailabilityRow);
	}

	public List<ClosureRow> findClosuresByCampgroundId(String campgroundId) {
		return jdbc.query("""
				SELECT id, campground_id, closure_type, start_date, end_date, weekday,
				       effective_from, effective_to, reason
				FROM campground_closures
				WHERE campground_id = :campgroundId
				ORDER BY id ASC
				""", new MapSqlParameterSource("campgroundId", campgroundId), this::mapClosureRow);
	}

	private ZoneAvailabilityDetailRow mapAvailabilityRow(ResultSet rs, int rowNum) throws SQLException {
		return new ZoneAvailabilityDetailRow(
				rs.getString("zone_id"),
				rs.getObject("stay_date", LocalDate.class),
				rs.getInt("total_sites"),
				rs.getLong("booked_quantity"),
				rs.getLong("blocked_quantity"),
				rs.getLong("available_quantity"),
				rs.getBoolean("is_closed"));
	}

	private ClosureRow mapClosureRow(ResultSet rs, int rowNum) throws SQLException {
		return new ClosureRow(
				rs.getLong("id"),
				rs.getString("campground_id"),
				rs.getString("closure_type"),
				rs.getObject("start_date", LocalDate.class),
				rs.getObject("end_date", LocalDate.class),
				rs.getObject("weekday", Integer.class),
				rs.getObject("effective_from", LocalDate.class),
				rs.getObject("effective_to", LocalDate.class),
				rs.getString("reason"));
	}

	public record ZoneAvailabilityDetailRow(
			String zoneId,
			LocalDate stayDate,
			int totalSites,
			long bookedQuantity,
			long blockedQuantity,
			long availableQuantity,
			boolean closed) {
	}

	public record ClosureRow(
			long id,
			String campgroundId,
			String closureType,
			LocalDate startDate,
			LocalDate endDate,
			Integer weekday,
			LocalDate effectiveFrom,
			LocalDate effectiveTo,
			String reason) {
	}
}
