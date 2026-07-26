package com.yuruicamp.backend.booking.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import com.yuruicamp.backend.booking.api.BookingCheckoutCreateRequest;
import com.yuruicamp.backend.booking.api.BookingCheckoutSessionResponse;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

// 使用真正 PostgreSQL 驗證 E-3 的鎖位、冪等、價格快照與防超賣。
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_BACKEND_IT", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class BookingCheckoutIntegrationTest {

	private static final String CAMPGROUND_ID = "C-BOOKING-E3-IT";
	private static final String ZONE_A = "Z-BOOKING-E3-A";
	private static final String ZONE_B = "Z-BOOKING-E3-B";
	private static final String CUSTOMER_A = "C-BOOKING-E3-A";
	private static final String CUSTOMER_B = "C-BOOKING-E3-B";
	private static final String FIREBASE_A = "booking-e3-a";
	private static final String EMAIL_A = "booking-e3-a@example.invalid";

	@Autowired
	private BookingCheckoutService service;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private MockMvc mockMvc;

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

		checkIn = findTwoUnlistedCalendarDates();
		checkOut = checkIn.plusDays(2);
		insertCustomer(CUSTOMER_A, EMAIL_A, FIREBASE_A);
		insertCustomer(CUSTOMER_B, "booking-e3-b@example.invalid", "booking-e3-b");

		jdbcTemplate.update("""
				insert into campgrounds (id, name, region, description, active)
				values (?, 'E3 測試營區', '測試區域', 'Booking Checkout 整合測試', true)
				""", CAMPGROUND_ID);
		jdbcTemplate.update("""
				insert into campground_zones (
				    id, campground_id, type, capacity_per_site,
				    price_weekday, price_holiday, total_sites, active
				)
				values (?, ?, '草地區', 4, 1000.00, 1500.00, 5, true),
				       (?, ?, '森林區', 4, 800.00, 1200.00, 5, true)
				""", ZONE_A, CAMPGROUND_ID, ZONE_B, CAMPGROUND_ID);

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
				values (1, 'pending'::booking_status), (1, 'confirmed'::booking_status)
				""");

		jdbcTemplate.update("""
				insert into calendar_dates (
				    calendar_date, is_holiday, holiday_name, source_version, effective_at
				)
				values (?, true, 'E3 測試假日', 'booking-e3-it', now())
				on conflict (calendar_date) do update set
				    is_holiday = excluded.is_holiday,
				    holiday_name = excluded.holiday_name,
				    source_version = excluded.source_version,
				    effective_at = excluded.effective_at,
				    updated_at = now()
				""", checkIn.plusDays(1));
	}

	@AfterEach
	void cleanDatabase() {
		removeTestData();
	}

	/** B3：create 前無 booking；create 後才 pending + checkout_expires_at。 */
	@Test
	void noBookingBeforeCheckoutCreateThenHoldStartsOnCreate() {
		assertThat(count("bookings")).isZero();
		assertThat(count("booking_selected_zones")).isZero();

		BookingCheckoutSessionResponse response = service.create(
				CUSTOMER_A,
				request("b3-hold-" + UUID.randomUUID(), List.of(zone(ZONE_A, 1))));

		assertThat(response.checkoutExpiresAt()).isNotNull();
		assertThat(count("bookings")).isEqualTo(1);
		assertThat(count("booking_selected_zones")).isEqualTo(1);
		var expiresAt = jdbcTemplate.queryForObject(
				"select checkout_expires_at from bookings where id = ?",
				java.sql.Timestamp.class,
				response.bookingId());
		assertThat(expiresAt).isNotNull();
		assertThat(expiresAt.toInstant()).isAfter(Instant.now());
	}

	/** displayNo 連續建預約唯一遞增。 */
	@Test
	void sequentialCreatesAssignUniqueIncrementingDisplayNos() {
		BookingCheckoutSessionResponse first = service.create(
				CUSTOMER_A,
				request("display-no-1-" + UUID.randomUUID(), List.of(zone(ZONE_A, 1))));
		BookingCheckoutSessionResponse second = service.create(
				CUSTOMER_A,
				request("display-no-2-" + UUID.randomUUID(), List.of(zone(ZONE_B, 1))));

		assertThat(first.displayNo()).matches("BK-\\d{4}");
		assertThat(second.displayNo()).matches("BK-\\d{4}");
		assertThat(first.displayNo()).isNotEqualTo(second.displayNo());
		assertThat(parseDisplaySequence(second.displayNo(), "BK"))
				.isGreaterThan(parseDisplaySequence(first.displayNo(), "BK"));

		assertThat(jdbcTemplate.queryForObject(
				"select display_no from bookings where id = ?",
				String.class,
				first.bookingId())).isEqualTo(first.displayNo());
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
	void memberEndpointCreatesPendingBookingUsingDatabasePrice() throws Exception {
		Instant before = Instant.now();
		String body = """
				{
				  "campgroundId": "%s",
				  "checkIn": "%s",
				  "checkOut": "%s",
				  "guestCount": 3,
				  "zones": [{"zoneId": "%s", "quantity": 2}],
				  "rentals": [],
				  "couponClaimId": null,
				  "paymentMethod": "ecpay-credit",
				  "idempotencyKey": "swagger-%s",
				  "finalAmount": "1.00"
				}
				""".formatted(
				CAMPGROUND_ID,
				checkIn,
				checkOut,
				ZONE_A,
				UUID.randomUUID());

		mockMvc.perform(post("/api/booking/checkout/sessions")
					.header("Authorization", "Bearer dev:" + FIREBASE_A + ":" + EMAIL_A + ":google:Tester")
					.contentType(MediaType.APPLICATION_JSON)
					.content(body))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("pending"))
				.andExpect(jsonPath("$.data.paymentStatus").value("unpaid"))
				.andExpect(jsonPath("$.data.checkoutStep").value("ready_to_pay"))
				.andExpect(jsonPath("$.data.weekdayCount").value(1))
				.andExpect(jsonPath("$.data.holidayCount").value(1))
				.andExpect(jsonPath("$.data.pricing.zoneTotal").value("5000.00"))
				.andExpect(jsonPath("$.data.pricing.finalAmount").value("5000.00"))
				.andExpect(jsonPath("$.data.rentals.length()").value(0));

		var booking = jdbcTemplate.queryForMap("""
				select status::text, payment_status::text, checkout_expires_at,
				       zone_total, final_amount
				from bookings
				where customer_id = ?
				""", CUSTOMER_A);
		Instant expiresAt = ((java.sql.Timestamp) booking.get("checkout_expires_at")).toInstant();

		assertThat(booking.get("status")).isEqualTo("pending");
		assertThat(booking.get("payment_status")).isEqualTo("unpaid");
		assertThat(booking.get("zone_total")).isEqualTo(new BigDecimal("5000.00"));
		assertThat(booking.get("final_amount")).isEqualTo(new BigDecimal("5000.00"));
		assertThat(Duration.between(before, expiresAt).toMinutes()).isBetween(14L, 15L);
		assertThat(count("booking_selected_zones")).isEqualTo(1);
		assertThat(count("booking_status_history")).isEqualTo(1);
	}

	@Test
	void endpointRequiresAuthenticatedCustomer() throws Exception {
		mockMvc.perform(post("/api/booking/checkout/sessions")
					.contentType(MediaType.APPLICATION_JSON)
					.content("{}"))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void sameIdempotencyKeyAndNormalizedPayloadReplaysBooking() {
		String key = "replay-" + UUID.randomUUID();
		BookingCheckoutCreateRequest first = request(
				key,
				List.of(zone(ZONE_B, 1), zone(ZONE_A, 1)));
		BookingCheckoutCreateRequest reordered = request(
				key,
				List.of(zone(ZONE_A, 1), zone(ZONE_B, 1)));

		BookingCheckoutSessionResponse created = service.create(CUSTOMER_A, first);
		BookingCheckoutSessionResponse replay = service.create(CUSTOMER_A, reordered);

		assertThat(replay.bookingId()).isEqualTo(created.bookingId());
		assertThat(count("bookings")).isEqualTo(1);
		assertThat(count("booking_status_history")).isEqualTo(1);
	}

	@Test
	void sameIdempotencyKeyWithDifferentPayloadReturnsConflict() {
		String key = "conflict-" + UUID.randomUUID();
		service.create(CUSTOMER_A, request(key, List.of(zone(ZONE_A, 1))));

		assertThatThrownBy(() -> service.create(
				CUSTOMER_A,
				request(key, List.of(zone(ZONE_A, 2)))))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ErrorCode.IDEMPOTENCY_CONFLICT));
	}

	@Test
	void bookingRejectsCodAndCouponBeforeDeferredLinesExist() {
		BookingCheckoutCreateRequest cod = new BookingCheckoutCreateRequest(
				CAMPGROUND_ID,
				checkIn.toString(),
				checkOut.toString(),
				2,
				List.of(zone(ZONE_A, 1)),
				List.of(),
				null,
				"cod",
				"cod-" + UUID.randomUUID());
		BookingCheckoutCreateRequest coupon = new BookingCheckoutCreateRequest(
				CAMPGROUND_ID,
				checkIn.toString(),
				checkOut.toString(),
				2,
				List.of(zone(ZONE_A, 1)),
				List.of(),
				1L,
				"ecpay-credit",
				"coupon-" + UUID.randomUUID());

		assertValidationError(cod);
		assertValidationError(coupon);
		assertThat(count("bookings")).isZero();
	}

	@Test
	void existingPendingBookingMakesCheckoutUnavailable() {
		service.create(CUSTOMER_A, request(
				"capacity-a-" + UUID.randomUUID(),
				List.of(zone(ZONE_A, 5))));

		assertThatThrownBy(() -> service.create(
				CUSTOMER_B,
				request("capacity-b-" + UUID.randomUUID(), List.of(zone(ZONE_A, 1)))))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ErrorCode.ZONE_UNAVAILABLE));
		assertThat(count("bookings")).isEqualTo(1);
	}

	@Test
	void concurrentOppositeZoneOrderCreatesOnlyOneBookingWithoutOverselling() throws Exception {
		jdbcTemplate.update(
				"update campground_zones set total_sites = 1 where id in (?, ?)",
				ZONE_A,
				ZONE_B);
		CountDownLatch ready = new CountDownLatch(2);
		CountDownLatch start = new CountDownLatch(1);
		ExecutorService executor = Executors.newFixedThreadPool(2);

		try {
			Future<BookingCheckoutSessionResponse> resultA = executor.submit(() -> {
				ready.countDown();
				start.await();
				return service.create(CUSTOMER_A, request(
						"race-a-" + UUID.randomUUID(),
						List.of(zone(ZONE_A, 1), zone(ZONE_B, 1))));
			});
			Future<BookingCheckoutSessionResponse> resultB = executor.submit(() -> {
				ready.countDown();
				start.await();
				return service.create(CUSTOMER_B, request(
						"race-b-" + UUID.randomUUID(),
						List.of(zone(ZONE_B, 1), zone(ZONE_A, 1))));
			});

			ready.await();
			start.countDown();

			int successes = completedSuccessfully(resultA) + completedSuccessfully(resultB);
			assertThat(successes).isEqualTo(1);
			assertUnavailableIfFailed(resultA);
			assertUnavailableIfFailed(resultB);
			assertThat(count("bookings")).isEqualTo(1);
			assertThat(count("booking_selected_zones")).isEqualTo(2);
		}
		finally {
			executor.shutdownNow();
		}
	}

	private BookingCheckoutCreateRequest request(
			String idempotencyKey,
			List<BookingCheckoutCreateRequest.Zone> zones) {
		return new BookingCheckoutCreateRequest(
				CAMPGROUND_ID,
				checkIn.toString(),
				checkOut.toString(),
				2,
				zones,
				List.of(),
				null,
				"ecpay-credit",
				idempotencyKey);
	}

	private BookingCheckoutCreateRequest.Zone zone(String zoneId, int quantity) {
		return new BookingCheckoutCreateRequest.Zone(zoneId, quantity);
	}

	private void assertValidationError(BookingCheckoutCreateRequest request) {
		assertThatThrownBy(() -> service.create(CUSTOMER_A, request))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ErrorCode.VALIDATION_ERROR));
	}

	private int completedSuccessfully(Future<BookingCheckoutSessionResponse> result) {
		try {
			return result.get() == null ? 0 : 1;
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			throw new AssertionError("等待 Booking Checkout 測試時被中斷", ex);
		}
		catch (ExecutionException ex) {
			return 0;
		}
	}

	private void assertUnavailableIfFailed(Future<BookingCheckoutSessionResponse> result) {
		try {
			result.get();
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			throw new AssertionError("等待 Booking Checkout 測試時被中斷", ex);
		}
		catch (ExecutionException ex) {
			assertThat(ex.getCause()).isInstanceOf(BusinessException.class);
			assertThat(((BusinessException) ex.getCause()).getErrorCode())
					.isEqualTo(ErrorCode.ZONE_UNAVAILABLE);
		}
	}

	private int count(String table) {
		String sql = switch (table) {
			case "bookings" -> "select count(*) from bookings where campground_id = ?";
			case "booking_selected_zones" -> """
					select count(*)
					from booking_selected_zones selected
					join bookings booking on booking.id = selected.booking_id
					where booking.campground_id = ?
					""";
			case "booking_status_history" -> """
					select count(*)
					from booking_status_history history
					join bookings booking on booking.id = history.booking_id
					where booking.campground_id = ?
					""";
			default -> throw new IllegalArgumentException("Unsupported test table: " + table);
		};

		return jdbcTemplate.queryForObject(sql, Integer.class, CAMPGROUND_ID);
	}

	// 選擇沒有既有日曆資料的日期，避免測試覆蓋開發者的假日設定。
	private LocalDate findTwoUnlistedCalendarDates() {
		LocalDate today = LocalDate.now(ZoneId.of("Asia/Taipei"));

		for (int offset = 10; offset <= 80; offset++) {
			LocalDate candidate = today.plusDays(offset);
			Integer rows = jdbcTemplate.queryForObject("""
					select count(*)
					from calendar_dates
					where calendar_date >= ? and calendar_date < ?
					""", Integer.class, candidate, candidate.plusDays(2));

			if (rows != null && rows == 0) {
				return candidate;
			}
		}

		throw new IllegalStateException("No free calendar range is available for Booking E-3 test");
	}

	private void insertCustomer(String customerId, String email, String firebaseUid) {
		jdbcTemplate.update("""
				insert into customers (
				    id, name, phone, email, registered_at, points,
				    first_purchase_used, auth_provider, firebase_uid,
				    created_at, updated_at, status
				)
				values (?, 'Booking E3 Tester', '0912345678', ?, now(), 0,
				        false, 'google', ?, now(), now(), 'active')
				on conflict (id) do update set
				    name = excluded.name,
				    phone = excluded.phone,
				    email = excluded.email,
				    firebase_uid = excluded.firebase_uid,
				    updated_at = now()
				""", customerId, email, firebaseUid);
		jdbcTemplate.queryForObject("select reactivate_customer(?)", Boolean.class, customerId);
	}

	// 測試資料使用專屬 ID，完成後只清除本測試擁有的資料。
	private void removeTestData() {
		jdbcTemplate.update("delete from bookings where campground_id = ?", CAMPGROUND_ID);
		jdbcTemplate.update("delete from campground_zones where campground_id = ?", CAMPGROUND_ID);
		jdbcTemplate.update("delete from campgrounds where id = ?", CAMPGROUND_ID);
		jdbcTemplate.update(
				"delete from calendar_dates where source_version = 'booking-e3-it'");
		jdbcTemplate.queryForObject("select soft_delete_customer(?)", Boolean.class, CUSTOMER_A);
		jdbcTemplate.queryForObject("select soft_delete_customer(?)", Boolean.class, CUSTOMER_B);
	}

	private record PolicySnapshot(
			int bookingWindowDays,
			int advanceDays,
			int maxNights,
			String timezone,
			int dateBoundaryHour,
			int lowAvailabilityThreshold) {
	}

	private static int parseDisplaySequence(String displayNo, String prefix) {
		return Integer.parseInt(displayNo.substring(prefix.length() + 1));
	}
}
