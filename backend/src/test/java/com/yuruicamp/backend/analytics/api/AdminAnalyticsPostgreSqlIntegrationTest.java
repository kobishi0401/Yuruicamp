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
		// operator 角色可能已有 analytics.view；以個人覆寫明確開／關以驗收 RBAC
		jdbc.update("""
				INSERT INTO admin_user_permissions (admin_user_id, permission_code, allowed)
				VALUES ('W406-ANALYTICS', 'analytics.view', true),
				       ('W406-NOPERM', 'analytics.view', false)
				ON CONFLICT (admin_user_id, permission_code)
				DO UPDATE SET allowed = EXCLUDED.allowed
				""");
		jdbc.update("""
				INSERT INTO customers (id, name, email, registered_at, points, first_purchase_used, auth_provider, firebase_uid, status)
				VALUES ('W406-CUST', 'W406 Customer', 'w406-cust@example.test', now(), 0, false, 'google', 'uid-w406-cust', 'active')
				ON CONFLICT (id) DO UPDATE SET status = 'active', deleted_at = NULL
				""");

		insertOrder("W406-O-S1", "shipped", "paid", "none", "2099-06-01", 1000);
		insertOrder("W406-O-S2", "shipped", "paid", "none", "2099-06-02", 500);
		insertOrder("W406-O-R1", "cancelled", "refunded", "refunded", "2099-06-03", 200);
		insertOrder("W406-O-U1", "unshipped", "paid", "none", "2099-06-04", 300);

		jdbc.update("DELETE FROM order_items WHERE order_id LIKE 'W406-%'");
		seedShopCategoryChain();
		jdbc.update("""
				INSERT INTO order_items (id, order_id, product_id, variant_id, sku_snapshot, product_name_snapshot,
				 specification_snapshot, brand_name_snapshot, image_url_snapshot, unit_price_snapshot, quantity)
				VALUES (9406001, 'W406-O-S1', 'P001', 'V001', 'SKU', 'W406 Tent', 'spec', 'Brand', '/img.jpg', 1000.00, 1),
				       (9406002, 'W406-O-S2', 'P001', 'V001', 'SKU', 'W406 Tent', 'spec', 'Brand', '/img.jpg', 500.00, 1)
				""");

		seedBookingRentalCategoryChain();
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
		jdbc.update("""
				INSERT INTO booking_selected_rentals (id, booking_id, rental_listing_id, rental_sku_variant_id,
				 sku_snapshot, name_snapshot, specification_snapshot, price_weekday_snapshot, price_holiday_snapshot,
				 discount_snapshot, quantity)
				VALUES (9406101, 'W406-B-P1', 'W406-RL', 'W406-RSV', 'W406-SKU', 'W406 Chair', 'spec',
				 100.00, 120.00, 0.00, 2)
				ON CONFLICT DO NOTHING
				""");
	}

	@AfterEach
	void tearDown() {
		cleanup();
	}

	@Test
	void shopSummaryAggregatesKpisAndTopProducts() throws Exception {
		long pendingShipment = jdbc.queryForObject(
				"SELECT count(*) FROM orders WHERE status = 'unshipped'", Long.class);

		mockMvc.perform(get("/api/admin/analytics/shop-summary")
					.header("Authorization", ANALYTICS_TOKEN)
					.param("from", "2099-06-01")
					.param("to", "2099-06-30"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.kpis.orderCount").value(4))
				.andExpect(jsonPath("$.data.kpis.pendingShipmentCount").value((int) pendingShipment))
				.andExpect(jsonPath("$.data.kpis.refundCount").value(1))
				.andExpect(jsonPath("$.data.kpis.soldQuantity").value(2))
				.andExpect(jsonPath("$.data.kpis.revenueTotal").value(1500))
				.andExpect(jsonPath("$.data.topProducts.length()").value(1))
				.andExpect(jsonPath("$.data.categoryBreakdown.length()").value(1))
				.andExpect(jsonPath("$.data.categoryBreakdown[0].label").value("W406 帳篷"))
				.andExpect(jsonPath("$.data.categoryBreakdown[0].value").value("1500.00"));
	}

	@Test
	void bookingSummaryAggregatesKpis() throws Exception {
		long pendingBookings = jdbc.queryForObject(
				"SELECT count(*) FROM bookings WHERE status = 'pending'", Long.class);

		mockMvc.perform(get("/api/admin/analytics/booking-summary")
					.header("Authorization", ANALYTICS_TOKEN)
					.param("from", "2099-06-01")
					.param("to", "2099-06-30"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.kpis.periodBookingCount").value(3))
				.andExpect(jsonPath("$.data.kpis.pendingCount").value((int) pendingBookings))
				.andExpect(jsonPath("$.data.kpis.cancelledCount").value(1))
				.andExpect(jsonPath("$.data.kpis.revenueTotal").value(1000))
				.andExpect(jsonPath("$.data.kpis.rentalAmount").value(200))
				.andExpect(jsonPath("$.data.categoryBreakdown.length()").value(1))
				.andExpect(jsonPath("$.data.categoryBreakdown[0].label").value("W406 桌椅"))
				.andExpect(jsonPath("$.data.categoryBreakdown[0].value").value("2"));
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
		jdbc.update("DELETE FROM booking_selected_rentals WHERE booking_id LIKE 'W406-%'");
		jdbc.update("DELETE FROM order_items WHERE order_id LIKE 'W406-%'");
		jdbc.update("DELETE FROM orders WHERE id LIKE 'W406-%'");
		jdbc.update("DELETE FROM bookings WHERE id LIKE 'W406-%'");
		jdbc.update("DELETE FROM rental_listings WHERE id LIKE 'W406-%'");
		jdbc.update("DELETE FROM rental_sku_variants WHERE id LIKE 'W406-%'");
		jdbc.update("DELETE FROM rental_skus WHERE id LIKE 'W406-%'");
		jdbc.update("DELETE FROM products WHERE id = 'P001' AND item_id = 'EI-W406'");
		jdbc.update("DELETE FROM equipment_items WHERE id = 'EI-W406'");
		jdbc.update("DELETE FROM product_categories WHERE id IN (940601, 940602)");
		jdbc.update("DELETE FROM admin_user_permissions WHERE admin_user_id IN ('W406-ANALYTICS', 'W406-NOPERM')");
		jdbc.update("DELETE FROM admin_users WHERE id IN ('W406-ANALYTICS', 'W406-NOPERM')");
		jdbc.query("SELECT soft_delete_customer('W406-CUST')", resultSet -> {
		});
	}

	private void seedShopCategoryChain() {
		jdbc.update("""
				INSERT INTO product_categories (id, code, name, sort_order)
				VALUES (940601, 'w406-tent', 'W406 帳篷', 1)
				ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
				""");
		jdbc.update("""
				INSERT INTO equipment_items (id, category_id, name, description, active)
				VALUES ('EI-W406', 940601, 'W406 Tent Item', 'desc', true)
				ON CONFLICT (id) DO UPDATE SET category_id = EXCLUDED.category_id
				""");
		jdbc.update("""
				INSERT INTO products (id, item_id, status)
				VALUES ('P001', 'EI-W406', 'active')
				ON CONFLICT (id) DO UPDATE SET item_id = EXCLUDED.item_id
				""");
	}

	private void seedBookingRentalCategoryChain() {
		jdbc.update("""
				INSERT INTO product_categories (id, code, name, sort_order)
				VALUES (940602, 'w406-chair', 'W406 桌椅', 2)
				ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
				""");
		jdbc.update("""
				INSERT INTO equipment_items (id, category_id, name, description, active)
				VALUES ('EI-W406-R', 940602, 'W406 Chair Item', 'desc', true)
				ON CONFLICT (id) DO UPDATE SET category_id = EXCLUDED.category_id
				""");
		jdbc.update("""
				INSERT INTO rental_skus (id, item_id, status)
				VALUES ('W406-RS', 'EI-W406-R', 'active')
				ON CONFLICT (id) DO UPDATE SET item_id = EXCLUDED.item_id
				""");
		jdbc.update("""
				INSERT INTO rental_sku_variants (id, rental_sku_id, sku, specification, status)
				VALUES ('W406-RSV', 'W406-RS', 'W406-SKU', 'spec', 'active')
				ON CONFLICT (id) DO UPDATE SET rental_sku_id = EXCLUDED.rental_sku_id
				""");
		jdbc.update("""
				INSERT INTO rental_listings (id, campground_id, rental_sku_variant_id,
				 price_per_day_weekday, price_per_day_holiday, discount, active)
				VALUES ('W406-RL', 'C002', 'W406-RSV', 100.00, 120.00, 0.00, true)
				ON CONFLICT (id) DO NOTHING
				""");
	}
}
