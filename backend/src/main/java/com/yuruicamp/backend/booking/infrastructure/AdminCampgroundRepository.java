package com.yuruicamp.backend.booking.infrastructure;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * 用途：後台營區主檔 JDBC 存取（ADM-W4-01）。
 * 核心重點：
 *   - 後台永遠讀「全部」營區（含停用），公開過濾只在 BookingPublicRepository。
 *   - 硬刪前用 COUNT 檢查引用；有引用時 Service 回 409，引導改用 active=false。
 * Admin campground persistence; hard-delete safety checks are simple COUNT queries.
 */
@Repository
public class AdminCampgroundRepository {

	private final NamedParameterJdbcTemplate jdbc;

	public AdminCampgroundRepository(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	private static final String SELECT_COLUMNS = """
			SELECT id, name, region, description, active, created_at, updated_at
			FROM campgrounds
			""";

	/** 後台列表：依 id 排序，含停用。 / Admin list: all campgrounds ordered by id. */
	public List<CampgroundRow> findAll() {
		return jdbc.query(SELECT_COLUMNS + " ORDER BY id ASC", new MapSqlParameterSource(), this::mapRow);
	}

	public CampgroundRow findById(String id) {
		List<CampgroundRow> rows = jdbc.query(SELECT_COLUMNS + " WHERE id = :id",
				new MapSqlParameterSource("id", id), this::mapRow);
		return rows.isEmpty() ? null : rows.get(0);
	}

	/** FOR UPDATE 鎖定列，避免更新／刪除競態。 / Lock row for update/delete. */
	public CampgroundRow lockById(String id) {
		List<CampgroundRow> rows = jdbc.query(SELECT_COLUMNS + " WHERE id = :id FOR UPDATE",
				new MapSqlParameterSource("id", id), this::mapRow);
		return rows.isEmpty() ? null : rows.get(0);
	}

	public void insert(String id, String name, String region, String description,
			boolean active, Instant now) {
		jdbc.update("""
				INSERT INTO campgrounds (
				    id, name, region, description, active, created_at, updated_at
				)
				VALUES (
				    :id, :name, :region, :description, :active, :now, :now
				)
				""", new MapSqlParameterSource()
						.addValue("id", id)
						.addValue("name", name)
						.addValue("region", region)
						.addValue("description", description)
						.addValue("active", active)
						.addValue("now", databaseTime(now)));
	}

	public void update(String id, String name, String region, String description,
			boolean active, Instant now) {
		jdbc.update("""
				UPDATE campgrounds
				SET name = :name,
				    region = :region,
				    description = :description,
				    active = :active,
				    updated_at = :now
				WHERE id = :id
				""", new MapSqlParameterSource()
						.addValue("id", id)
						.addValue("name", name)
						.addValue("region", region)
						.addValue("description", description)
						.addValue("active", active)
						.addValue("now", databaseTime(now)));
	}

	public void delete(String id) {
		// 環境／設施標籤有 ON DELETE CASCADE；其餘 RESTRICT 引用由 Service 先 COUNT。
		jdbc.update("DELETE FROM campgrounds WHERE id = :id", new MapSqlParameterSource("id", id));
	}

	public long countZoneReferences(String campgroundId) {
		return count("SELECT COUNT(*) FROM campground_zones WHERE campground_id = :id", campgroundId);
	}

	public long countBookingReferences(String campgroundId) {
		return count("SELECT COUNT(*) FROM bookings WHERE campground_id = :id", campgroundId);
	}

	public long countClosureReferences(String campgroundId) {
		return count("SELECT COUNT(*) FROM campground_closures WHERE campground_id = :id", campgroundId);
	}

	public long countRentalListingReferences(String campgroundId) {
		return count("SELECT COUNT(*) FROM rental_listings WHERE campground_id = :id", campgroundId);
	}

	public long countRentalLocationReferences(String campgroundId) {
		return count("SELECT COUNT(*) FROM campground_rental_locations WHERE campground_id = :id",
				campgroundId);
	}

	private long count(String sql, String campgroundId) {
		Long value = jdbc.queryForObject(sql, new MapSqlParameterSource("id", campgroundId), Long.class);
		return value == null ? 0L : value;
	}

	private CampgroundRow mapRow(ResultSet row, int rowNumber) throws SQLException {
		return new CampgroundRow(
				row.getString("id"),
				row.getString("name"),
				row.getString("region"),
				row.getString("description"),
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

	public record CampgroundRow(
			String id,
			String name,
			String region,
			String description,
			boolean active,
			Instant createdAt,
			Instant updatedAt) {
	}
}
