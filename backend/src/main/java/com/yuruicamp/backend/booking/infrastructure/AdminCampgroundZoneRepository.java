package com.yuruicamp.backend.booking.infrastructure;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * 用途：後台營位主檔 JDBC（ADM-W4-02）。
 * 核心重點：
 *   - 後台讀全部營位（含停用）；公開 API 只回 active。
 *   - 調降 totalSites 前用 get_zone_availability 算占用峰值。
 * Admin campground zone persistence.
 */
@Repository
public class AdminCampgroundZoneRepository {

	private final NamedParameterJdbcTemplate jdbc;

	public AdminCampgroundZoneRepository(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	private static final String SELECT_COLUMNS = """
			SELECT id, campground_id, type, capacity_per_site,
			       price_weekday, price_holiday, total_sites, active,
			       created_at, updated_at
			FROM campground_zones
			""";

	public List<ZoneRow> findAllByCampgroundId(String campgroundId) {
		return jdbc.query(SELECT_COLUMNS + """
				 WHERE campground_id = :campgroundId
				 ORDER BY id ASC
				""", new MapSqlParameterSource("campgroundId", campgroundId), this::mapRow);
	}

	public ZoneRow findByCampgroundIdAndZoneId(String campgroundId, String zoneId) {
		List<ZoneRow> rows = jdbc.query(SELECT_COLUMNS + """
				 WHERE campground_id = :campgroundId AND id = :zoneId
				""", new MapSqlParameterSource()
						.addValue("campgroundId", campgroundId)
						.addValue("zoneId", zoneId), this::mapRow);
		return rows.isEmpty() ? null : rows.get(0);
	}

	public ZoneRow lockByCampgroundIdAndZoneId(String campgroundId, String zoneId) {
		List<ZoneRow> rows = jdbc.query(SELECT_COLUMNS + """
				 WHERE campground_id = :campgroundId AND id = :zoneId
				 FOR UPDATE
				""", new MapSqlParameterSource()
						.addValue("campgroundId", campgroundId)
						.addValue("zoneId", zoneId), this::mapRow);
		return rows.isEmpty() ? null : rows.get(0);
	}

	public void insert(String id, String campgroundId, String type, int capacityPerSite,
			BigDecimal priceWeekday, BigDecimal priceHoliday, int totalSites,
			boolean active, Instant now) {
		jdbc.update("""
				INSERT INTO campground_zones (
				    id, campground_id, type, capacity_per_site,
				    price_weekday, price_holiday, total_sites, active,
				    created_at, updated_at
				)
				VALUES (
				    :id, :campgroundId, :type, :capacityPerSite,
				    :priceWeekday, :priceHoliday, :totalSites, :active,
				    :now, :now
				)
				""", new MapSqlParameterSource()
						.addValue("id", id)
						.addValue("campgroundId", campgroundId)
						.addValue("type", type)
						.addValue("capacityPerSite", capacityPerSite)
						.addValue("priceWeekday", priceWeekday)
						.addValue("priceHoliday", priceHoliday)
						.addValue("totalSites", totalSites)
						.addValue("active", active)
						.addValue("now", databaseTime(now)));
	}

	public void update(String campgroundId, String zoneId, String type, int capacityPerSite,
			BigDecimal priceWeekday, BigDecimal priceHoliday, int totalSites,
			boolean active, Instant now) {
		jdbc.update("""
				UPDATE campground_zones
				SET type = :type,
				    capacity_per_site = :capacityPerSite,
				    price_weekday = :priceWeekday,
				    price_holiday = :priceHoliday,
				    total_sites = :totalSites,
				    active = :active,
				    updated_at = :now
				WHERE campground_id = :campgroundId AND id = :zoneId
				""", new MapSqlParameterSource()
						.addValue("campgroundId", campgroundId)
						.addValue("zoneId", zoneId)
						.addValue("type", type)
						.addValue("capacityPerSite", capacityPerSite)
						.addValue("priceWeekday", priceWeekday)
						.addValue("priceHoliday", priceHoliday)
						.addValue("totalSites", totalSites)
						.addValue("active", active)
						.addValue("now", databaseTime(now)));
	}

	public void delete(String campgroundId, String zoneId) {
		jdbc.update("""
				DELETE FROM campground_zones
				WHERE campground_id = :campgroundId AND id = :zoneId
				""", new MapSqlParameterSource()
						.addValue("campgroundId", campgroundId)
						.addValue("zoneId", zoneId));
	}

	/**
	 * 自指定日起，該營位在非公休日的最大「已訂＋封鎖」用量。
	 * Peak booked+blocked quantity per night (excluding closure days), from `from` onward.
	 */
	public long findPeakUsageFrom(String campgroundId, String zoneId, LocalDate from, LocalDate toInclusive) {
		Long peak = jdbc.queryForObject("""
				SELECT COALESCE(MAX(booked_quantity + blocked_quantity), 0)
				FROM get_zone_availability(:from, :to, :campgroundId, :zoneId)
				WHERE NOT is_closed
				""", new MapSqlParameterSource()
						.addValue("from", from)
						.addValue("to", toInclusive)
						.addValue("campgroundId", campgroundId)
						.addValue("zoneId", zoneId), Long.class);
		return peak == null ? 0L : peak;
	}

	public Optional<Integer> findBookingWindowDays() {
		List<Integer> values = jdbc.query("""
				SELECT booking_window_days FROM booking_policies WHERE id = 1
				""", new MapSqlParameterSource(), (rs, rowNum) -> rs.getInt("booking_window_days"));
		return values.isEmpty() ? Optional.empty() : Optional.of(values.get(0));
	}

	public long countBookingSelectedZoneReferences(String zoneId) {
		return count("SELECT COUNT(*) FROM booking_selected_zones WHERE zone_id = :zoneId", zoneId);
	}

	public long countZoneBlockReferences(String zoneId) {
		return count("SELECT COUNT(*) FROM zone_blocks WHERE zone_id = :zoneId", zoneId);
	}

	public boolean campgroundExists(String campgroundId) {
		Long count = jdbc.queryForObject("""
				SELECT COUNT(*) FROM campgrounds WHERE id = :id
				""", new MapSqlParameterSource("id", campgroundId), Long.class);
		return count != null && count > 0;
	}

	private long count(String sql, String zoneId) {
		Long value = jdbc.queryForObject(sql, new MapSqlParameterSource("zoneId", zoneId), Long.class);
		return value == null ? 0L : value;
	}

	private ZoneRow mapRow(ResultSet row, int rowNumber) throws SQLException {
		return new ZoneRow(
				row.getString("id"),
				row.getString("campground_id"),
				row.getString("type"),
				row.getInt("capacity_per_site"),
				row.getBigDecimal("price_weekday"),
				row.getBigDecimal("price_holiday"),
				row.getInt("total_sites"),
				row.getBoolean("active"),
				time(row, "created_at"),
				time(row, "updated_at"));
	}

	private Instant time(ResultSet row, String column) throws SQLException {
		return row.getObject(column, OffsetDateTime.class).toInstant();
	}

	private OffsetDateTime databaseTime(Instant value) {
		return OffsetDateTime.ofInstant(value, ZoneOffset.UTC);
	}

	public record ZoneRow(
			String id,
			String campgroundId,
			String type,
			int capacityPerSite,
			BigDecimal priceWeekday,
			BigDecimal priceHoliday,
			int totalSites,
			boolean active,
			Instant createdAt,
			Instant updatedAt) {
	}
}
