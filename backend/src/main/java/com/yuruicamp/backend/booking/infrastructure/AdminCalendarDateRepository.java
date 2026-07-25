package com.yuruicamp.backend.booking.infrastructure;

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
 * 用途：後台 `calendar_dates` JDBC（ADM-W4-03）。
 * 核心重點：Booking 結帳只認 is_holiday=true 的列；刪除列＝恢復一般日。
 * Admin calendar_dates persistence; checkout counts only is_holiday=true rows.
 */
@Repository
public class AdminCalendarDateRepository {

	static final String ADMIN_SOURCE_VERSION = "admin-manual";

	private final NamedParameterJdbcTemplate jdbc;

	public AdminCalendarDateRepository(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/** 區間內每一天都回一列；LEFT JOIN 無列者 isHoliday=false。 */
	public List<CalendarDateRow> findRangeInclusive(LocalDate from, LocalDate to) {
		return jdbc.query("""
				SELECT d.day::date AS calendar_date,
				       COALESCE(cd.is_holiday, false) AS is_holiday,
				       cd.holiday_name,
				       cd.source_version,
				       cd.effective_at,
				       cd.updated_at
				FROM generate_series(:from, :to, interval '1 day') AS d(day)
				LEFT JOIN calendar_dates cd ON cd.calendar_date = d.day::date
				ORDER BY calendar_date ASC
				""", new MapSqlParameterSource()
						.addValue("from", from)
						.addValue("to", to), this::mapRow);
	}

	public Optional<CalendarDateRow> findByDate(LocalDate date) {
		List<CalendarDateRow> rows = jdbc.query("""
				SELECT calendar_date, is_holiday, holiday_name, source_version, effective_at, updated_at
				FROM calendar_dates
				WHERE calendar_date = :date
				""", new MapSqlParameterSource("date", date), this::mapRow);
		return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
	}

	public void upsertHoliday(LocalDate date, String holidayName, Instant now) {
		jdbc.update("""
				INSERT INTO calendar_dates (
				    calendar_date, is_holiday, holiday_name, source_version, effective_at, updated_at
				)
				VALUES (:date, true, :holidayName, :sourceVersion, :now, :now)
				ON CONFLICT (calendar_date) DO UPDATE SET
				    is_holiday = true,
				    holiday_name = EXCLUDED.holiday_name,
				    source_version = EXCLUDED.source_version,
				    effective_at = EXCLUDED.effective_at,
				    updated_at = EXCLUDED.updated_at
				""", new MapSqlParameterSource()
						.addValue("date", date)
						.addValue("holidayName", holidayName)
						.addValue("sourceVersion", ADMIN_SOURCE_VERSION)
						.addValue("now", databaseTime(now)));
	}

	public void deleteByDate(LocalDate date) {
		jdbc.update("DELETE FROM calendar_dates WHERE calendar_date = :date",
				new MapSqlParameterSource("date", date));
	}

	private CalendarDateRow mapRow(ResultSet row, int rowNumber) throws SQLException {
		return new CalendarDateRow(
				row.getObject("calendar_date", LocalDate.class),
				row.getBoolean("is_holiday"),
				row.getString("holiday_name"),
				row.getString("source_version"),
				instant(row, "effective_at"),
				instant(row, "updated_at"));
	}

	private Instant instant(ResultSet row, String column) throws SQLException {
		OffsetDateTime value = row.getObject(column, OffsetDateTime.class);
		return value == null ? null : value.toInstant();
	}

	private OffsetDateTime databaseTime(Instant value) {
		return OffsetDateTime.ofInstant(value, ZoneOffset.UTC);
	}

	public record CalendarDateRow(
			LocalDate calendarDate,
			boolean isHoliday,
			String holidayName,
			String sourceVersion,
			Instant effectiveAt,
			Instant updatedAt) {
	}
}
