package com.yuruicamp.backend.booking.api;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
 * PostgreSQL 驗收（ADM-W4-01）：營區 CRUD、啟停、公開讀取只回 active、
 * 有 zones／預約等引用時禁硬刪、RBAC。
 */
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_BACKEND_IT", matches = "true")
@Execution(ExecutionMode.SAME_THREAD)
class AdminCampgroundPostgreSqlIntegrationTest {

	private static final String ADMIN_TOKEN =
			"Bearer dev:uid-w401-admin:w401-admin@example.test:google:W401 Admin";
	private static final String VIEW_ONLY_TOKEN =
			"Bearer dev:uid-w401-viewer:w401-viewer@example.test:google:W401 Viewer";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

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
				VALUES ('W401-ADMIN', 'W401 Admin', 'w401-admin@example.test', 'admin', true, 'uid-w401-admin'),
				       ('W401-VIEWER', 'W401 Viewer', 'w401-viewer@example.test', 'operator', true, 'uid-w401-viewer')
				ON CONFLICT (id) DO UPDATE SET
				    name = EXCLUDED.name,
				    email = EXCLUDED.email,
				    role = EXCLUDED.role,
				    active = EXCLUDED.active,
				    firebase_uid = EXCLUDED.firebase_uid
				""");
	}

	@AfterEach
	void tearDown() {
		cleanup();
	}

	@Test
	void createUpdateAndDeleteUnusedCampground() throws Exception {
		mockMvc.perform(post("/api/admin/campgrounds")
					.header("Authorization", ADMIN_TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{
							  "id": "W401-CAMP",
							  "name": "W401 測試營區",
							  "region": "測試區",
							  "description": "說明"
							}
							"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.id").value("W401-CAMP"))
				.andExpect(jsonPath("$.data.active").value(true));

		mockMvc.perform(post("/api/admin/campgrounds")
					.header("Authorization", ADMIN_TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{"id":"W401-CAMP","name":"重複","region":"x"}
							"""))
				.andExpect(status().isConflict());

		mockMvc.perform(get("/api/admin/campgrounds")
					.header("Authorization", ADMIN_TOKEN))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data[?(@.id == 'W401-CAMP')].name", hasItem("W401 測試營區")));

		mockMvc.perform(patch("/api/admin/campgrounds/{id}", "W401-CAMP")
					.header("Authorization", ADMIN_TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"name\":\"W401 測試營區（改名）\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.name").value("W401 測試營區（改名）"))
				.andExpect(jsonPath("$.data.region").value("測試區"));

		mockMvc.perform(delete("/api/admin/campgrounds/{id}", "W401-CAMP")
					.header("Authorization", ADMIN_TOKEN))
				.andExpect(status().isOk());

		mockMvc.perform(get("/api/admin/campgrounds/{id}", "W401-CAMP")
					.header("Authorization", ADMIN_TOKEN))
				.andExpect(status().isNotFound());
	}

	@Test
	void deactivateHidesFromPublicListButAdminStillSeesIt() throws Exception {
		createCampground("W401-TOGGLE", "W401 停用測試營區");

		mockMvc.perform(get("/api/booking/campgrounds"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data[?(@.id == 'W401-TOGGLE')]").exists());

		mockMvc.perform(patch("/api/admin/campgrounds/{id}", "W401-TOGGLE")
					.header("Authorization", ADMIN_TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"active\":false}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.active").value(false));

		mockMvc.perform(get("/api/booking/campgrounds"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data[?(@.id == 'W401-TOGGLE')]").isEmpty());

		mockMvc.perform(get("/api/admin/campgrounds/{id}", "W401-TOGGLE")
					.header("Authorization", ADMIN_TOKEN))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.active").value(false));

		mockMvc.perform(patch("/api/admin/campgrounds/{id}", "W401-TOGGLE")
					.header("Authorization", ADMIN_TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"active\":true}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.active").value(true));

		mockMvc.perform(get("/api/booking/campgrounds"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data[?(@.id == 'W401-TOGGLE')]").exists());
	}

	@Test
	void deleteBlockedWhenReferencedByZone() throws Exception {
		createCampground("W401-ZONE-REF", "W401 有營位的營區");
		jdbc.update("""
				INSERT INTO campground_zones (
				    id, campground_id, type, capacity_per_site,
				    price_weekday, price_holiday, total_sites, active
				)
				VALUES ('W401-Z1', 'W401-ZONE-REF', '草皮區', 4, 1000, 1200, 2, true)
				""");

		mockMvc.perform(delete("/api/admin/campgrounds/{id}", "W401-ZONE-REF")
					.header("Authorization", ADMIN_TOKEN))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.message").value(
						org.hamcrest.Matchers.containsString("active=false")));

		jdbc.update("DELETE FROM campground_zones WHERE id = 'W401-Z1'");
		mockMvc.perform(delete("/api/admin/campgrounds/{id}", "W401-ZONE-REF")
					.header("Authorization", ADMIN_TOKEN))
				.andExpect(status().isOk());
	}

	@Test
	void viewerCannotWriteButCanRead() throws Exception {
		mockMvc.perform(get("/api/admin/campgrounds")
					.header("Authorization", VIEW_ONLY_TOKEN))
				.andExpect(status().isOk());

		mockMvc.perform(post("/api/admin/campgrounds")
					.header("Authorization", VIEW_ONLY_TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{"id":"W401-FORBIDDEN","name":"不應建立","region":"x"}
							"""))
				.andExpect(status().isForbidden());
	}

	private void createCampground(String id, String name) throws Exception {
		mockMvc.perform(post("/api/admin/campgrounds")
					.header("Authorization", ADMIN_TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{"id":"%s","name":"%s","region":"測試區","description":"W401"}
							""".formatted(id, name)))
				.andExpect(status().isOk());
	}

	private void cleanup() {
		jdbc.update("DELETE FROM campground_zones WHERE id = 'W401-Z1'");
		jdbc.update("DELETE FROM campgrounds WHERE id LIKE 'W401-%'");
		jdbc.update("DELETE FROM admin_users WHERE id IN ('W401-ADMIN', 'W401-VIEWER')");
	}
}
