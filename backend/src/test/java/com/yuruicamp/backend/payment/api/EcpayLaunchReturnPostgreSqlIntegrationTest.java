package com.yuruicamp.backend.payment.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Instant;

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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.util.LinkedMultiValueMap;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * D-2／D-4：ecpay launch、stub aio-checkout、return 導頁（不當 paid）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_BACKEND_IT", matches = "true")
class EcpayLaunchReturnPostgreSqlIntegrationTest {

	private static final String CUSTOMER_ID = "C-PAY-D2-IT";
	private static final String FIREBASE_UID = "pay-d2-it";
	private static final String EMAIL = "pay-d2-it@example.invalid";
	private static final String ORDER_ID = "O-PAY-D2-IT";
	private static final String VARIANT_ID = "V-PAY-D2-IT";
	private static final String LOCATION_ID = "L-PAY-D2-IT";
	private static final String PRODUCT_ID = "P001";
	private static final BigDecimal ORDER_TOTAL = new BigDecimal("1500.00");

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private ObjectMapper objectMapper;

	@BeforeEach
	void setUp() {
		clean();
		insertCustomer();
		insertReadyOrder();
	}

	@AfterEach
	void tearDown() {
		clean();
	}

	@Test
	void launchEcpayReturnsSignedFieldsAndStubActionUrl() throws Exception {
		MvcResult result = mockMvc.perform(post("/api/checkout/sessions/{orderId}/ecpay", ORDER_ID)
						.header("Authorization", bearer())
						.contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.success").value(true))
				.andExpect(jsonPath("$.data.orderId").value(ORDER_ID))
				.andExpect(jsonPath("$.data.actionUrl").value(
						"http://localhost:8080/api/payments/ecpay/stub/aio-checkout"))
				.andExpect(jsonPath("$.data.fields.CheckMacValue").isNotEmpty())
				.andExpect(jsonPath("$.data.fields.CustomField1").value("order:" + ORDER_ID))
				.andReturn();

		JsonNode fields = objectMapper.readTree(result.getResponse().getContentAsString())
				.path("data").path("fields");
		assertThat(fields.path("MerchantTradeNo").asText()).hasSizeLessThanOrEqualTo(20);
		assertThat(paymentStatus()).isEqualTo("unpaid");
	}

	@Test
	void returnRedirectDoesNotMarkPaid() throws Exception {
		mockMvc.perform(get("/api/payments/ecpay/return")
						.param("RtnCode", "1")
						.param("CustomField1", "order:" + ORDER_ID)
						.param("MerchantTradeNo", "YSTUB"))
				.andExpect(status().isFound())
				.andExpect(header().string("Location", org.hamcrest.Matchers.containsString(
						"checkout-success.html")))
				.andExpect(header().string("Location", org.hamcrest.Matchers.containsString(
						"orderId=" + ORDER_ID)));

		assertThat(paymentStatus()).isEqualTo("unpaid");
	}

	@Test
	void returnPostAllowsEcpayStageOrigin() throws Exception {
		// 真沙箱：綠界 stage 以 form POST 導回，Origin 為 payment-stage.ecpay.com.tw。
		mockMvc.perform(post("/api/payments/ecpay/return")
						.header("Origin", "https://payment-stage.ecpay.com.tw")
						.contentType(MediaType.APPLICATION_FORM_URLENCODED)
						.param("RtnCode", "1")
						.param("CustomField1", "order:" + ORDER_ID)
						.param("MerchantTradeNo", "YSTUB"))
				.andExpect(status().isFound())
				.andExpect(header().string("Location", org.hamcrest.Matchers.containsString(
						"orderId=" + ORDER_ID)));

		assertThat(paymentStatus()).isEqualTo("unpaid");
	}

	@Test
	void stubAioCheckoutMarksPaidThenRedirects() throws Exception {
		MvcResult launch = mockMvc.perform(post("/api/checkout/sessions/{orderId}/ecpay", ORDER_ID)
						.header("Authorization", bearer()))
				.andExpect(status().isOk())
				.andReturn();
		JsonNode fields = objectMapper.readTree(launch.getResponse().getContentAsString())
				.path("data").path("fields");

		var form = new LinkedMultiValueMap<String, String>();
		fields.fields().forEachRemaining(entry -> form.add(entry.getKey(), entry.getValue().asText()));

		mockMvc.perform(post("/api/payments/ecpay/stub/aio-checkout")
						.contentType(MediaType.APPLICATION_FORM_URLENCODED)
						.params(form))
				.andExpect(status().isFound())
				.andExpect(header().string("Location", org.hamcrest.Matchers.containsString(
						"orderId=" + ORDER_ID)));

		assertThat(paymentStatus()).isEqualTo("paid");
	}

	@Test
	void confirmCodKeepsUnpaid() throws Exception {
		jdbcTemplate.update("""
				update orders
				set payment_method = 'cod'::payment_method
				where id = ?
				""", ORDER_ID);

		mockMvc.perform(post("/api/checkout/sessions/{orderId}/confirm-cod", ORDER_ID)
						.header("Authorization", bearer()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.paymentStatus").value("unpaid"))
				.andExpect(jsonPath("$.data.checkoutStep").value("completed"));

		assertThat(paymentStatus()).isEqualTo("unpaid");
		assertThat(jdbcTemplate.queryForObject(
				"select checkout_expires_at from orders where id = ?", Object.class, ORDER_ID))
				.isNull();
	}

	private String bearer() {
		return "Bearer dev:" + FIREBASE_UID + ":" + EMAIL + ":google:PayD2";
	}

	private String paymentStatus() {
		return jdbcTemplate.queryForObject(
				"select payment_status::text from orders where id = ?", String.class, ORDER_ID);
	}

	private void insertCustomer() {
		jdbcTemplate.update("""
				insert into customers (
				    id, name, phone, email, registered_at, points,
				    first_purchase_used, auth_provider, firebase_uid,
				    created_at, updated_at, status
				)
				values (?, 'Pay D2', '0911000001', ?, now(), 0,
				        false, 'google', ?, now(), now(), 'active')
				on conflict (id) do update set
				    email = excluded.email,
				    firebase_uid = excluded.firebase_uid,
				    updated_at = now()
				""", CUSTOMER_ID, EMAIL, FIREBASE_UID);
		jdbcTemplate.queryForObject("select reactivate_customer(?)", Boolean.class, CUSTOMER_ID);
	}

	private void insertReadyOrder() {
		jdbcTemplate.update("""
				insert into product_variants (
				    id, product_id, sku, color, size, price, specification, status
				)
				values (?, ?, 'PAY-D2-SKU', null, null, ?, 'pay-d2', 'active')
				on conflict (id) do update set price = excluded.price, status = 'active'
				""", VARIANT_ID, PRODUCT_ID, ORDER_TOTAL);

		jdbcTemplate.update("""
				insert into inventory_locations (
				    id, code, inventory_domain, type, branch_id, name, active
				)
				values (?, 'PAY-D2', 'store', 'main', null, 'Pay D2 Warehouse', true)
				on conflict (id) do nothing
				""", LOCATION_ID);

		jdbcTemplate.update("""
				insert into inventory_stocks (
				    location_id, variant_id, on_hand_quantity, inventory_domain
				)
				values (?, ?, 5, 'store')
				on conflict (location_id, variant_id) do update
				set on_hand_quantity = excluded.on_hand_quantity
				""", LOCATION_ID, VARIANT_ID);

		jdbcTemplate.update("""
				insert into orders (
				    id, customer_id, buyer_name_snapshot, buyer_email_snapshot,
				    recipient_name_snapshot, shipping_address_snapshot,
				    shipping_phone_snapshot, subtotal, shipping_fee, discount, total,
				    payment_method, payment_status, refund_status, status,
				    placed_at, checkout_expires_at
				)
				values (?, ?, 'Pay D2', ?,
				        'Recipient', 'Test Rd 1', '0911000001',
				        ?::numeric, 0, 0, ?::numeric,
				        'ecpay-credit'::payment_method, 'unpaid'::payment_status,
				        'none'::refund_status, 'unshipped'::order_status,
				        ?, now() + interval '15 minutes')
				""", ORDER_ID, CUSTOMER_ID, EMAIL, ORDER_TOTAL, ORDER_TOTAL,
				java.sql.Timestamp.from(Instant.now()));

		jdbcTemplate.update("""
				insert into order_items (
				    order_id, product_id, variant_id, sku_snapshot,
				    product_name_snapshot, specification_snapshot,
				    brand_name_snapshot, image_url_snapshot,
				    unit_price_snapshot, quantity
				)
				values (?, ?, ?, 'PAY-D2-SKU',
				        'Pay D2 Product', 'spec', 'brand', null, ?::numeric, 1)
				""", ORDER_ID, PRODUCT_ID, VARIANT_ID, ORDER_TOTAL);

		Long itemId = jdbcTemplate.queryForObject(
				"select id from order_items where order_id = ?", Long.class, ORDER_ID);
		jdbcTemplate.update("""
				insert into product_stock_reservations (
				    order_item_id, variant_id, location_id, quantity, status,
				    idempotency_key, reserved_at, expires_at, inventory_domain
				)
				values (?, ?, ?, 1, 'active', ?, now(), now() + interval '15 minutes', 'store')
				""", itemId, VARIANT_ID, LOCATION_ID, ORDER_ID + ":item");
	}

	private void clean() {
		jdbcTemplate.update("delete from payment_notifications where order_id = ?", ORDER_ID);
		jdbcTemplate.update("""
				delete from product_stock_reservations
				where idempotency_key = ? or order_item_id in (
				    select id from order_items where order_id = ?
				)
				""", ORDER_ID + ":item", ORDER_ID);
		jdbcTemplate.update("delete from order_status_history where order_id = ?", ORDER_ID);
		jdbcTemplate.update("delete from order_items where order_id = ?", ORDER_ID);
		jdbcTemplate.update("delete from orders where id = ?", ORDER_ID);
		jdbcTemplate.update("delete from inventory_stocks where location_id = ? and variant_id = ?",
				LOCATION_ID, VARIANT_ID);
		jdbcTemplate.update("delete from inventory_locations where id = ?", LOCATION_ID);
		jdbcTemplate.update("delete from product_variants where id = ?", VARIANT_ID);
		Integer exists = jdbcTemplate.queryForObject(
				"select count(*) from customers where id = ?", Integer.class, CUSTOMER_ID);
		if (exists != null && exists > 0) {
			jdbcTemplate.queryForObject("select soft_delete_customer(?)", Boolean.class, CUSTOMER_ID);
		}
	}
}
