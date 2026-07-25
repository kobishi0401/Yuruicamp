package com.yuruicamp.backend.order.api;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
// 使用 PostgreSQL 驗證 Admin 訂單與預約履約狀態及歷程交易。
class AdminFulfillmentPostgreSqlIntegrationTest {

	private static final String TOKEN = "Bearer dev:uid-g2b-admin:g2b-admin@example.test:google:G2B Admin";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@BeforeEach
	void setUp() {
		cleanup();
		jdbc.update("INSERT INTO admin_permissions (code, section, action) VALUES ('orders.view','orders','view'),('orders.edit','orders','edit'),('bookings.view','bookings','view'),('bookings.edit','bookings','edit') ON CONFLICT DO NOTHING");
		jdbc.update("INSERT INTO admin_role_permissions (role, permission_code) VALUES ('admin','orders.view'),('admin','orders.edit'),('admin','bookings.view'),('admin','bookings.edit') ON CONFLICT DO NOTHING");
		jdbc.update("""
				INSERT INTO admin_users (id, name, email, role, active, firebase_uid)
				VALUES ('G2B-ADMIN','G2B Admin','g2b-admin@example.test','admin',true,'uid-g2b-admin')
				ON CONFLICT (id) DO UPDATE SET active=true, firebase_uid='uid-g2b-admin'
				""");
		jdbc.update("""
				INSERT INTO customers (id,name,email,registered_at,points,first_purchase_used,auth_provider,firebase_uid,status)
				VALUES ('G2B-CUSTOMER','G2B Customer','g2b-customer@example.test',now(),0,false,'google','uid-g2b-customer','active')
				ON CONFLICT (id) DO UPDATE SET status='active', deleted_at=null
				""");
		jdbc.update("""
				INSERT INTO orders (id,customer_id,buyer_name_snapshot,buyer_email_snapshot,recipient_name_snapshot,
				 shipping_address_snapshot,shipping_phone_snapshot,subtotal,shipping_fee,discount,total,payment_method,
				 payment_status,refund_status,status,placed_at,paid_at,created_at,updated_at)
				VALUES ('G2B-ORDER','G2B-CUSTOMER','Buyer','buyer@example.test','Recipient','Address','0900',100,0,0,100,
				 'ecpay-credit','paid','none','unshipped',now(),now(),now(),now())
				""");
		jdbc.update("""
				INSERT INTO bookings (id,customer_id,campground_id,campground_name_snapshot,region_snapshot,check_in,check_out,
				 guest_count,weekday_count,holiday_count,zone_total,rental_total,applied_discount,final_amount,payment_method,
				 payment_status,paid_at,status,created_at,updated_at)
				VALUES ('G2B-BOOKING','G2B-CUSTOMER','C002','Camp','北部',current_date-2,current_date-1,2,1,0,100,0,0,100,
				 'ecpay-credit','paid',now(),'pending',now(),now())
				""");
	}

	@AfterEach
	void tearDown() {
		cleanup();
	}

	@Test
	void orderShipAndCompleteWriteSingleHistoryPerTransition() throws Exception {
		mockMvc.perform(post("/api/admin/orders/G2B-ORDER/ship").header("Authorization", TOKEN))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("shipped"));
		mockMvc.perform(post("/api/admin/orders/G2B-ORDER/complete").header("Authorization", TOKEN))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("completed"));
		mockMvc.perform(get("/api/admin/orders/G2B-ORDER").header("Authorization", TOKEN))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.history.length()").value(2));
	}

	@Test
	void paidBookingCanBeConfirmedAndCompleted() throws Exception {
		mockMvc.perform(post("/api/admin/bookings/G2B-BOOKING/confirm").header("Authorization", TOKEN))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("confirmed"));
		mockMvc.perform(post("/api/admin/bookings/G2B-BOOKING/complete").header("Authorization", TOKEN))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("completed"));
	}

	@Test
	void paidUnshippedOrderCanBeCancelledWithStubRefund() throws Exception {
		jdbc.update("""
				INSERT INTO payment_notifications (
				  provider, merchant_trade_no, provider_trade_no, order_id, booking_id,
				  raw_payload, result, processed_at)
				VALUES ('ecpay','MTN-G2B-ORDER','TN1','G2B-ORDER',null,'{}'::jsonb,'success',now())
				""");

		mockMvc.perform(post("/api/admin/orders/G2B-ORDER/cancel")
						.header("Authorization", TOKEN)
						.contentType("application/json")
						.content("{\"note\":\"客服取消未出貨\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("cancelled"))
				.andExpect(jsonPath("$.data.paymentStatus").value("refunded"))
				.andExpect(jsonPath("$.data.refundStatus").value("refunded"));

		// 冪等
		mockMvc.perform(post("/api/admin/orders/G2B-ORDER/cancel").header("Authorization", TOKEN))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("cancelled"));
	}

	@Test
	void shippedOrderCannotBeCancelled() throws Exception {
		mockMvc.perform(post("/api/admin/orders/G2B-ORDER/ship").header("Authorization", TOKEN))
				.andExpect(status().isOk());
		mockMvc.perform(post("/api/admin/orders/G2B-ORDER/cancel").header("Authorization", TOKEN))
				.andExpect(status().isConflict());
	}

	@Test
	void paidBookingCanBeCancelledWithStubRefund() throws Exception {
		jdbc.update("""
				INSERT INTO payment_notifications (
				  provider, merchant_trade_no, provider_trade_no, order_id, booking_id,
				  raw_payload, result, processed_at)
				VALUES ('ecpay','MTN-G2B-BOOKING','TN2',null,'G2B-BOOKING','{}'::jsonb,'success',now())
				""");

		mockMvc.perform(post("/api/admin/bookings/G2B-BOOKING/cancel")
						.header("Authorization", TOKEN)
						.contentType("application/json")
						.content("{\"note\":\"預約取消\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("cancelled"))
				.andExpect(jsonPath("$.data.paymentStatus").value("refunded"));
	}

	@Test
	void internalNoteCanBeUpdatedAndClearedWithoutChangingStatus() throws Exception {
		mockMvc.perform(patch("/api/admin/orders/G2B-ORDER/internal-note")
						.header("Authorization", TOKEN)
						.contentType("application/json")
						.content("{\"internalNote\":\"已電聯客人\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.internalNote").value("已電聯客人"))
				.andExpect(jsonPath("$.data.status").value("unshipped"));
		mockMvc.perform(patch("/api/admin/orders/G2B-ORDER/internal-note")
						.header("Authorization", TOKEN)
						.contentType("application/json")
						.content("{\"internalNote\":\"  \"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.internalNote").value(nullValue()));
		mockMvc.perform(get("/api/admin/orders/G2B-ORDER").header("Authorization", TOKEN))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("unshipped"));

		mockMvc.perform(patch("/api/admin/bookings/G2B-BOOKING/internal-note")
						.header("Authorization", TOKEN)
						.contentType("application/json")
						.content("{\"internalNote\":\"現場備註\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.internalNote").value("現場備註"))
				.andExpect(jsonPath("$.data.status").value("pending"));
	}

	private void cleanup() {
		jdbc.update("DELETE FROM order_event_history WHERE order_id='G2B-ORDER'");
		jdbc.update("DELETE FROM order_status_history WHERE order_id='G2B-ORDER'");
		jdbc.update("DELETE FROM booking_status_history WHERE booking_id='G2B-BOOKING'");
		jdbc.update("DELETE FROM payment_notifications WHERE order_id='G2B-ORDER' OR booking_id='G2B-BOOKING'");
		jdbc.update("DELETE FROM orders WHERE id='G2B-ORDER'");
		jdbc.update("DELETE FROM bookings WHERE id='G2B-BOOKING'");
		jdbc.update("DELETE FROM admin_users WHERE id='G2B-ADMIN'");
		jdbc.query("SELECT soft_delete_customer('G2B-CUSTOMER')", resultSet -> {
		});
	}
}
