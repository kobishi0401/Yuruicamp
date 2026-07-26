package com.yuruicamp.backend.booking.api;

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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Commerce UX：後台預約明細 lineTotal、contact 快照、history 中文 label、displayNo。
 */
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_BACKEND_IT", matches = "true")
class AdminBookingPostgreSqlIntegrationTest {

	private static final String ADMIN_TOKEN = "Bearer dev:uid-g2b-admin:g2b-admin@example.test:google:G2B Admin";
	private static final String CUSTOMER_TOKEN = "Bearer dev:uid-adm-bk-it:adm-bk-it@example.invalid:google:AdmBkIt";
	private static final String BOOKING_ID = "B-ADM-BK-IT";
	private static final String CUSTOMER_ID = "C-ADM-BK-IT";
	private static final String ZONE_ID = "Z-ADM-BK-IT";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@BeforeEach
	void setUp() {
		cleanup();
		jdbc.update("""
				INSERT INTO admin_permissions (code, section, action)
				VALUES ('bookings.view','bookings','view'),('bookings.edit','bookings','edit')
				ON CONFLICT DO NOTHING
				""");
		jdbc.update("""
				INSERT INTO admin_role_permissions (role, permission_code)
				VALUES ('admin','bookings.view'),('admin','bookings.edit')
				ON CONFLICT DO NOTHING
				""");
		jdbc.update("""
				INSERT INTO admin_users (id, name, email, role, active, firebase_uid)
				VALUES ('G2B-ADMIN','G2B Admin','g2b-admin@example.test','admin',true,'uid-g2b-admin')
				ON CONFLICT (id) DO UPDATE SET active=true, firebase_uid='uid-g2b-admin'
				""");
		jdbc.update("""
				INSERT INTO customers (id,name,email,registered_at,points,first_purchase_used,auth_provider,firebase_uid,status)
				VALUES (?, 'Adm Bk IT', 'adm-bk-it@example.invalid', now(), 0, false, 'google', 'uid-adm-bk-it', 'active')
				ON CONFLICT (id) DO UPDATE SET status='active', deleted_at=null, firebase_uid='uid-adm-bk-it'
				""", CUSTOMER_ID);
		jdbc.update("""
				INSERT INTO campground_zones (
				    id, campground_id, type, capacity_per_site,
				    price_weekday, price_holiday, total_sites, active
				)
				VALUES (?, 'C002', '草地', 4, 500.00, 800.00, 5, true)
				ON CONFLICT (id) DO UPDATE SET active = true
				""", ZONE_ID);
		jdbc.update("""
				INSERT INTO bookings (
				    id, display_no, customer_id, campground_id, campground_name_snapshot, region_snapshot,
				    check_in, check_out, guest_count, weekday_count, holiday_count,
				    zone_total, rental_total, applied_discount, final_amount,
				    payment_method, payment_status, paid_at, status,
				    contact_name_snapshot, contact_phone_snapshot, contact_email_snapshot,
				    checkout_expires_at, created_at, updated_at
				)
				VALUES (?, 'BK-9001', ?, 'C002', 'Camp', '北部',
				        current_date + 7, current_date + 9, 2, 2, 0,
				        2000.00, 0.00, 0.00, 2000.00,
				        'ecpay-credit', 'paid', now(), 'pending',
				        '王小明', '0911222333', 'guest@example.test',
				        now() + interval '15 minutes', now(), now())
				""", BOOKING_ID, CUSTOMER_ID);
		jdbc.update("""
				INSERT INTO booking_selected_zones (
				    booking_id, zone_id, zone_type_snapshot,
				    price_weekday_snapshot, price_holiday_snapshot, quantity
				)
				VALUES (?, ?, '草地', 500.00, 800.00, 2)
				""", BOOKING_ID, ZONE_ID);
		jdbc.update("""
				INSERT INTO booking_status_history (booking_id, status, occurred_at, actor_id, note)
				VALUES (?, 'pending', now() - interval '1 hour', null, 'Booking checkout created')
				""", BOOKING_ID);
		jdbc.update("""
				INSERT INTO booking_status_history (booking_id, status, occurred_at, actor_id, note)
				VALUES (?, 'pending', now() - interval '30 minutes', null, 'ECPay notify: payment marked paid')
				""", BOOKING_ID);
	}

	@AfterEach
	void tearDown() {
		cleanup();
	}

	@Test
	void adminBookingDetailIncludesLineTotalContactLabelAndDisplayNo() throws Exception {
		mockMvc.perform(get("/api/admin/bookings/" + BOOKING_ID).header("Authorization", ADMIN_TOKEN))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.displayNo").value("BK-9001"))
				.andExpect(jsonPath("$.data.contact.name").value("王小明"))
				.andExpect(jsonPath("$.data.contact.phone").value("0911222333"))
				.andExpect(jsonPath("$.data.contact.email").value("guest@example.test"))
				.andExpect(jsonPath("$.data.zones[0].lineTotal").value("2000.00"))
				.andExpect(jsonPath("$.data.history[0].label").value("待確認"))
				.andExpect(jsonPath("$.data.history[1].label").value("已付款"));
	}

	@Test
	void bookingEcpayLaunchWritesContactSnapshot() throws Exception {
		jdbc.update("""
				UPDATE bookings
				SET payment_status = 'unpaid'::payment_status,
				    paid_at = null,
				    status = 'pending'::booking_status,
				    contact_name_snapshot = null,
				    contact_phone_snapshot = null,
				    contact_email_snapshot = null,
				    checkout_expires_at = now() + interval '15 minutes'
				WHERE id = ?
				""", BOOKING_ID);

		mockMvc.perform(post("/api/booking/checkout/sessions/{bookingId}/ecpay", BOOKING_ID)
						.header("Authorization", CUSTOMER_TOKEN)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "contact": {
								    "name": "陳小華",
								    "phone": "0988777666",
								    "email": "chen@example.test"
								  }
								}
								"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.bookingId").value(BOOKING_ID));

		String name = jdbc.queryForObject(
				"select contact_name_snapshot from bookings where id = ?", String.class, BOOKING_ID);
		String phone = jdbc.queryForObject(
				"select contact_phone_snapshot from bookings where id = ?", String.class, BOOKING_ID);
		String email = jdbc.queryForObject(
				"select contact_email_snapshot from bookings where id = ?", String.class, BOOKING_ID);

		org.assertj.core.api.Assertions.assertThat(name).isEqualTo("陳小華");
		org.assertj.core.api.Assertions.assertThat(phone).isEqualTo("0988777666");
		org.assertj.core.api.Assertions.assertThat(email).isEqualTo("chen@example.test");
	}

	private void cleanup() {
		jdbc.update("delete from booking_status_history where booking_id = ?", BOOKING_ID);
		jdbc.update("delete from booking_selected_zones where booking_id = ?", BOOKING_ID);
		jdbc.update("delete from bookings where id = ?", BOOKING_ID);
		jdbc.update("delete from campground_zones where id = ?", ZONE_ID);
		Integer customerRows = jdbc.queryForObject(
				"select count(*) from customers where id = ?", Integer.class, CUSTOMER_ID);
		if (customerRows != null && customerRows > 0) {
			jdbc.queryForObject("select soft_delete_customer(?)", Boolean.class, CUSTOMER_ID);
		}
	}
}
