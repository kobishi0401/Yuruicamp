package com.yuruicamp.backend.integration.n8n.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Primary seam from LINE n8n CS spec: API Key auth, not-linked, limit, display-no scope, PII omission.
 */
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_BACKEND_IT", matches = "true")
class N8nCsOrderPostgreSqlIntegrationTest {

	private static final String API_KEY = "n8n-it-test-key";
	private static final String CUSTOMER_A = "C-N8N-CS-A";
	private static final String CUSTOMER_B = "C-N8N-CS-B";
	private static final String LINE_A = "UlineN8nCsA001";
	private static final String LINE_UNBOUND = "UlineN8nUnbound001";
	private static final String ORDER_OLD = "O-N8N-CS-OLD";
	private static final String ORDER_NEW = "O-N8N-CS-NEW";
	private static final String ORDER_OTHER = "O-N8N-CS-OTHER";
	private static final String DISPLAY_NEW = "N8NCSNEW001";
	private static final String DISPLAY_OTHER = "N8NCSOTH001";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@BeforeEach
	void prepareDatabase() {
		removeTestData();
		insertCustomer(CUSTOMER_A, "n8n-cs-a@example.invalid", "n8n-cs-a", LINE_A);
		insertCustomer(CUSTOMER_B, "n8n-cs-b@example.invalid", "n8n-cs-b", "UlineN8nCsB001");
		insertOrder(ORDER_OLD, CUSTOMER_A, "N8NCSOLD001", Instant.now().minusSeconds(200));
		insertOrder(ORDER_NEW, CUSTOMER_A, DISPLAY_NEW, Instant.now().minusSeconds(100));
		insertOrder(ORDER_OTHER, CUSTOMER_B, DISPLAY_OTHER, Instant.now());
	}

	@AfterEach
	void cleanDatabase() {
		removeTestData();
	}

	@Test
	void rejectsMissingOrWrongApiKey() throws Exception {
		mockMvc.perform(get("/api/integrations/n8n/customers/by-line-user-id/{lineUserId}", LINE_A))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));

		mockMvc.perform(get("/api/integrations/n8n/customers/by-line-user-id/{lineUserId}", LINE_A)
						.header("X-Api-Key", "wrong-key"))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void resolveReturnsNotLinkedForUnboundLineUserId() throws Exception {
		mockMvc.perform(get("/api/integrations/n8n/customers/by-line-user-id/{lineUserId}", LINE_UNBOUND)
						.header("X-Api-Key", API_KEY))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.linked").value(false))
				.andExpect(jsonPath("$.data.customerId").doesNotExist());
	}

	@Test
	void listRecentDefaultsToOneAndCapsAtFive() throws Exception {
		mockMvc.perform(get("/api/integrations/n8n/customers/by-line-user-id/{lineUserId}/orders", LINE_A)
						.header("X-Api-Key", API_KEY))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.length()").value(1))
				.andExpect(jsonPath("$.data[0].displayNo").value(DISPLAY_NEW));

		mockMvc.perform(get("/api/integrations/n8n/customers/by-line-user-id/{lineUserId}/orders", LINE_A)
						.param("limit", "99")
						.header("X-Api-Key", API_KEY))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.length()").value(2));
	}

	@Test
	void displayNoLookupIsCustomerScoped() throws Exception {
		mockMvc.perform(get(
						"/api/integrations/n8n/customers/by-line-user-id/{lineUserId}/orders/by-display-no/{displayNo}",
						LINE_A,
						DISPLAY_OTHER)
						.header("X-Api-Key", API_KEY))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("NOT_FOUND"));

		mockMvc.perform(get(
						"/api/integrations/n8n/customers/by-line-user-id/{lineUserId}/orders/by-display-no/{displayNo}",
						LINE_A,
						DISPLAY_NEW)
						.header("X-Api-Key", API_KEY))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.displayNo").value(DISPLAY_NEW));
	}

	@Test
	void unboundLineUserIdOnOrdersReturnsLineNotLinked() throws Exception {
		mockMvc.perform(get("/api/integrations/n8n/customers/by-line-user-id/{lineUserId}/orders", LINE_UNBOUND)
						.header("X-Api-Key", API_KEY))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("LINE_NOT_LINKED"));
	}

	@Test
	void csCardOmitsAddressPhoneAndInternalNotes() throws Exception {
		mockMvc.perform(get("/api/integrations/n8n/customers/by-line-user-id/{lineUserId}/orders", LINE_A)
						.header("X-Api-Key", API_KEY))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data[0].displayNo").exists())
				.andExpect(jsonPath("$.data[0].status").exists())
				.andExpect(jsonPath("$.data[0].paymentStatus").exists())
				.andExpect(jsonPath("$.data[0].shippingMethod").exists())
				.andExpect(jsonPath("$.data[0].placedAt").exists())
				.andExpect(jsonPath("$.data[0].shippingAddress").doesNotExist())
				.andExpect(jsonPath("$.data[0].shippingPhone").doesNotExist())
				.andExpect(jsonPath("$.data[0].internalNote").doesNotExist())
				.andExpect(jsonPath("$.data[0].items").doesNotExist());
	}

	private void insertCustomer(String customerId, String email, String firebaseUid, String lineUserId) {
		jdbcTemplate.update("""
				insert into customers (
				    id, name, phone, email, registered_at, points,
				    first_purchase_used, auth_provider, firebase_uid, line_user_id,
				    created_at, updated_at, status
				)
				values (?, 'N8N CS Tester', '0912345678', ?, now(), 0,
				        false, 'google', ?, ?, now(), now(), 'active')
				on conflict (id) do update set
				    email = excluded.email,
				    firebase_uid = excluded.firebase_uid,
				    line_user_id = excluded.line_user_id,
				    updated_at = now()
				""", customerId, email, firebaseUid, lineUserId);
		jdbcTemplate.queryForObject("select reactivate_customer(?)", Boolean.class, customerId);
	}

	private void insertOrder(String orderId, String customerId, String displayNo, Instant placedAt) {
		jdbcTemplate.update("""
				insert into orders (
				    id, display_no, customer_id, buyer_name_snapshot, buyer_email_snapshot,
				    recipient_name_snapshot, shipping_address_snapshot,
				    shipping_phone_snapshot, subtotal, shipping_fee, discount, total,
				    payment_method, payment_status, refund_status, status,
				    shipping_method, placed_at, checkout_expires_at, internal_note
				)
				values (?, ?, ?, 'Order Tester', 'order@example.invalid',
				        '收件測試者', '秘密完整地址不應外洩', '0912345678',
				        1000.00, 0.00, 0.00, 1000.00,
				        'ecpay-credit', 'unpaid', 'none', 'unshipped',
				        'delivery', ?, now() + interval '15 minutes', '內部備註不應外洩')
				""",
				orderId,
				displayNo,
				customerId,
				java.sql.Timestamp.from(placedAt));
	}

	private void removeTestData() {
		jdbcTemplate.update(
				"delete from orders where id in (?, ?, ?)",
				ORDER_OLD,
				ORDER_NEW,
				ORDER_OTHER);
		softDeleteIfPresent(CUSTOMER_A);
		softDeleteIfPresent(CUSTOMER_B);
	}

	private void softDeleteIfPresent(String customerId) {
		Integer count = jdbcTemplate.queryForObject(
				"select count(*) from customers where id = ? and status <> 'deleted'",
				Integer.class,
				customerId);
		if (count != null && count > 0) {
			jdbcTemplate.queryForObject("select soft_delete_customer(?)", Boolean.class, customerId);
		}
	}
}
