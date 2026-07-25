package com.yuruicamp.backend.booking.api;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
 * PostgreSQL 驗收（ADM-W4-02）：營位 CRUD、啟停、容量調降 409、公開／check-availability 一致。
 */
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_BACKEND_IT", matches = "true")
@Execution(ExecutionMode.SAME_THREAD)
class AdminCampgroundZonePostgreSqlIntegrationTest {

	private static final String ADMIN_TOKEN =
			"Bearer dev:uid-w402-admin:w402-admin@example.test:google:W402 Admin";
	private static final String CAMP_ID = "W402-CAMP";
	private static final String ZONE_ID = "W402-Z1";

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
				VALUES ('W402-ADMIN', 'W402 Admin', 'w402-admin@example.test', 'admin', true, 'uid-w402-admin')
				ON CONFLICT (id) DO UPDATE SET active = true, firebase_uid = EXCLUDED.firebase_uid
				""");
		jdbc.update("""
				INSERT INTO customers (id,name,email,registered_at,points,first_purchase_used,auth_provider,firebase_uid,status)
				VALUES ('W402-CUSTOMER','W402 Customer','w402-customer@example.test',now(),0,false,'google','uid-w402-customer','active')
				ON CONFLICT (id) DO UPDATE SET status='active', deleted_at=null
				""");
		createCampground();
	}

	@AfterEach
	void tearDown() {
		cleanup();
	}

	@Test
	void createUpdateDeleteUnusedZoneAndPublicDetailReflectsIt() throws Exception {
		createZone(ZONE_ID, 5);

		mockMvc.perform(get("/api/booking/campgrounds/{id}", CAMP_ID))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.zones[?(@.id == 'W402-Z1')].totalSites", hasItem(5)));

		mockMvc.perform(patch("/api/admin/campgrounds/{campId}/zones/{zoneId}", CAMP_ID, ZONE_ID)
					.header("Authorization", ADMIN_TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"type\":\"木平台區\",\"totalSites\":6}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.type").value("木平台區"))
				.andExpect(jsonPath("$.data.totalSites").value(6));

		mockMvc.perform(delete("/api/admin/campgrounds/{campId}/zones/{zoneId}", CAMP_ID, ZONE_ID)
					.header("Authorization", ADMIN_TOKEN))
				.andExpect(status().isOk());

		mockMvc.perform(get("/api/booking/campgrounds/{id}", CAMP_ID))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.zones[?(@.id == 'W402-Z1')]").isEmpty());
	}

	@Test
	void deactivateHidesFromPublicDetail() throws Exception {
		createZone(ZONE_ID, 3);

		mockMvc.perform(patch("/api/admin/campgrounds/{campId}/zones/{zoneId}", CAMP_ID, ZONE_ID)
					.header("Authorization", ADMIN_TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"active\":false}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.active").value(false));

		mockMvc.perform(get("/api/booking/campgrounds/{id}", CAMP_ID))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.zones[?(@.id == 'W402-Z1')]").isEmpty());

		mockMvc.perform(get("/api/admin/campgrounds/{campId}/zones/{zoneId}", CAMP_ID, ZONE_ID)
					.header("Authorization", ADMIN_TOKEN))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.active").value(false));
	}

	@Test
	void loweringTotalSitesBelowOccupancyReturnsConflict() throws Exception {
		createZone(ZONE_ID, 5);
		seedOccupyingBooking(3);

		mockMvc.perform(patch("/api/admin/campgrounds/{campId}/zones/{zoneId}", CAMP_ID, ZONE_ID)
					.header("Authorization", ADMIN_TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"totalSites\":2}"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.message").value(
						org.hamcrest.Matchers.containsString("peak occupancy")));

		mockMvc.perform(patch("/api/admin/campgrounds/{campId}/zones/{zoneId}", CAMP_ID, ZONE_ID)
					.header("Authorization", ADMIN_TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"totalSites\":3}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.totalSites").value(3));
	}

	@Test
	void checkAvailabilityReflectsNewZoneCapacity() throws Exception {
		createZone(ZONE_ID, 4);

		mockMvc.perform(post("/api/booking/check-availability")
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{
							  "campgroundId": "W402-CAMP",
							  "checkIn": "%s",
							  "checkOut": "%s",
							  "zones": [{"zoneId":"W402-Z1","quantity":1}]
							}
							""".formatted(isoDatePlus(1), isoDatePlus(2))))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.zones[0].availableQuantity").value(4));
	}

	@Test
	void deleteBlockedWhenReferencedByBookingSelectedZone() throws Exception {
		createZone(ZONE_ID, 5);
		seedOccupyingBooking(1);

		mockMvc.perform(delete("/api/admin/campgrounds/{campId}/zones/{zoneId}", CAMP_ID, ZONE_ID)
					.header("Authorization", ADMIN_TOKEN))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.message").value(
						org.hamcrest.Matchers.containsString("active=false")));
	}

	private void createCampground() throws Exception {
		mockMvc.perform(post("/api/admin/campgrounds")
					.header("Authorization", ADMIN_TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{"id":"W402-CAMP","name":"W402 測試營區","region":"測試區"}
							"""))
				.andExpect(status().isOk());
	}

	private void createZone(String zoneId, int totalSites) throws Exception {
		mockMvc.perform(post("/api/admin/campgrounds/{campId}/zones", CAMP_ID)
					.header("Authorization", ADMIN_TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{
							  "id":"%s",
							  "type":"草皮區",
							  "capacityPerSite":4,
							  "priceWeekday":1000,
							  "priceHoliday":1500,
							  "totalSites":%d
							}
							""".formatted(zoneId, totalSites)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.id").value(zoneId));
	}

	private void seedOccupyingBooking(int quantity) {
		jdbc.update("""
				INSERT INTO bookings (id,customer_id,campground_id,campground_name_snapshot,region_snapshot,check_in,check_out,
				 guest_count,weekday_count,holiday_count,zone_total,rental_total,applied_discount,final_amount,payment_method,
				 payment_status,status,created_at,updated_at)
				VALUES ('W402-BK','W402-CUSTOMER',?, 'Camp','測試區',current_date,current_date + 2,
				 2,2,0,100,0,0,100,'ecpay-credit','paid','confirmed',now(),now())
				""", CAMP_ID);
		jdbc.update("""
				INSERT INTO booking_selected_zones (booking_id, zone_id, zone_type_snapshot,
				 price_weekday_snapshot, price_holiday_snapshot, quantity)
				VALUES ('W402-BK', ?, '草皮區', 1000, 1500, ?)
				""", ZONE_ID, quantity);
	}

	private String isoDatePlus(int days) {
		return LocalDate.now().plusDays(days).toString();
	}

	private void cleanup() {
		jdbc.update("DELETE FROM booking_selected_zones WHERE booking_id = 'W402-BK'");
		jdbc.update("DELETE FROM bookings WHERE id = 'W402-BK'");
		jdbc.update("DELETE FROM campground_zones WHERE id LIKE 'W402-%'");
		jdbc.update("DELETE FROM campgrounds WHERE id LIKE 'W402-%'");
		jdbc.query("SELECT soft_delete_customer('W402-CUSTOMER')", resultSet -> {
		});
		jdbc.update("DELETE FROM admin_users WHERE id = 'W402-ADMIN'");
	}
}
