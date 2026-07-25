package com.yuruicamp.backend.analytics.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * PostgreSQL 驗收（ADM-W4-06）：Analytics shop／booking summary、RBAC、366 天上限。
 */
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_BACKEND_IT", matches = "true")
@Execution(ExecutionMode.SAME_THREAD)
class AdminAnalyticsPostgreSqlIntegrationTest {

	private static final String ANALYTICS_TOKEN =
			"Bearer dev:uid-w406-analytics:w406-analytics@example.test:google:W406 Analytics";
	private static final String NO_ANALYTICS_TOKEN =
			"Bearer dev:uid-w406-noperm:w406-noperm@example.test:google:W406 NoPerm";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@BeforeEach
	void setUp() {
		cleanup();
		jdbc.update("""
				INSERT INTO admin_permissions (code, section, action)
				VALUES ('analytics.view', 'analytics', 'view')
				ON CONFLICT DO NOTHING
				""");
		jdbc.update("""
				INSERT INTO admin_role_permissions (role, permission_code)
				VALUES ('operator', 'analytics.view')
				ON CONFLICT DO NOTHING
				""");
		jdbc.update("""
				INSERT INTO admin_users (id, name, email, role, active, firebase_uid)
				VALUES ('W406-ANALYTICS', 'W406 Analytics', 'w406-analytics@example.test', 'operator', true, 'uid-w406-analytics'),
				       ('W406-NOPERM', 'W406 NoPerm', 'w406-noperm@example.test', 'operator', true, 'uid-w406-noperm')
				ON CONFLICT (id) DO UPDATE SET active = true, firebase_uid = EXCLUDED.firebase_uid
				""");
		jdbc.update("""
				INSERT INTO customers (id, name, email, registered_at, points, first_purchase_used, auth_provider, firebase_uid, status)
				VALUES ('W406-CUST', 'W406 Customer', 'w406-cust@example.test', now(), 0, false, 'google', 'uid-w406-cust', 'active')
				ON CONFLICT (id) DO UPDATE SET status = 'active'
				""");

		insertOrder("W406-O-S1", "shipped", "paid", "none", "2099-06-01", 1000);
		insertOrder("W406-O-S2", "shipped", "paid", "none", "2099-06-02", 500);
		insertOrder("W406-O-R1", "cancelled", "refunded", "refunded", "2099-06-03", 200);
		insertOrder("W406-O-U1", "unshipped", "paid", "none", "2099-06-04", 300);

		jdbc.update("""
				INSERT INTO order_items (order_id, product_id, variant_id, sku_snapshot, product_name_snapshot,
				 specification_snapshot, brand_name_snapshot, image_url_snapshot, unit_price_snapshot, quantity)
				VALUES ('W406-O-S1', 'P-W406', 'V-W406', 'SKU', 'W406 Tent', 'spec', 'Brand', '/img.jpg', 1000.00, 1),
				       ('W406-O-S2', 'P-W406', 'V-W406', 'SKU', 'W406 Tent', 'spec', 'Brand', '/img.jpg', 500.00, 1)
				""");

		jdbc.update("""
				INSERT INTO bookings (id, customer_id, campground_id, campground_name_snapshot, region_snapshot,
				 check_in, check_out, guest_count, weekday_count, holiday_count, zone_total, rental_total,
				 applied_discount, final_amount, payment_method, payment_status, paid_at, status, created_at, updated_at)
				VALUES ('W406-B-P1', 'W406-CUST', 'C002', 'Camp A', '北部', '2099-06-05', '2099-06-06', 2, 1, 0,
				 800, 200, 0, 1000, 'ecpay-credit', 'paid', now(), 'confirmed', '2099-06-01 10:00:00+00', now()),
				       ('W406-B-C1', 'W406-CUST', 'C002', 'Camp A', '北部', '2099-06-07', '2099-06-08', 2, 1, 0,
				 400, 0, 0, 400, 'ecpay-credit', 'refunded', now(), 'cancelled', '2099-06-02 10:00:00+00', now()),
				       ('W406-B-N1', 'W406-CUST', 'C003', 'Camp B', '東部', '2099-06-09', '2099-06-10', 2, 1, 0,
				 600, 0, 0, 600, 'ecpay-credit', 'unpaid', null, 'pending', '2099-06-03 10:00:00+00', now())
				""");
	}

	@AfterEach
	void tearDown() {
		cleanup();
	}

	@Test
	void shopSummaryAggregatesKpisAndTopProducts() throws Exception {
		mockMvc.perform(get("/api/admin/analytics/shop-summary")
					.header("Authorization", ANALYTICS_TOKEN)
					.param("from", "2099-06-01")
					.param("to", "2099-06-30"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.kpis.orderCount").value(4))
				.andExpect(jsonPath("$.data.kpis.pendingShipmentCount").value(1))
				.andExpect(jsonPath("$.data.kpis.refundCount").value(1))
				.andExpect(jsonPath("$.data.kpis.soldQuantity").value(2))
				.andExpect(jsonPath("$.data.kpis.revenueTotal").value(1500))
				.andExpect(jsonPath("$.data.topProducts.length()").value(1));
	}

	@Test
	void bookingSummaryAggregatesKpis() throws Exception {
		mockMvc.perform(get("/api/admin/analytics/booking-summary")
					.header("Authorization", ANALYTICS_TOKEN)
					.param("from", "2099-06-01")
					.param("to", "2099-06-30"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.kpis.periodBookingCount").value(3))
				.andExpect(jsonPath("$.data.kpis.pendingCount").value(1))
				.andExpect(jsonPath("$.data.kpis.cancelledCount").value(1))
				.andExpect(jsonPath("$.data.kpis.revenueTotal").value(1000))
				.andExpect(jsonPath("$.data.kpis.rentalAmount").value(200));
	}

	@Test
	void viewerWithoutAnalyticsPermissionGets403() throws Exception {
		mockMvc.perform(get("/api/admin/analytics/shop-summary")
					.header("Authorization", NO_ANALYTICS_TOKEN)
					.param("from", "2099-06-01")
					.param("to", "2099-06-30"))
				.andExpect(status().isForbidden());
	}

	@Test
	void rangeOver366DaysReturns400() throws Exception {
		mockMvc.perform(get("/api/admin/analytics/shop-summary")
					.header("Authorization", ANALYTICS_TOKEN)
					.param("from", "2099-01-01")
					.param("to", "2100-01-02"))
				.andExpect(status().isBadRequest());
	}

	private void insertOrder(
			String id,
			String status,
			String paymentStatus,
			String refundStatus,
			String placedDate,
			int total) {
		jdbc.update("""
				INSERT INTO orders (id, customer_id, buyer_name_snapshot, buyer_email_snapshot,
				 recipient_name_snapshot, shipping_address_snapshot, shipping_phone_snapshot,
				 subtotal, shipping_fee, discount, total, payment_method, payment_status, refund_status,
				 status, placed_at, paid_at, created_at, updated_at)
				VALUES (?, 'W406-CUST', 'Buyer', 'buyer@test', 'R', 'Addr', '0900',
				 ?, 0, 0, ?, 'ecpay-credit', ?::payment_status, ?::refund_status,
				 ?::order_status, ?::timestamptz, now(), now(), now())
				""", id, total, total, paymentStatus, refundStatus, status, placedDate + " 12:00:00+00");
	}

	private void cleanup() {
		jdbc.update("DELETE FROM order_items WHERE order_id LIKE 'W406-%'");
		jdbc.update("DELETE FROM orders WHERE id LIKE 'W406-%'");
		jdbc.update("DELETE FROM bookings WHERE id LIKE 'W406-%'");
		jdbc.update("DELETE FROM customers WHERE id = 'W406-CUST'");
		jdbc.update("DELETE FROM admin_users WHERE id IN ('W406-ANALYTICS', 'W406-NOPERM')");
	}
}
