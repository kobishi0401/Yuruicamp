package com.yuruicamp.backend.booking.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * PostgreSQL 驗收（Admin UX ticket 03）：後台月曆可用性 API。
 */
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_BACKEND_IT", matches = "true")
@Execution(ExecutionMode.SAME_THREAD)
class AdminCampgroundAvailabilityPostgreSqlIntegrationTest {

	private static final String ADMIN_TOKEN =
			"Bearer dev:uid-w405-admin:w405-admin@example.test:google:W405 Admin";
	private static final String CAMP_ID = "W405-CAMP";
	private static final String ZONE_ID = "W405-Z1";
	private static final LocalDate CLOSED_DATE = LocalDate.of(2099, 8, 10);
	private static final LocalDate HOLIDAY_DATE = LocalDate.of(2099, 8, 11);
	private static final LocalDate OPEN_DATE = LocalDate.of(2099, 8, 12);

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@BeforeEach
	void setUp() throws Exception {
		cleanup();
		jdbc.update("""
				INSERT INTO admin_permissions (code, section, action)
				VALUES ('booking-calendar.view', 'booking-calendar', 'view'),
				       ('booking-calendar.edit', 'booking-calendar', 'edit')
				ON CONFLICT DO NOTHING
				""");
		jdbc.update("""
				INSERT INTO admin_role_permissions (role, permission_code)
				VALUES ('admin', 'booking-calendar.view'),
				       ('admin', 'booking-calendar.edit')
				ON CONFLICT DO NOTHING
				""");
		jdbc.update("""
				INSERT INTO admin_users (id, name, email, role, active, firebase_uid)
				VALUES ('W405-ADMIN', 'W405 Admin', 'w405-admin@example.test', 'admin', true, 'uid-w405-admin')
				ON CONFLICT (id) DO UPDATE SET active = true, firebase_uid = EXCLUDED.firebase_uid
				""");
		jdbc.update("""
				INSERT INTO campgrounds (id, name, region, description, active)
				VALUES (?, 'W405 測試營區', '北部', 'availability IT', true)
				""", CAMP_ID);
		jdbc.update("""
				INSERT INTO campground_zones (
				    id, campground_id, type, capacity_per_site,
				    price_weekday, price_holiday, total_sites, active
				)
				VALUES (?, ?, '草皮區', 4, 1000.00, 1500.00, 5, true)
				""", ZONE_ID, CAMP_ID);
		jdbc.update("""
				INSERT INTO campground_closures (
				    campground_id, closure_type, start_date, end_date, reason, created_by
				)
				VALUES (?, 'date_range', ?, ?, 'W405 單日公休', 'W405-ADMIN')
				""", CAMP_ID, CLOSED_DATE, CLOSED_DATE.plusDays(1));
		mockMvc.perform(put("/api/admin/calendar-dates/{date}", HOLIDAY_DATE)
					.header("Authorization", ADMIN_TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{"isHoliday":true,"holidayName":"W405 特殊節日"}
							"""))
				.andExpect(status().isOk());
	}

	@AfterEach
	void tearDown() {
		cleanup();
	}

	@Test
	void availabilityReturnsClosedHolidayAndOpenDays() throws Exception {
		mockMvc.perform(get("/api/admin/campgrounds/{id}/availability", CAMP_ID)
					.header("Authorization", ADMIN_TOKEN)
					.param("from", CLOSED_DATE.toString())
					.param("to", OPEN_DATE.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.campgroundId").value(CAMP_ID))
				.andExpect(jsonPath("$.data.zoneId").value("__ALL__"))
				.andExpect(jsonPath("$.data.capacity").value(5))
				.andExpect(jsonPath("$.data.days.length()").value(3))
				.andExpect(jsonPath("$.data.days[0].date").value(CLOSED_DATE.toString()))
				.andExpect(jsonPath("$.data.days[0].isClosed").value(true))
				.andExpect(jsonPath("$.data.days[0].closureReason").value("W405 單日公休"))
				.andExpect(jsonPath("$.data.days[0].status").value("closed"))
				.andExpect(jsonPath("$.data.days[1].date").value(HOLIDAY_DATE.toString()))
				.andExpect(jsonPath("$.data.days[1].isHoliday").value(true))
				.andExpect(jsonPath("$.data.days[1].holidayName").value("W405 特殊節日"))
				.andExpect(jsonPath("$.data.days[2].date").value(OPEN_DATE.toString()))
				.andExpect(jsonPath("$.data.days[2].isClosed").value(false))
				.andExpect(jsonPath("$.data.days[2].remaining").value(5));
	}

	@Test
	void availabilityFiltersSingleZone() throws Exception {
		mockMvc.perform(get("/api/admin/campgrounds/{id}/availability", CAMP_ID)
					.header("Authorization", ADMIN_TOKEN)
					.param("from", OPEN_DATE.toString())
					.param("to", OPEN_DATE.toString())
					.param("zoneId", ZONE_ID))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.zoneId").value(ZONE_ID))
				.andExpect(jsonPath("$.data.days[0].capacity").value(5))
				.andExpect(jsonPath("$.data.days[0].remaining").value(5));
	}

	@Test
	void unknownCampgroundReturns404() throws Exception {
		mockMvc.perform(get("/api/admin/campgrounds/{id}/availability", "W405-MISSING")
					.header("Authorization", ADMIN_TOKEN)
					.param("from", OPEN_DATE.toString())
					.param("to", OPEN_DATE.toString()))
				.andExpect(status().isNotFound());
	}

	private void cleanup() {
		jdbc.update("DELETE FROM calendar_dates WHERE calendar_date IN (?, ?, ?)",
				CLOSED_DATE, HOLIDAY_DATE, OPEN_DATE);
		jdbc.update("DELETE FROM campground_closures WHERE campground_id = ?", CAMP_ID);
		jdbc.update("DELETE FROM campground_zones WHERE campground_id = ?", CAMP_ID);
		jdbc.update("DELETE FROM campgrounds WHERE id = ?", CAMP_ID);
	}
}
