package com.yuruicamp.backend.customer.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_BACKEND_IT", matches = "true")
// 使用真正 PostgreSQL 驗證會員讀模型、RBAC 與停權狀態。
class AdminCustomerPostgreSqlIntegrationTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@BeforeEach
	void setUp() {
		jdbc.update("INSERT INTO admin_permissions (code, section, action) VALUES ('customers.view', 'customers', 'view'), ('customers.edit', 'customers', 'edit') ON CONFLICT DO NOTHING");
		jdbc.update("INSERT INTO admin_role_permissions (role, permission_code) VALUES ('admin', 'customers.view'), ('admin', 'customers.edit') ON CONFLICT DO NOTHING");
		jdbc.update("""
				INSERT INTO admin_users (id, name, email, role, active, firebase_uid)
				VALUES ('G2A-ADMIN', 'G2A Admin', 'g2a-admin@example.test', 'admin', true, 'uid-g2a-admin')
				ON CONFLICT (id) DO UPDATE SET
				    name = EXCLUDED.name,
				    email = EXCLUDED.email,
				    role = EXCLUDED.role,
				    active = EXCLUDED.active,
				    firebase_uid = EXCLUDED.firebase_uid
				""");
		jdbc.update("""
				INSERT INTO customers (
				    id, name, phone, email, birthday, registered_at, points,
				    first_purchase_used, auth_provider, firebase_uid, status)
				VALUES ('G2A-CUSTOMER', 'G2A Customer', '0912345678', 'g2a-customer@example.test',
				        DATE '1995-05-20', now(), 10, false, 'google', 'uid-g2a-customer', 'active')
				ON CONFLICT (id) DO UPDATE SET
				    name = EXCLUDED.name,
				    phone = EXCLUDED.phone,
				    email = EXCLUDED.email,
				    birthday = EXCLUDED.birthday,
				    points = EXCLUDED.points,
				    firebase_uid = EXCLUDED.firebase_uid,
				    status = 'active',
				    deleted_at = NULL
				""");
	}

	@AfterEach
	void tearDown() {
		cleanup();
	}

	@Test
	void listIncludesCustomerWithoutOrdersAsExplorer() throws Exception {
		mockMvc.perform(get("/api/admin/customers").param("q", "G2A-CUSTOMER")
					.header("Authorization", "Bearer dev:uid-g2a-admin:g2a-admin@example.test:google:G2A Admin"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data[0].tier").value("explorer"))
				.andExpect(jsonPath("$.data[0].totalSpent").value("0.00"));
	}

	@Test
	void suspendImmediatelyBlocksCustomerToken() throws Exception {
		String adminToken = "Bearer dev:uid-g2a-admin:g2a-admin@example.test:google:G2A Admin";
		mockMvc.perform(post("/api/admin/customers/G2A-CUSTOMER/suspend")
					.header("Authorization", adminToken))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("suspended"));

		mockMvc.perform(get("/api/me")
					.header("Authorization", "Bearer dev:uid-g2a-customer:g2a-customer@example.test:google:G2A Customer"))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void detailReturnsBirthdayAsIsoDateOnly() throws Exception {
		mockMvc.perform(get("/api/admin/customers/G2A-CUSTOMER")
					.header("Authorization", "Bearer dev:uid-g2a-admin:g2a-admin@example.test:google:G2A Admin"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.birthday").value("1995-05-20"));
	}

	private void cleanup() {
		jdbc.query("SELECT soft_delete_customer('G2A-CUSTOMER')", resultSet -> {
		});
		jdbc.update("DELETE FROM admin_users WHERE id = 'G2A-ADMIN'");
	}
}
