package com.yuruicamp.backend.booking.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;

import com.yuruicamp.backend.booking.infrastructure.BookingCheckoutRepository;

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
 * PostgreSQL 驗收（ADM-W4-03）：特殊節日曆 upsert／刪除、區間列表、結帳 holidayCount 連動。
 */
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_BACKEND_IT", matches = "true")
@Execution(ExecutionMode.SAME_THREAD)
class AdminCalendarDatePostgreSqlIntegrationTest {

	private static final String ADMIN_TOKEN =
			"Bearer dev:uid-w403-admin:w403-admin@example.test:google:W403 Admin";
	private static final String VIEW_ONLY_TOKEN =
			"Bearer dev:uid-w403-viewer:w403-viewer@example.test:google:W403 Viewer";
	private static final LocalDate TEST_DATE = LocalDate.of(2099, 1, 2);

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private BookingCheckoutRepository bookingCheckoutRepository;

	@BeforeEach
	void setUp() {
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
				       ('admin', 'booking-calendar.edit'),
				       ('operator', 'booking-calendar.view')
				ON CONFLICT DO NOTHING
				""");
		jdbc.update("""
				INSERT INTO admin_users (id, name, email, role, active, firebase_uid)
				VALUES ('W403-ADMIN', 'W403 Admin', 'w403-admin@example.test', 'admin', true, 'uid-w403-admin'),
				       ('W403-VIEWER', 'W403 Viewer', 'w403-viewer@example.test', 'operator', true, 'uid-w403-viewer')
				ON CONFLICT (id) DO UPDATE SET active = true, firebase_uid = EXCLUDED.firebase_uid
				""");
	}

	@AfterEach
	void tearDown() {
		cleanup();
	}

	@Test
	void listRangeIncludesGeneralDaysAndMarkedHoliday() throws Exception {
		mockMvc.perform(put("/api/admin/calendar-dates/{date}", TEST_DATE)
					.header("Authorization", ADMIN_TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{"isHoliday":true,"holidayName":"W403 測試節日"}
							"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.isHoliday").value(true))
				.andExpect(jsonPath("$.data.holidayName").value("W403 測試節日"));

		mockMvc.perform(get("/api/admin/calendar-dates")
					.header("Authorization", ADMIN_TOKEN)
					.param("from", "2099-01-01")
					.param("to", "2099-01-03"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.length()").value(3))
				.andExpect(jsonPath("$.data[0].calendarDate").value("2099-01-01"))
				.andExpect(jsonPath("$.data[0].isHoliday").value(false))
				.andExpect(jsonPath("$.data[1].calendarDate").value("2099-01-02"))
				.andExpect(jsonPath("$.data[1].isHoliday").value(true));
	}

	@Test
	void unmarkHolidayDeletesRowAndCheckoutCountsZero() throws Exception {
		mockMvc.perform(put("/api/admin/calendar-dates/{date}", TEST_DATE)
					.header("Authorization", ADMIN_TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"isHoliday\":true,\"holidayName\":\"W403\"}"))
				.andExpect(status().isOk());

		int marked = bookingCheckoutRepository.countHolidayDates(TEST_DATE, TEST_DATE.plusDays(1));
		org.junit.jupiter.api.Assertions.assertEquals(1, marked);

		mockMvc.perform(put("/api/admin/calendar-dates/{date}", TEST_DATE)
					.header("Authorization", ADMIN_TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"isHoliday\":false}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.isHoliday").value(false));

		int cleared = bookingCheckoutRepository.countHolidayDates(TEST_DATE, TEST_DATE.plusDays(1));
		org.junit.jupiter.api.Assertions.assertEquals(0, cleared);
	}

	@Test
	void deleteEndpointClearsHoliday() throws Exception {
		mockMvc.perform(put("/api/admin/calendar-dates/{date}", TEST_DATE)
					.header("Authorization", ADMIN_TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"isHoliday\":true}"))
				.andExpect(status().isOk());

		mockMvc.perform(delete("/api/admin/calendar-dates/{date}", TEST_DATE)
					.header("Authorization", ADMIN_TOKEN))
				.andExpect(status().isOk());

		org.junit.jupiter.api.Assertions.assertEquals(0,
				bookingCheckoutRepository.countHolidayDates(TEST_DATE, TEST_DATE.plusDays(1)));
	}

	@Test
	void viewerCannotWriteButCanRead() throws Exception {
		mockMvc.perform(get("/api/admin/calendar-dates")
					.header("Authorization", VIEW_ONLY_TOKEN)
					.param("from", "2099-01-01")
					.param("to", "2099-01-31"))
				.andExpect(status().isOk());

		mockMvc.perform(put("/api/admin/calendar-dates/{date}", TEST_DATE)
					.header("Authorization", VIEW_ONLY_TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"isHoliday\":true}"))
				.andExpect(status().isForbidden());
	}

	private void cleanup() {
		jdbc.update("DELETE FROM calendar_dates WHERE calendar_date = ?", TEST_DATE);
		jdbc.update("DELETE FROM admin_users WHERE id IN ('W403-ADMIN', 'W403-VIEWER')");
	}
}
