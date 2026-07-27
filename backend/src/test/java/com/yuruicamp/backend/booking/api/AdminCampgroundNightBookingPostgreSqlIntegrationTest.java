package com.yuruicamp.backend.booking.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * PostgreSQL 驗收（Admin UX follow-up ticket 02）：單晚占用預約 API。
 */
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_BACKEND_IT", matches = "true")
@Execution(ExecutionMode.SAME_THREAD)
class AdminCampgroundNightBookingPostgreSqlIntegrationTest {

	private static final String ADMIN_TOKEN =
			"Bearer dev:uid-w406-admin:w406-admin@example.test:google:W406 Admin";
	private static final String CAMP_ID = "W406-CAMP";
	private static final String ZONE_ID = "W406-Z1";
	private static final String CUSTOMER_ID = "W406-CUST";
	private static final String BOOKING_ID = "W406-BK";
	private static final String CANCELLED_ID = "W406-BK-CXL";
	private static final LocalDate STAY_NIGHT = LocalDate.of(2099, 7, 29);

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@BeforeEach
	void setUp() {
		cleanup();
		jdbc.update("""
				INSERT INTO admin_permissions (code, section, action)
				VALUES ('booking-calendar.view', 'booking-calendar', 'view')
				ON CONFLICT DO NOTHING
				""");
		jdbc.update("""
				INSERT INTO admin_role_permissions (role, permission_code)
				VALUES ('admin', 'booking-calendar.view')
				ON CONFLICT DO NOTHING
				""");
		jdbc.update("""
				INSERT INTO admin_users (id, name, email, role, active, firebase_uid)
				VALUES ('W406-ADMIN', 'W406 Admin', 'w406-admin@example.test', 'admin', true, 'uid-w406-admin')
				ON CONFLICT (id) DO UPDATE SET active = true, firebase_uid = EXCLUDED.firebase_uid
				""");
		jdbc.update("""
				INSERT INTO campgrounds (id, name, region, description, active)
				VALUES (?, 'W406 測試營區', '北部', 'night bookings IT', true)
				""", CAMP_ID);
		jdbc.update("""
				INSERT INTO campground_zones (
				    id, campground_id, type, capacity_per_site,
				    price_weekday, price_holiday, total_sites, active
				)
				VALUES (?, ?, '草皮區', 4, 1000.00, 1500.00, 5, true)
				""", ZONE_ID, CAMP_ID);
		jdbc.update("""
				INSERT INTO customers (
				    id, name, email, registered_at, points, first_purchase_used,
				    auth_provider, firebase_uid, status
				)
				VALUES (?, 'W406 顧客', 'w406-cust@example.test', now(), 0, false, 'google', 'uid-w406-cust', 'active')
				""", CUSTOMER_ID);
		insertBooking(BOOKING_ID, "BK-W406", "confirmed");
		insertBooking(CANCELLED_ID, "BK-W406-CXL", "cancelled");
	}

	@AfterEach
	void tearDown() {
		cleanup();
	}

	@Test
	void returnsOccupyingBookingForNight() throws Exception {
		mockMvc.perform(get("/api/admin/campgrounds/{id}/bookings-for-night", CAMP_ID)
					.header("Authorization", ADMIN_TOKEN)
					.param("date", STAY_NIGHT.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.campgroundId").value(CAMP_ID))
				.andExpect(jsonPath("$.data.date").value(STAY_NIGHT.toString()))
				.andExpect(jsonPath("$.data.zoneId").value("__ALL__"))
				.andExpect(jsonPath("$.data.rows.length()").value(1))
				.andExpect(jsonPath("$.data.rows[0].bookingId").value(BOOKING_ID))
				.andExpect(jsonPath("$.data.rows[0].displayNo").value("BK-W406"))
				.andExpect(jsonPath("$.data.rows[0].zoneId").value(ZONE_ID))
				.andExpect(jsonPath("$.data.rows[0].quantity").value(2))
				.andExpect(jsonPath("$.data.rows[0].status").value("confirmed"));
	}

	@Test
	void filtersSingleZone() throws Exception {
		mockMvc.perform(get("/api/admin/campgrounds/{id}/bookings-for-night", CAMP_ID)
					.header("Authorization", ADMIN_TOKEN)
					.param("date", STAY_NIGHT.toString())
					.param("zoneId", ZONE_ID))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.zoneId").value(ZONE_ID))
				.andExpect(jsonPath("$.data.rows.length()").value(1));
	}

	@Test
	void unknownCampgroundReturns404() throws Exception {
		mockMvc.perform(get("/api/admin/campgrounds/{id}/bookings-for-night", "W406-MISSING")
					.header("Authorization", ADMIN_TOKEN)
					.param("date", STAY_NIGHT.toString()))
				.andExpect(status().isNotFound());
	}

	private void insertBooking(String bookingId, String displayNo, String status) {
		jdbc.update("""
				INSERT INTO bookings (
				    id, display_no, customer_id, campground_id, campground_name_snapshot, region_snapshot,
				    check_in, check_out, guest_count, weekday_count, holiday_count,
				    zone_total, rental_total, applied_discount, final_amount,
				    payment_method, payment_status, paid_at, status,
				    contact_name_snapshot, contact_phone_snapshot, contact_email_snapshot,
				    checkout_expires_at, created_at, updated_at
				)
				VALUES (?, ?, ?, ?, 'W406 測試營區', '北部',
				        DATE '2099-07-28', DATE '2099-07-30', 2, 2, 0,
				        2000.00, 0.00, 0.00, 2000.00,
				        'ecpay-credit', 'paid', now(), ?::booking_status,
				        'W406 顧客', '0900000000', 'w406-cust@example.test',
				        now() + interval '15 minutes', now(), now())
				""", bookingId, displayNo, CUSTOMER_ID, CAMP_ID, status);
		jdbc.update("""
				INSERT INTO booking_selected_zones (
				    booking_id, zone_id, zone_type_snapshot,
				    price_weekday_snapshot, price_holiday_snapshot, quantity
				)
				VALUES (?, ?, '草皮區', 1000.00, 1500.00, 2)
				""", bookingId, ZONE_ID);
	}

	private void cleanup() {
		jdbc.update("DELETE FROM booking_selected_zones WHERE booking_id IN (?, ?)", BOOKING_ID, CANCELLED_ID);
		jdbc.update("DELETE FROM bookings WHERE id IN (?, ?)", BOOKING_ID, CANCELLED_ID);
		jdbc.update("DELETE FROM customers WHERE id = ?", CUSTOMER_ID);
		jdbc.update("DELETE FROM campground_zones WHERE campground_id = ?", CAMP_ID);
		jdbc.update("DELETE FROM campgrounds WHERE id = ?", CAMP_ID);
	}
}
