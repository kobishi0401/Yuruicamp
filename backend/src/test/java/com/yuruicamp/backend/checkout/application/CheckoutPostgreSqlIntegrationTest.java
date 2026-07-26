package com.yuruicamp.backend.checkout.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import com.yuruicamp.backend.checkout.api.CheckoutCreateRequest;
import com.yuruicamp.backend.checkout.api.CheckoutSessionResponse;
import com.yuruicamp.backend.checkout.api.CheckoutUpdateRequest;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
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
 * 使用真正的 PostgreSQL 驗證 Checkout 建單、庫存保留與取消流程。
 */
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_BACKEND_IT", matches = "true")
class CheckoutPostgreSqlIntegrationTest {

	private static final String VARIANT_ID = "V-CHECKOUT-IT";
	private static final String LOCATION_ID = "L-CHECKOUT-IT";
	private static final String CUSTOMER_A = "C-CHECKOUT-IT-A";
	private static final String CUSTOMER_B = "C-CHECKOUT-IT-B";
	private static final BigDecimal DATABASE_PRICE = new BigDecimal("1234.56");

	@Autowired
	private CheckoutService checkoutService;

	@Autowired
	private CheckoutExpirationService expirationService;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private MockMvc mockMvc;

	@BeforeEach
	void prepareDatabase() {
		removeTestData();

		jdbcTemplate.update("""
				insert into product_variants (
				    id, product_id, sku, color, size, price, specification, status
				)
				values (?, 'P001', 'CHECKOUT-IT-SKU', '測試色', null, ?, '整合測試規格', 'active')
				on conflict (id) do update set
				    price = excluded.price,
				    status = excluded.status
				""", VARIANT_ID, DATABASE_PRICE);

		jdbcTemplate.update("""
				insert into inventory_locations (
				    id, code, inventory_domain, type, branch_id, name, active
				)
				values (?, 'CHECKOUT-IT', 'store', 'main', null, 'Checkout 整合測試倉', true)
				""", LOCATION_ID);

		jdbcTemplate.update("""
				insert into inventory_stocks (
				    location_id, variant_id, on_hand_quantity, inventory_domain
				)
				values (?, ?, 10, 'store')
				""", LOCATION_ID, VARIANT_ID);

		insertCustomer(CUSTOMER_A, "checkout-it-a@example.com", "checkout-it-a");
		insertCustomer(CUSTOMER_B, "checkout-it-b@example.com", "checkout-it-b");
	}

	@AfterEach
	void cleanDatabase() {
		removeTestData();
	}

	/** B3：進 checkout create 前無 active 保留；create 後才建保留並開始倒數。 */
	@Test
	void noReservationBeforeCheckoutCreateThenHoldStartsOnCreate() {
		assertThat(jdbcTemplate.queryForObject(
				"select count(*) from product_stock_reservations where variant_id = ? and status = 'active'",
				Integer.class,
				VARIANT_ID)).isZero();
		assertThat(jdbcTemplate.queryForObject(
				"select count(*) from orders where customer_id = ?",
				Integer.class,
				CUSTOMER_A)).isZero();

		CheckoutSessionResponse response = checkoutService.create(
				CUSTOMER_A,
				request("b3-hold-" + UUID.randomUUID(), 1));

		assertThat(response.checkoutExpiresAt()).isNotNull();
		assertThat(jdbcTemplate.queryForObject(
				"select count(*) from product_stock_reservations where variant_id = ? and status = 'active'",
				Integer.class,
				VARIANT_ID)).isEqualTo(1);
		var expiresAt = jdbcTemplate.queryForObject(
				"select checkout_expires_at from orders where id = ?",
				java.sql.Timestamp.class,
				response.orderId());
		assertThat(expiresAt).isNotNull();
		assertThat(expiresAt.toInstant()).isAfter(Instant.now());
	}

	/** displayNo 連續建單唯一遞增。 */
	@Test
	void sequentialCreatesAssignUniqueIncrementingDisplayNos() {
		CheckoutSessionResponse first = checkoutService.create(
				CUSTOMER_A,
				request("display-no-1-" + UUID.randomUUID(), 1));
		CheckoutSessionResponse second = checkoutService.create(
				CUSTOMER_A,
				request("display-no-2-" + UUID.randomUUID(), 1));

		assertThat(first.displayNo()).matches("ORD-\\d{4}");
		assertThat(second.displayNo()).matches("ORD-\\d{4}");
		assertThat(first.displayNo()).isNotEqualTo(second.displayNo());
		assertThat(parseDisplaySequence(second.displayNo(), "ORD"))
				.isGreaterThan(parseDisplaySequence(first.displayNo(), "ORD"));

		assertThat(jdbcTemplate.queryForObject(
				"select display_no from orders where id = ?",
				String.class,
				first.orderId())).isEqualTo(first.displayNo());
	}

	@Test
	void createPersistsOrderSnapshotAndReservation() {
		CheckoutSessionResponse response = checkoutService.create(
				CUSTOMER_A,
				request("create-" + UUID.randomUUID(), 2));

		assertThat(response.pricing().subtotal()).isEqualTo("2469.12");
		assertThat(response.pricing().total()).isEqualTo("2469.12");
		assertThat(response.items()).hasSize(1);

		var orderItem = jdbcTemplate.queryForMap("""
				select product_id, variant_id, sku_snapshot, product_name_snapshot,
				       specification_snapshot, brand_name_snapshot,
				       unit_price_snapshot, quantity
				from order_items
				where order_id = ?
				""", response.orderId());

		assertThat(orderItem.get("variant_id")).isEqualTo(VARIANT_ID);
		assertThat(orderItem.get("sku_snapshot")).isEqualTo("CHECKOUT-IT-SKU");
		assertThat(orderItem.get("unit_price_snapshot")).isEqualTo(DATABASE_PRICE);
		assertThat(orderItem.get("quantity")).isEqualTo(2);

		var reservation = jdbcTemplate.queryForMap("""
				select location_id, variant_id, quantity, status
				from product_stock_reservations
				where order_item_id = ?
				""", response.items().getFirst().orderItemId());

		assertThat(reservation.get("location_id")).isEqualTo(LOCATION_ID);
		assertThat(reservation.get("variant_id")).isEqualTo(VARIANT_ID);
		assertThat(reservation.get("quantity")).isEqualTo(2);
		assertThat(reservation.get("status")).isEqualTo("active");
	}

	@Test
	void getReturnsOnlyTheAuthenticatedCustomersCheckout() throws Exception {
		CheckoutSessionResponse created = checkoutService.create(
				CUSTOMER_A,
				request("get-owned-" + UUID.randomUUID(), 1));

		mockMvc.perform(get("/api/checkout/sessions/{orderId}", created.orderId())
					.header("Authorization", bearerA()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.orderId").value(created.orderId()))
				.andExpect(jsonPath("$.data.paymentStatus").value("unpaid"))
				.andExpect(jsonPath("$.data.pricing.total").value("1234.56"))
				.andExpect(jsonPath("$.data.items[0].variantId").value(VARIANT_ID));

		mockMvc.perform(get("/api/checkout/sessions/{orderId}", created.orderId())
					.header("Authorization", bearerB()))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
	}

	@Test
	void getRequiresAuthenticationAndRejectsUnknownCheckout() throws Exception {
		mockMvc.perform(get("/api/checkout/sessions/UNKNOWN"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));

		mockMvc.perform(get("/api/checkout/sessions/UNKNOWN")
					.header("Authorization", bearerA()))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
	}

	@Test
	void cancelReleasesActiveReservation() {
		CheckoutSessionResponse created = checkoutService.create(
				CUSTOMER_A,
				request("cancel-" + UUID.randomUUID(), 1));

		CheckoutSessionResponse cancelled = checkoutService.cancel(CUSTOMER_A, created.orderId());

		assertThat(cancelled.status()).isEqualTo("cancelled");
		assertThat(jdbcTemplate.queryForObject(
				"select status from product_stock_reservations where order_item_id = ?",
				String.class,
				created.items().getFirst().orderItemId())).isEqualTo("released");
		assertThat(jdbcTemplate.queryForObject(
				"select released_at is not null from product_stock_reservations where order_item_id = ?",
				Boolean.class,
				created.items().getFirst().orderItemId())).isTrue();
	}

	@Test
	void patchPersistsShippingAndPaymentMethod() throws Exception {
		CheckoutCreateRequest draftRequest = new CheckoutCreateRequest(
				List.of(new CheckoutCreateRequest.Item(VARIANT_ID, 1)),
				"ecpay-credit",
				null,
				"patch-" + UUID.randomUUID());
		CheckoutSessionResponse created = checkoutService.create(CUSTOMER_A, draftRequest);
		String body = """
				{
				  "shipping": {
				    "recipientName": "更新收件人",
				    "phone": "0987654321",
				    "address": "新北市測試路 2 號"
				  },
				  "paymentMethod": "cod",
				  "couponClaimId": null
				}
				""";

		mockMvc.perform(patch("/api/checkout/sessions/{orderId}", created.orderId())
					.header("Authorization", "Bearer dev:checkout-it-a:checkout-it-a@example.com:google:Tester")
					.contentType(MediaType.APPLICATION_JSON)
					.content(body))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.checkoutStep").value("ready_to_pay"))
				.andExpect(jsonPath("$.data.paymentMethod").value("cod"))
				.andExpect(jsonPath("$.data.shipping.recipientName").value("更新收件人"));

		var updated = jdbcTemplate.queryForMap("""
				select recipient_name_snapshot, shipping_phone_snapshot,
				       shipping_address_snapshot, payment_method
				from orders
				where id = ?
				""", created.orderId());
		assertThat(updated.get("recipient_name_snapshot")).isEqualTo("更新收件人");
		assertThat(updated.get("shipping_phone_snapshot")).isEqualTo("0987654321");
		assertThat(updated.get("shipping_address_snapshot")).isEqualTo("新北市測試路 2 號");
		assertThat(updated.get("payment_method").toString()).isEqualTo("cod");
	}

	@Test
	void patchRejectsExpiredCheckoutWithoutRestoringIt() throws Exception {
		CheckoutSessionResponse created = checkoutService.create(
				CUSTOMER_A,
				request("patch-expired-" + UUID.randomUUID(), 1));
		jdbcTemplate.update("""
				update orders
				set checkout_expires_at = placed_at + interval '1 millisecond'
				where id = ?
				""", created.orderId());

		mockMvc.perform(patch("/api/checkout/sessions/{orderId}", created.orderId())
					.header("Authorization", "Bearer dev:checkout-it-a:checkout-it-a@example.com:google:Tester")
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"paymentMethod\":\"cod\"}"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("CHECKOUT_EXPIRED"));

		assertThat(jdbcTemplate.queryForObject(
				"select payment_method from orders where id = ?",
				String.class,
				created.orderId())).isEqualTo("ecpay-credit");
	}

	@Test
	void concurrentPatchAndExpirationKeepCheckoutCancelled() throws Exception {
		CheckoutSessionResponse created = checkoutService.create(
				CUSTOMER_A,
				request("patch-expiration-race-" + UUID.randomUUID(), 1));
		jdbcTemplate.update("""
				update orders
				set checkout_expires_at = placed_at + interval '1 millisecond'
				where id = ?
				""", created.orderId());
		Instant fixedNow = Instant.now().plusSeconds(60);
		CountDownLatch ready = new CountDownLatch(2);
		CountDownLatch start = new CountDownLatch(1);

		try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
			Future<Integer> expiration = executor.submit(() -> {
				ready.countDown();
				start.await();

				return expirationService.expireDueCheckouts(fixedNow);
			});
			Future<CheckoutSessionResponse> update = executor.submit(() -> {
				ready.countDown();
				start.await();

				return checkoutService.update(CUSTOMER_A, created.orderId(),
						new CheckoutUpdateRequest(null, "cod", null));
			});

			ready.await();
			start.countDown();

			assertThat(expiration.get()).isEqualTo(1);
			assertThatThrownBy(update::get)
					.isInstanceOf(ExecutionException.class)
					.hasCauseInstanceOf(BusinessException.class)
					.satisfies(ex -> assertThat(((BusinessException) ex.getCause()).getErrorCode())
							.isEqualTo(ErrorCode.CHECKOUT_EXPIRED));
		}

		assertThat(jdbcTemplate.queryForObject(
				"select status from orders where id = ?",
				String.class,
				created.orderId())).isEqualTo("cancelled");
		assertThat(jdbcTemplate.queryForObject(
				"select payment_method from orders where id = ?",
				String.class,
				created.orderId())).isEqualTo("ecpay-credit");
	}

	@Test
	void expirationCancelsOrderReleasesStockAndIsIdempotent() {
		jdbcTemplate.update("""
				update inventory_stocks
				set on_hand_quantity = 1
				where location_id = ? and variant_id = ?
				""", LOCATION_ID, VARIANT_ID);
		CheckoutSessionResponse created = checkoutService.create(
				CUSTOMER_A,
				request("expiration-" + UUID.randomUUID(), 1));
		jdbcTemplate.update("""
				update orders
				set checkout_expires_at = placed_at + interval '1 millisecond'
				where id = ?
				""", created.orderId());
		jdbcTemplate.update("""
				update product_stock_reservations
				set expires_at = reserved_at + interval '1 millisecond'
				where order_item_id = ?
				""", created.items().getFirst().orderItemId());
		Instant fixedNow = Instant.now().plusSeconds(60);

		assertThat(expirationService.expireDueCheckouts(fixedNow)).isEqualTo(1);
		assertThat(jdbcTemplate.queryForObject(
				"select status from orders where id = ?",
				String.class,
				created.orderId())).isEqualTo("cancelled");
		assertThat(jdbcTemplate.queryForObject(
				"select payment_status from orders where id = ?",
				String.class,
				created.orderId())).isEqualTo("unpaid");
		assertThat(jdbcTemplate.queryForObject(
				"select status from product_stock_reservations where order_item_id = ?",
				String.class,
				created.items().getFirst().orderItemId())).isEqualTo("expired");
		assertThat(jdbcTemplate.queryForObject(
				"select released_at is not null from product_stock_reservations where order_item_id = ?",
				Boolean.class,
				created.items().getFirst().orderItemId())).isTrue();
		assertThat(jdbcTemplate.queryForObject("""
				select count(*)
				from order_status_history
				where order_id = ? and status = 'cancelled' and note = 'Checkout expired'
				""", Integer.class, created.orderId())).isEqualTo(1);
		assertThat(jdbcTemplate.queryForObject("""
				select coalesce(sum(quantity), 0)
				from product_stock_reservations
				where variant_id = ? and location_id = ? and status = 'active'
				""", Integer.class, VARIANT_ID, LOCATION_ID)).isZero();

		CheckoutSessionResponse reused = checkoutService.create(
				CUSTOMER_B,
				request("expiration-reuse-" + UUID.randomUUID(), 1));

		assertThat(reused.orderId()).isNotEqualTo(created.orderId());
		assertThat(expirationService.expireDueCheckouts(fixedNow)).isZero();
		assertThat(jdbcTemplate.queryForObject("""
				select count(*)
				from order_status_history
				where order_id = ? and status = 'cancelled' and note = 'Checkout expired'
				""", Integer.class, created.orderId())).isEqualTo(1);
	}

	@Test
	void sameIdempotencyKeyCreatesOnlyOneOrder() {
		String idempotencyKey = "replay-" + UUID.randomUUID();
		CheckoutCreateRequest request = request(idempotencyKey, 1);

		CheckoutSessionResponse first = checkoutService.create(CUSTOMER_A, request);
		CheckoutSessionResponse replay = checkoutService.create(CUSTOMER_A, request);

		assertThat(replay.orderId()).isEqualTo(first.orderId());
		assertThat(jdbcTemplate.queryForObject("""
				select count(*)
				from orders
				where customer_id = ? and checkout_idempotency_key = ?
				""", Integer.class, CUSTOMER_A, idempotencyKey)).isEqualTo(1);
	}

	@Test
	void requestPriceFieldsCannotOverrideDatabasePrice() throws Exception {
		String idempotencyKey = "forged-price-" + UUID.randomUUID();
		String body = """
				{
				  "items": [
				    {
				      "variantId": "%s",
				      "quantity": 1,
				      "unitPrice": "0.01"
				    }
				  ],
				  "paymentMethod": "ecpay-credit",
				  "shipping": null,
				  "idempotencyKey": "%s",
				  "total": "0.01"
				}
				""".formatted(VARIANT_ID, idempotencyKey);

		mockMvc.perform(post("/api/checkout/sessions")
					.header("Authorization", "Bearer dev:checkout-it-a:checkout-it-a@example.com:google:Tester")
					.contentType(MediaType.APPLICATION_JSON)
					.content(body))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.pricing.subtotal").value("1234.56"))
				.andExpect(jsonPath("$.data.pricing.total").value("1234.56"))
				.andExpect(jsonPath("$.data.items[0].unitPrice").value("1234.56"));

		assertThat(jdbcTemplate.queryForObject("""
				select total
				from orders
				where customer_id = ? and checkout_idempotency_key = ?
				""", BigDecimal.class, CUSTOMER_A, idempotencyKey)).isEqualByComparingTo(DATABASE_PRICE);
	}

	@Test
	void concurrentCheckoutCannotOversellOneRemainingItem() throws Exception {
		jdbcTemplate.update("""
				update inventory_stocks
				set on_hand_quantity = 1
				where location_id = ? and variant_id = ?
				""", LOCATION_ID, VARIANT_ID);

		CountDownLatch ready = new CountDownLatch(2);
		CountDownLatch start = new CountDownLatch(1);

		try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
			Future<CheckoutSessionResponse> first = executor.submit(
					() -> createWhenReleased(CUSTOMER_A, "concurrent-a-" + UUID.randomUUID(), ready, start));
			Future<CheckoutSessionResponse> second = executor.submit(
					() -> createWhenReleased(CUSTOMER_B, "concurrent-b-" + UUID.randomUUID(), ready, start));

			ready.await();
			start.countDown();

			List<Future<CheckoutSessionResponse>> results = List.of(first, second);
			long successCount = results.stream()
					.filter(this::completedSuccessfully)
					.count();

			assertThat(successCount).isEqualTo(1);
			assertThat(results).anySatisfy(this::assertStockInsufficient);
		}

		assertThat(jdbcTemplate.queryForObject("""
				select coalesce(sum(quantity), 0)
				from product_stock_reservations
				where variant_id = ? and location_id = ? and status = 'active'
				""", Integer.class, VARIANT_ID, LOCATION_ID)).isEqualTo(1);
	}

	// 讓兩個執行緒同時開始建立 Checkout。
	private CheckoutSessionResponse createWhenReleased(
			String customerId,
			String idempotencyKey,
			CountDownLatch ready,
			CountDownLatch start) throws InterruptedException {
		ready.countDown();
		start.await();

		return checkoutService.create(customerId, request(idempotencyKey, 1));
	}

	// 判斷非同步 Checkout 是否成功完成。
	private boolean completedSuccessfully(Future<CheckoutSessionResponse> result) {
		try {
			return result.get() != null;
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			throw new AssertionError("等待 Checkout 測試時被中斷", ex);
		}
		catch (ExecutionException ex) {
			return false;
		}
	}

	// 確認失敗的非同步 Checkout 是因為庫存不足。
	private void assertStockInsufficient(Future<CheckoutSessionResponse> result) {
		assertThatThrownBy(result::get)
				.isInstanceOf(ExecutionException.class)
				.hasCauseInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex.getCause()).getErrorCode())
						.isEqualTo(ErrorCode.STOCK_INSUFFICIENT));
	}

	// 建立測試會員，讓 Checkout 可以保存訂單。
	private void insertCustomer(String customerId, String email, String firebaseUid) {
		jdbcTemplate.update("""
				insert into customers (
				    id, name, phone, email, registered_at, points,
				    first_purchase_used, auth_provider, firebase_uid,
				    created_at, updated_at, status
				)
				values (?, 'Checkout Tester', '0912345678', ?, now(), 0,
				        false, 'google', ?, now(), now(), 'active')
				on conflict (id) do update set
				    name = excluded.name,
				    phone = excluded.phone,
				    email = excluded.email,
				    firebase_uid = excluded.firebase_uid,
				    updated_at = now()
				""", customerId, email, firebaseUid);
		jdbcTemplate.queryForObject(
				"select reactivate_customer(?)",
				Boolean.class,
				customerId);
	}

	private String bearerA() {
		return "Bearer dev:checkout-it-a:checkout-it-a@example.com:google:Tester";
	}

	private String bearerB() {
		return "Bearer dev:checkout-it-b:checkout-it-b@example.com:google:Tester";
	}

	// 建立只含後端允許欄位的 Checkout 請求。
	private CheckoutCreateRequest request(String idempotencyKey, int quantity) {
		return new CheckoutCreateRequest(
				List.of(new CheckoutCreateRequest.Item(VARIANT_ID, quantity)),
				"ecpay-credit",
				new CheckoutCreateRequest.Shipping("delivery", "測試收件人", "0912345678", "台北市測試路 1 號", null),
				idempotencyKey);
	}

	private static int parseDisplaySequence(String displayNo, String prefix) {
		return Integer.parseInt(displayNo.substring(prefix.length() + 1));
	}

	// 清除整合測試建立的訂單與庫存資料。
	private void removeTestData() {
		jdbcTemplate.update("""
				delete from product_stock_reservations
				where variant_id = ? or location_id = ?
				""", VARIANT_ID, LOCATION_ID);
		jdbcTemplate.update("delete from orders where customer_id in (?, ?)", CUSTOMER_A, CUSTOMER_B);
		jdbcTemplate.queryForObject("select soft_delete_customer(?)", Boolean.class, CUSTOMER_A);
		jdbcTemplate.queryForObject("select soft_delete_customer(?)", Boolean.class, CUSTOMER_B);
		jdbcTemplate.update(
				"delete from inventory_stocks where location_id = ? and variant_id = ?",
				LOCATION_ID,
				VARIANT_ID);
		jdbcTemplate.update("delete from inventory_locations where id = ?", LOCATION_ID);
		jdbcTemplate.update("delete from product_variants where id = ?", VARIANT_ID);
	}
}
