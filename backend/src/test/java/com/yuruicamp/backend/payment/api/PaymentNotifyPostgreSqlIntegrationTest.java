package com.yuruicamp.backend.payment.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

import com.yuruicamp.backend.payment.infrastructure.EcpayGateway;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

/**
 * D-1／D-3：真正 PostgreSQL 驗證 Notify 入帳與冪等。
 * 需本機 Docker Postgres + {@code RUN_BACKEND_IT=true}。
 */
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_BACKEND_IT", matches = "true")
class PaymentNotifyPostgreSqlIntegrationTest {

	private static final String CUSTOMER_ID = "C-PAY-D3-IT";
	private static final String ORDER_ID = "O-PAY-D3-IT";
	private static final String BOOKING_ID = "B-PAY-D3-IT";
	private static final String VARIANT_ID = "V-PAY-D3-IT";
	private static final String LOCATION_ID = "L-PAY-D3-IT";
	private static final String PRODUCT_ID = "P001";
	private static final String CAMPGROUND_ID = "CG-PAY-D3";
	private static final BigDecimal ORDER_TOTAL = new BigDecimal("1500.00");
	private static final BigDecimal BOOKING_TOTAL = new BigDecimal("2000.00");

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private EcpayGateway ecpayGateway;

	@BeforeEach
	void setUp() {
		clean();
		insertCustomer();
		insertOrderWithReservation();
		insertBooking();
	}

	@AfterEach
	void tearDown() {
		clean();
	}

	@Test
	void notifyMarksOrderPaidAndIsIdempotent() throws Exception {
		String tradeNo = "TN-ORDER-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
		Map<String, String> notify = ecpayGateway.buildStubPaidNotify(
				ORDER_ID, tradeNo, 1500, "order:" + ORDER_ID);

		mockMvc.perform(formPost("/api/payments/ecpay/notify", notify))
				.andExpect(status().isOk())
				.andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_PLAIN))
				.andExpect(content().string("1|OK"));

		assertThat(paymentStatus("orders", ORDER_ID)).isEqualTo("paid");
		assertThat(jdbcTemplate.queryForObject(
				"select count(*) from payment_notifications where order_id = ? and result = 'success'",
				Integer.class, ORDER_ID)).isEqualTo(1);
		assertThat(jdbcTemplate.queryForObject("""
				select status from product_stock_reservations
				where idempotency_key = ?
				""", String.class, ORDER_ID + ":item")).isEqualTo("fulfilled");

		// 同一 TradeNo 重送：仍 1|OK，不重複入帳列。
		mockMvc.perform(formPost("/api/payments/ecpay/notify", notify))
				.andExpect(status().isOk())
				.andExpect(content().string("1|OK"));

		assertThat(jdbcTemplate.queryForObject(
				"select count(*) from payment_notifications where order_id = ?",
				Integer.class, ORDER_ID)).isEqualTo(1);
		assertThat(paymentStatus("orders", ORDER_ID)).isEqualTo("paid");
	}

	@Test
	void notifyMarksBookingPaidPendingAndDuplicateIgnored() throws Exception {
		String tradeNo = "TN-BOOK-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
		Map<String, String> notify = ecpayGateway.buildStubPaidNotify(
				BOOKING_ID, tradeNo, 2000, "booking:" + BOOKING_ID);

		mockMvc.perform(formPost("/api/payments/ecpay/notify", notify))
				.andExpect(status().isOk())
				.andExpect(content().string("1|OK"));

		assertThat(paymentStatus("bookings", BOOKING_ID)).isEqualTo("paid");
		assertThat(jdbcTemplate.queryForObject(
				"select status::text from bookings where id = ?", String.class, BOOKING_ID))
				.isEqualTo("pending");
		assertThat(jdbcTemplate.queryForObject(
				"select count(*) from payment_notifications where booking_id = ? and result = 'success'",
				Integer.class, BOOKING_ID)).isEqualTo(1);

		mockMvc.perform(formPost("/api/payments/ecpay/notify", notify))
				.andExpect(status().isOk())
				.andExpect(content().string("1|OK"));

		assertThat(jdbcTemplate.queryForObject(
				"select count(*) from payment_notifications where booking_id = ?",
				Integer.class, BOOKING_ID)).isEqualTo(1);
	}

	@Test
	void invalidSignatureReturns400() throws Exception {
		Map<String, String> notify = ecpayGateway.buildStubPaidNotify(
				ORDER_ID, "TN-BAD-SIG", 1500, "order:" + ORDER_ID);
		notify.put("CheckMacValue", "0000000000000000000000000000000000000000000000000000000000000000");

		mockMvc.perform(formPost("/api/payments/ecpay/notify", notify))
				.andExpect(status().isBadRequest())
				.andExpect(content().string("0|CheckMacValueInvalid"));

		assertThat(paymentStatus("orders", ORDER_ID)).isEqualTo("unpaid");
	}

	@Test
	void stubSimulatePaidMarksOrderPaid() throws Exception {
		mockMvc.perform(post("/api/payments/ecpay/stub/simulate-paid")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"orderId\":\"" + ORDER_ID + "\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.success").value(true))
				.andExpect(jsonPath("$.data.outcome").value("SUCCESS"));

		assertThat(paymentStatus("orders", ORDER_ID)).isEqualTo("paid");
	}

	private MockHttpServletRequestBuilder formPost(String path, Map<String, String> params) {
		MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
		params.forEach(form::add);
		return post(path)
				.contentType(MediaType.APPLICATION_FORM_URLENCODED)
				.params(form);
	}

	private String paymentStatus(String table, String id) {
		return jdbcTemplate.queryForObject(
				"select payment_status::text from " + table + " where id = ?",
				String.class, id);
	}

	private void insertCustomer() {
		jdbcTemplate.update("""
				insert into customers (
				    id, name, phone, email, registered_at, points,
				    first_purchase_used, auth_provider, firebase_uid,
				    created_at, updated_at, status
				)
				values (?, 'Pay IT', '0911000000', 'pay-d3-it@example.invalid', now(), 0,
				        false, 'google', 'pay-d3-it', now(), now(), 'active')
				on conflict (id) do update set
				    name = excluded.name,
				    phone = excluded.phone,
				    email = excluded.email,
				    firebase_uid = excluded.firebase_uid,
				    updated_at = now()
				""", CUSTOMER_ID);
		// soft_delete 後必須用 reactivate 清掉 deleted_at，不能只改 status=active。
		jdbcTemplate.queryForObject("select reactivate_customer(?)", Boolean.class, CUSTOMER_ID);
	}

	private void insertOrderWithReservation() {
		jdbcTemplate.update("""
				insert into product_variants (
				    id, product_id, sku, color, size, price, specification, status
				)
				values (?, ?, 'PAY-D3-SKU', null, null, ?, 'pay-it', 'active')
				on conflict (id) do update set price = excluded.price, status = 'active'
				""", VARIANT_ID, PRODUCT_ID, ORDER_TOTAL);

		jdbcTemplate.update("""
				insert into inventory_locations (
				    id, code, inventory_domain, type, branch_id, name, active
				)
				values (?, 'PAY-D3', 'store', 'main', null, 'Pay IT Warehouse', true)
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
				values (?, ?, 'Pay IT', 'pay-d3-it@example.invalid',
				        'Recipient', 'Test Rd 1', '0911000000',
				        ?::numeric, 0, 0, ?::numeric,
				        'ecpay-credit'::payment_method, 'unpaid'::payment_status,
				        'none'::refund_status, 'unshipped'::order_status,
				        ?, now() + interval '15 minutes')
				""", ORDER_ID, CUSTOMER_ID, ORDER_TOTAL, ORDER_TOTAL,
				java.sql.Timestamp.from(Instant.now()));

		jdbcTemplate.update("""
				insert into order_items (
				    order_id, product_id, variant_id, sku_snapshot,
				    product_name_snapshot, specification_snapshot,
				    brand_name_snapshot, image_url_snapshot,
				    unit_price_snapshot, quantity
				)
				values (?, ?, ?, 'PAY-D3-SKU',
				        'Pay Test Product', 'spec', 'brand', null, ?::numeric, 1)
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

	private void insertBooking() {
		jdbcTemplate.update("""
				insert into campgrounds (id, name, region, description, active)
				values (?, 'Pay Campground', 'Test Region', 'Payment IT', true)
				on conflict (id) do nothing
				""", CAMPGROUND_ID);

		LocalDate checkIn = LocalDate.now().plusDays(10);
		jdbcTemplate.update("""
				insert into bookings (
				    id, customer_id, campground_id, campground_name_snapshot,
				    region_snapshot, check_in, check_out, guest_count,
				    weekday_count, holiday_count, zone_total, rental_total,
				    applied_discount, final_amount, payment_method, payment_status,
				    checkout_expires_at, status, created_at, updated_at
				)
				values (?, ?, ?, 'Pay Campground', 'Test Region', ?, ?, 2,
				        2, 0, ?::numeric, 0, 0, ?::numeric,
				        'ecpay-credit'::payment_method, 'unpaid'::payment_status,
				        now() + interval '15 minutes',
				        'pending'::booking_status, now(), now())
				""", BOOKING_ID, CUSTOMER_ID, CAMPGROUND_ID, checkIn, checkIn.plusDays(2),
				BOOKING_TOTAL, BOOKING_TOTAL);
	}

	private void clean() {
		jdbcTemplate.update("delete from payment_notifications where order_id = ? or booking_id = ?",
				ORDER_ID, BOOKING_ID);
		jdbcTemplate.update("""
				delete from product_stock_reservations
				where idempotency_key = ? or order_item_id in (
				    select id from order_items where order_id = ?
				)
				""", ORDER_ID + ":item", ORDER_ID);
		jdbcTemplate.update("delete from order_status_history where order_id = ?", ORDER_ID);
		jdbcTemplate.update("delete from order_items where order_id = ?", ORDER_ID);
		jdbcTemplate.update("delete from orders where id = ?", ORDER_ID);
		jdbcTemplate.update("delete from booking_status_history where booking_id = ?", BOOKING_ID);
		jdbcTemplate.update("delete from bookings where id = ?", BOOKING_ID);
		jdbcTemplate.update("delete from campgrounds where id = ?", CAMPGROUND_ID);
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
