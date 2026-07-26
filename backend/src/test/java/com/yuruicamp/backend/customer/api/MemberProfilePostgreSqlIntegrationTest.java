package com.yuruicamp.backend.customer.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_BACKEND_IT", matches = "true")
class MemberProfilePostgreSqlIntegrationTest {

	private static final String CUSTOMER_ID = "C-MEMBER-PROFILE-IT";
	private static final String FIREBASE_UID = "member-profile-it";
	private static final String EMAIL = "member-profile-it@example.invalid";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@BeforeEach
	void prepareDatabase() {
		removeTestData();
		jdbcTemplate.update("""
				insert into customers (
				    id, name, phone, email, birthday, registered_at, points,
				    first_purchase_used, auth_provider, firebase_uid,
				    created_at, updated_at, status
				)
				values (?, 'Profile IT', null, ?, null, now(), 0,
				        false, 'google', ?, now(), now(), 'active')
				""", CUSTOMER_ID, EMAIL, FIREBASE_UID);
		jdbcTemplate.queryForObject("select reactivate_customer(?)", Boolean.class, CUSTOMER_ID);
	}

	@AfterEach
	void cleanDatabase() {
		removeTestData();
	}

	@Test
	void patchProfilePersistsPhoneAndBirthday() throws Exception {
		mockMvc.perform(patch("/api/me/profile")
					.header("Authorization", bearer())
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{
							  "name": "Profile IT Updated",
							  "phone": "0911222333",
							  "birthday": "1998-03-15"
							}
							"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.phone").value("0911222333"))
				.andExpect(jsonPath("$.data.birthday").value("1998-03-15"));

		mockMvc.perform(get("/api/me/profile").header("Authorization", bearer()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.name").value("Profile IT Updated"))
				.andExpect(jsonPath("$.data.phone").value("0911222333"));
	}

	@Test
	void invalidPhoneReturns400() throws Exception {
		mockMvc.perform(patch("/api/me/profile")
					.header("Authorization", bearer())
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{
							  "name": "Profile IT",
							  "phone": "12345"
							}
							"""))
				.andExpect(status().isBadRequest());
	}

	private String bearer() {
		return "Bearer dev:" + FIREBASE_UID + ":" + EMAIL + ":google:Profile IT";
	}

	private void removeTestData() {
		jdbcTemplate.update("select soft_delete_customer(?)", CUSTOMER_ID);
	}
}
