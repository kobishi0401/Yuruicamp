package com.yuruicamp.backend.booking.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import com.yuruicamp.backend.booking.api.BookingAvailabilityRequest;
import com.yuruicamp.backend.booking.api.BookingAvailabilityZoneRequest;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

// 使用真正 PostgreSQL 驗證 E-6 取消、逾時釋放、冪等與付款鎖競爭。
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_BACKEND_IT", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class BookingLifecycleIntegrationTest {

	private static final String CUSTOMER_A = "C-BOOKING-E6-A";
	private static final String CUSTOMER_B = "C-BOOKING-E6-B";
	private static final String FIREBASE_A = "booking-e6-a";
	private static final String EMAIL_A = "booking-e6-a@example.invalid";
	private static final String CAMPGROUND_ID = "C-BOOKING-E6-IT";
	private static final String ZONE_ID = "Z-BOOKING-E6-IT";
	private static final long CATEGORY_ID = 990601L;
	private static final String ITEM_ID = "I-BOOKING-E6";
	private static final String RENTAL_SKU_ID = "RS-BOOKING-E6";
	private static final String VARIANT_ID = "RSV-BOOKING-E6";
	private static final String LISTING_ID = "RL-BOOKING-E6";
	private static final String LOCATION_ID = "L-BOOKING-E6";

	@Autowired
	private BookingLifecycleService lifecycleService;

	@Autowired
	private BookingPublicService bookingPublicService;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private PlatformTransactionManager transactionManager;

	private LocalDate checkIn;
	private LocalDate checkOut;
	private PolicySnapshot originalPolicy;
	private List<String> originalOccupyingStatuses;

	@BeforeAll
	void rememberBookingPolicy() {
		originalPolicy = jdbcTemplate.query("""
				select booking_window_days, advance_days, max_nights,
				       timezone, date_boundary_hour, low_availability_threshold
				from booking_policies
				where id = 1
				""", (rs, rowNum) -> new PolicySnapshot(
				rs.getInt("booking_window_days"),
				rs.getInt("advance_days"),
				rs.getInt("max_nights"),
				rs.getString("timezone"),
				rs.getInt("date_boundary_hour"),
				rs.getInt("low_availability_threshold")))
				.stream()
				.findFirst()
				.orElse(null);
		originalOccupyingStatuses = jdbcTemplate.queryForList("""
				select status::text
				from booking_policy_occupying_statuses
				where policy_id = 1
				order by status::text
				""", String.class);
	}

	@BeforeEach
	void prepareDatabase() {
		removeTestData();
		checkIn = LocalDate.now().plusDays(10);
		checkOut = checkIn.plusDays(2);
		insertCustomer(CUSTOMER_A, EMAIL_A, FIREBASE_A);
		insertCustomer(CUSTOMER_B, "booking-e6-b@example.invalid", "booking-e6-b");
		insertReferenceData();
	}

	@AfterEach
	void cleanDatabase() {
		removeTestData();
	}

	@AfterAll
	void restoreBookingPolicy() {
		jdbcTemplate.update("delete from booking_policy_occupying_statuses where policy_id = 1");
		if (originalPolicy == null) {
			jdbcTemplate.update("delete from booking_policies where id = 1");
			return;
		}

		jdbcTemplate.update("""
				update booking_policies
				set booking_window_days = ?, advance_days = ?, max_nights = ?,
				    timezone = ?, date_boundary_hour = ?, low_availability_threshold = ?,
				    updated_at = now()
				where id = 1
				""",
				originalPolicy.bookingWindowDays(),
				originalPolicy.advanceDays(),
				originalPolicy.maxNights(),
				originalPolicy.timezone(),
				originalPolicy.dateBoundaryHour(),
				originalPolicy.lowAvailabilityThreshold());
		originalOccupyingStatuses.forEach(status -> jdbcTemplate.update("""
				insert into booking_policy_occupying_statuses (policy_id, status)
				values (1, ?::booking_status)
				""", status));
	}

	@Test
	void customerCancelReleasesRentalAndRepeatedCallIsIdempotent() throws Exception {
		String bookingId = "B-BOOKING-E6-CANCEL";
		insertBookingWithRental(bookingId, CUSTOMER_A, "pending", "unpaid", Instant.now().plusSeconds(600));

		mockMvc.perform(post("/api/booking/checkout/sessions/{id}/cancel", bookingId)
					.header("Authorization", bearerA()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("cancelled"))
				.andExpect(jsonPath("$.data.paymentStatus").value("unpaid"))
				.andExpect(jsonPath("$.data.checkoutStep").value("closed"));

		mockMvc.perform(post("/api/booking/checkout/sessions/{id}/cancel", bookingId)
					.header("Authorization", bearerA()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("cancelled"));

		assertThat(bookingStatus(bookingId)).isEqualTo("cancelled");
		assertThat(reservationStatus(bookingId)).isEqualTo("released");
		assertThat(reservationReleasedAt(bookingId)).isNotNull();
		assertThat(cancelledHistoryCount(bookingId)).isEqualTo(1);
	}

	@Test
	void anotherMemberCannotCancelBooking() throws Exception {
		String bookingId = "B-BOOKING-E6-OWNER";
		insertBookingWithRental(bookingId, CUSTOMER_B, "pending", "unpaid", Instant.now().plusSeconds(600));

		mockMvc.perform(post("/api/booking/checkout/sessions/{id}/cancel", bookingId)
					.header("Authorization", bearerA()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("NOT_FOUND"));

		assertThat(bookingStatus(bookingId)).isEqualTo("pending");
		assertThat(reservationStatus(bookingId)).isEqualTo("active");
	}

	@Test
	void expirationRestoresZoneAndReleasesRentalOnlyOnce() {
		String bookingId = "B-BOOKING-E6-DUE";
		Instant now = Instant.now();
		insertBookingWithRental(bookingId, CUSTOMER_A, "pending", "unpaid", now.minusSeconds(1));

		assertThat(availability()).isFalse();
		assertThat(lifecycleService.expireDueCheckouts(now)).isEqualTo(1);

		assertThat(availability()).isTrue();
		assertThat(bookingStatus(bookingId)).isEqualTo("cancelled");
		assertThat(reservationStatus(bookingId)).isEqualTo("released");
		assertThat(cancelledHistoryCount(bookingId)).isEqualTo(1);
		assertThat(lifecycleService.expireDueCheckouts(now.plusSeconds(60))).isZero();
		assertThat(cancelledHistoryCount(bookingId)).isEqualTo(1);
	}

	@Test
	void futureConfirmedAndCancelledBookingsAreIgnored() {
		Instant now = Instant.now();
		insertBookingWithRental(
				"B-BOOKING-E6-FUTURE",
				CUSTOMER_A,
				"pending",
				"unpaid",
				now.plusSeconds(60));
		insertBookingWithRental(
				"B-BOOKING-E6-CONFIRM",
				CUSTOMER_A,
				"confirmed",
				"paid",
				now.minusSeconds(60));
		insertBookingWithRental(
				"B-BOOKING-E6-DONE",
				CUSTOMER_A,
				"cancelled",
				"unpaid",
				now.minusSeconds(60));

		assertThat(lifecycleService.expireDueCheckouts(now)).isZero();
		assertThat(bookingStatus("B-BOOKING-E6-FUTURE")).isEqualTo("pending");
		assertThat(bookingStatus("B-BOOKING-E6-CONFIRM")).isEqualTo("confirmed");
		assertThat(cancelledHistoryCount("B-BOOKING-E6-DONE")).isEqualTo(1);
	}

	@Test
	void schedulerProcessesDueBooking() {
		String bookingId = "B-BOOKING-E6-SCHEDULE";
		insertBookingWithRental(bookingId, CUSTOMER_A, "pending", "unpaid", Instant.now().minusSeconds(5));

		lifecycleService.expireDueCheckouts(Instant.now());

		assertThat(bookingStatus(bookingId)).isEqualTo("cancelled");
		assertThat(reservationStatus(bookingId)).isEqualTo("released");
	}

	@Test
	void paymentLockWinningRacePreventsCancellation() throws Exception {
		String bookingId = "B-BOOKING-E6-RACE";
		insertBookingWithRental(bookingId, CUSTOMER_A, "pending", "unpaid", Instant.now().plusSeconds(600));
		TransactionTemplate transaction = new TransactionTemplate(transactionManager);
		CountDownLatch paymentLocked = new CountDownLatch(1);
		CountDownLatch allowPaymentCommit = new CountDownLatch(1);

		try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
			Future<Void> payment = executor.submit(() -> {
				transaction.executeWithoutResult(status -> {
					jdbcTemplate.queryForObject("""
							select status::text
							from bookings
							where id = ?
							for update
							""", String.class, bookingId);
					paymentLocked.countDown();
					await(allowPaymentCommit);
					jdbcTemplate.update("""
							update bookings
							set status = 'confirmed', payment_status = 'paid',
							    paid_at = now(), updated_at = now()
							where id = ?
							""", bookingId);
				});
				return null;
			});
			assertThat(paymentLocked.await(5, TimeUnit.SECONDS)).isTrue();

			Future<Void> cancellation = executor.submit(() -> {
				lifecycleService.cancel(CUSTOMER_A, bookingId);
				return null;
			});
			allowPaymentCommit.countDown();
			payment.get(10, TimeUnit.SECONDS);

			assertThatThrownBy(() -> getFuture(cancellation))
					.isInstanceOf(BusinessException.class)
					.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
							.isEqualTo(ErrorCode.CONFLICT));
		}

		assertThat(bookingStatus(bookingId)).isEqualTo("confirmed");
		assertThat(reservationStatus(bookingId)).isEqualTo("active");
		assertThat(cancelledHistoryCount(bookingId)).isZero();
	}

	private boolean availability() {
		return bookingPublicService.checkAvailability(new BookingAvailabilityRequest(
				CAMPGROUND_ID,
				checkIn.toString(),
				checkOut.toString(),
				List.of(new BookingAvailabilityZoneRequest(ZONE_ID, 1)),
				List.of()))
				.available();
	}

	private String bearerA() {
		return "Bearer dev:" + FIREBASE_A + ":" + EMAIL_A + ":google:Tester";
	}

	private void insertBookingWithRental(
			String bookingId,
			String customerId,
			String status,
			String paymentStatus,
			Instant expiresAt) {
		jdbcTemplate.update("""
				insert into bookings (
				    id, customer_id, campground_id, campground_name_snapshot,
				    region_snapshot, check_in, check_out, guest_count,
				    weekday_count, holiday_count, zone_total, rental_total,
				    applied_discount, final_amount, payment_method, payment_status,
				    paid_at, checkout_expires_at, status, created_at, updated_at
				)
				values (?, ?, ?, 'E6 測試營區', '測試區域', ?, ?, 2,
				        2, 0, 2000.00, 200.00, 0.00, 2200.00,
				        'ecpay-credit', ?::payment_status,
				        case when ? = 'paid' then now() else null end,
				        ?, ?::booking_status, now(), now())
				""",
				bookingId,
				customerId,
				CAMPGROUND_ID,
				checkIn,
				checkOut,
				paymentStatus,
				paymentStatus,
				java.sql.Timestamp.from(expiresAt),
				status);
		jdbcTemplate.update("""
				insert into booking_selected_zones (
				    booking_id, zone_id, zone_type_snapshot,
				    price_weekday_snapshot, price_holiday_snapshot, quantity
				)
				values (?, ?, '草地區', 1000.00, 1500.00, 1)
				""", bookingId, ZONE_ID);
		Long selectedRentalId = jdbcTemplate.queryForObject("""
				insert into booking_selected_rentals (
				    booking_id, rental_listing_id, rental_sku_variant_id,
				    sku_snapshot, name_snapshot, specification_snapshot,
				    price_weekday_snapshot, price_holiday_snapshot,
				    discount_snapshot, quantity
				)
				values (?, ?, ?, 'RENTAL-E6', 'E6 測試桌椅', '單人組',
				        100.00, 150.00, 0.00, 1)
				returning id
				""", Long.class, bookingId, LISTING_ID, VARIANT_ID);
		jdbcTemplate.update("""
				insert into rental_stock_reservations (
				    booking_selected_rental_id, rental_sku_variant_id, location_id,
				    check_in, check_out, quantity, status,
				    idempotency_key, reserved_at, released_at, inventory_domain
				)
				values (?, ?, ?, ?, ?, 1, ?, ?, now(),
				        case when ? = 'released' then now() else null end, 'rental')
				""",
				selectedRentalId,
				VARIANT_ID,
				LOCATION_ID,
				checkIn,
				checkOut,
				"cancelled".equals(status) ? "released" : "active",
				bookingId + ":rental",
				"cancelled".equals(status) ? "released" : "active");
		jdbcTemplate.update("""
				insert into booking_status_history (booking_id, status, occurred_at, actor_id, note)
				values (?, ?::booking_status, now(), null, 'E6 fixture')
				""", bookingId, status);
	}

	private void insertReferenceData() {
		jdbcTemplate.update("""
				insert into campgrounds (id, name, region, description, active)
				values (?, 'E6 測試營區', '測試區域', 'Booking lifecycle 測試', true)
				""", CAMPGROUND_ID);
		jdbcTemplate.update("""
				insert into campground_zones (
				    id, campground_id, type, capacity_per_site,
				    price_weekday, price_holiday, total_sites, active
				)
				values (?, ?, '草地區', 4, 1000.00, 1500.00, 1, true)
				""", ZONE_ID, CAMPGROUND_ID);
		jdbcTemplate.update("""
				insert into booking_policies (
				    id, booking_window_days, advance_days, max_nights,
				    timezone, date_boundary_hour, low_availability_threshold
				)
				values (1, 90, 1, 7, 'Asia/Taipei', 0, 20)
				on conflict (id) do update set
				    booking_window_days = excluded.booking_window_days,
				    advance_days = excluded.advance_days,
				    max_nights = excluded.max_nights,
				    timezone = excluded.timezone,
				    date_boundary_hour = excluded.date_boundary_hour,
				    low_availability_threshold = excluded.low_availability_threshold
				""");
		jdbcTemplate.update("delete from booking_policy_occupying_statuses where policy_id = 1");
		jdbcTemplate.update("""
				insert into booking_policy_occupying_statuses (policy_id, status)
				values (1, 'pending'), (1, 'confirmed')
				""");
		jdbcTemplate.update("""
				insert into product_categories (id, code, name, sort_order)
				values (?, 'booking-e6-it', 'Booking E6 測試分類', 992)
				""", CATEGORY_ID);
		jdbcTemplate.update("""
				insert into equipment_items (id, category_id, name, description, active)
				values (?, ?, 'E6 測試桌椅', 'Booking lifecycle 測試', true)
				""", ITEM_ID, CATEGORY_ID);
		jdbcTemplate.update("insert into rental_skus (id, item_id, status) values (?, ?, 'active')",
				RENTAL_SKU_ID, ITEM_ID);
		jdbcTemplate.update("""
				insert into rental_sku_variants (
				    id, rental_sku_id, sku, color, size, specification, status
				)
				values (?, ?, 'RENTAL-E6', null, null, '單人組', 'active')
				""", VARIANT_ID, RENTAL_SKU_ID);
		jdbcTemplate.update("""
				insert into inventory_locations (
				    id, code, inventory_domain, type, branch_id, name, active
				)
				values (?, 'BOOKING-E6', 'rental', 'campground', null, 'E6 租借庫位', true)
				""", LOCATION_ID);
		jdbcTemplate.update("""
				insert into campground_rental_locations (campground_id, location_id)
				values (?, ?)
				""", CAMPGROUND_ID, LOCATION_ID);
		jdbcTemplate.update("""
				insert into rental_listings (
				    id, campground_id, rental_sku_variant_id,
				    price_per_day_weekday, price_per_day_holiday,
				    discount, description, active
				)
				values (?, ?, ?, 100.00, 150.00, 0.00, 'E6 listing', true)
				""", LISTING_ID, CAMPGROUND_ID, VARIANT_ID);
	}

	private void insertCustomer(String customerId, String email, String firebaseUid) {
		jdbcTemplate.update("""
				insert into customers (
				    id, name, phone, email, registered_at, points,
				    first_purchase_used, auth_provider, firebase_uid,
				    created_at, updated_at, status
				)
				values (?, 'Booking E6 Tester', '0912345678', ?, now(), 0,
				        false, 'google', ?, now(), now(), 'active')
				on conflict (id) do update set
				    email = excluded.email,
				    firebase_uid = excluded.firebase_uid,
				    updated_at = now()
				""", customerId, email, firebaseUid);
		jdbcTemplate.queryForObject("select reactivate_customer(?)", Boolean.class, customerId);
	}

	private String bookingStatus(String bookingId) {
		return jdbcTemplate.queryForObject(
				"select status::text from bookings where id = ?",
				String.class,
				bookingId);
	}

	private String reservationStatus(String bookingId) {
		return jdbcTemplate.queryForObject("""
				select reservation.status
				from rental_stock_reservations reservation
				join booking_selected_rentals selected
				  on selected.id = reservation.booking_selected_rental_id
				where selected.booking_id = ?
				""", String.class, bookingId);
	}

	private Instant reservationReleasedAt(String bookingId) {
		java.sql.Timestamp value = jdbcTemplate.queryForObject("""
				select reservation.released_at
				from rental_stock_reservations reservation
				join booking_selected_rentals selected
				  on selected.id = reservation.booking_selected_rental_id
				where selected.booking_id = ?
				""", java.sql.Timestamp.class, bookingId);

		return value == null ? null : value.toInstant();
	}

	private int cancelledHistoryCount(String bookingId) {
		Integer count = jdbcTemplate.queryForObject("""
				select count(*)
				from booking_status_history
				where booking_id = ? and status = 'cancelled'
				""", Integer.class, bookingId);

		return count == null ? 0 : count;
	}

	private void removeTestData() {
		jdbcTemplate.update("""
				delete from rental_stock_reservations reservation
				using booking_selected_rentals selected
				where selected.id = reservation.booking_selected_rental_id
				  and selected.booking_id like 'B-BOOKING-E6-%'
				""");
		jdbcTemplate.update("delete from bookings where id like 'B-BOOKING-E6-%'");
		jdbcTemplate.update("delete from rental_listings where id = ?", LISTING_ID);
		jdbcTemplate.update("delete from campground_rental_locations where campground_id = ?", CAMPGROUND_ID);
		jdbcTemplate.update("delete from campground_zones where id = ?", ZONE_ID);
		jdbcTemplate.update("delete from campgrounds where id = ?", CAMPGROUND_ID);
		jdbcTemplate.update("delete from inventory_locations where id = ?", LOCATION_ID);
		jdbcTemplate.update("delete from rental_sku_variants where id = ?", VARIANT_ID);
		jdbcTemplate.update("delete from rental_skus where id = ?", RENTAL_SKU_ID);
		jdbcTemplate.update("delete from equipment_items where id = ?", ITEM_ID);
		jdbcTemplate.update("delete from product_categories where id = ?", CATEGORY_ID);
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

	private static void await(CountDownLatch latch) {
		try {
			if (!latch.await(5, TimeUnit.SECONDS)) {
				throw new IllegalStateException("Timed out waiting for E-6 race test latch");
			}
		} catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException("E-6 race test was interrupted", ex);
		}
	}

	private static void getFuture(Future<Void> future) throws Throwable {
		try {
			future.get(10, TimeUnit.SECONDS);
		} catch (ExecutionException ex) {
			throw ex.getCause();
		}
	}

	private record PolicySnapshot(
			int bookingWindowDays,
			int advanceDays,
			int maxNights,
			String timezone,
			int dateBoundaryHour,
			int lowAvailabilityThreshold) {
	}
}
