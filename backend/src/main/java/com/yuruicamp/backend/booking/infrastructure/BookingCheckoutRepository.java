package com.yuruicamp.backend.booking.infrastructure;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

// E-3～E-4 使用明確 SQL 鎖定營位與租借庫存，並寫入 Booking 交易快照。
@Repository
public class BookingCheckoutRepository {

	private final JdbcTemplate jdbcTemplate;

	public BookingCheckoutRepository(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	// 先鎖定有效會員，讓同會員的冪等鍵檢查依序進行。
	public boolean lockActiveCustomer(String customerId) {
		return !jdbcTemplate.queryForList("""
				select id
				from customers
				where id = ? and status = 'active'
				for update
				""", String.class, customerId).isEmpty();
	}

	// 鎖定有效營區，固定後續快照名稱與地區。
	public Optional<CampgroundLockRow> lockActiveCampground(String campgroundId) {
		return jdbcTemplate.query("""
				select id, name, region
				from campgrounds
				where id = ? and active = true
				for update
				""", (rs, rowNum) -> new CampgroundLockRow(
				rs.getString("id"),
				rs.getString("name"),
				rs.getString("region")), campgroundId)
				.stream()
				.findFirst();
	}

	// Service 依 zoneId 排序後逐筆呼叫，確保所有請求使用相同鎖順序。
	public Optional<LockedZoneRow> lockActiveZone(String campgroundId, String zoneId) {
		return jdbcTemplate.query("""
				select id, type, price_weekday, price_holiday
				from campground_zones
				where campground_id = ? and id = ? and active = true
				for update
				""", (rs, rowNum) -> new LockedZoneRow(
				rs.getString("id"),
				rs.getString("type"),
				rs.getBigDecimal("price_weekday"),
				rs.getBigDecimal("price_holiday")), campgroundId, zoneId)
				.stream()
				.findFirst();
	}

	// 鎖定有效 listing 與對應實體庫存列，並同時取得建立快照所需資料。
	public Optional<LockedRentalRow> lockActiveRental(
			String campgroundId,
			String rentalListingId,
			String rentalSkuVariantId) {
		return jdbcTemplate.query("""
				select listing.id, listing.rental_sku_variant_id, mapping.location_id,
				       listing.price_per_day_weekday, listing.price_per_day_holiday,
				       listing.discount, variant.sku, variant.specification,
				       item.name, stock.on_hand_quantity
				from rental_listings listing
				join campground_rental_locations mapping
				  on mapping.campground_id = listing.campground_id
				join inventory_locations location
				  on location.id = mapping.location_id
				join rental_sku_variants variant
				  on variant.id = listing.rental_sku_variant_id
				join rental_skus sku
				  on sku.id = variant.rental_sku_id
				join equipment_items item
				  on item.id = sku.item_id
				join rental_sku_variant_stocks stock
				  on stock.location_id = mapping.location_id
				 and stock.rental_sku_variant_id = variant.id
				where listing.id = ?
				  and listing.campground_id = ?
				  and listing.rental_sku_variant_id = ?
				  and listing.active = true
				  and variant.status = 'active'
				  and sku.status = 'active'
				  and item.active = true
				  and location.active = true
				  and location.inventory_domain = 'rental'
				  and location.type = 'campground'
				for update of listing, stock
				""", (rs, rowNum) -> new LockedRentalRow(
				rs.getString("id"),
				rs.getString("rental_sku_variant_id"),
				rs.getString("location_id"),
				rs.getString("sku"),
				rs.getString("name"),
				rs.getString("specification"),
				rs.getBigDecimal("price_per_day_weekday"),
				rs.getBigDecimal("price_per_day_holiday"),
				rs.getBigDecimal("discount"),
				rs.getInt("on_hand_quantity")),
				rentalListingId,
				campgroundId,
				rentalSkuVariantId)
				.stream()
				.findFirst();
	}

	// 只扣除與 requested [checkIn, checkOut) 有交集的 active 租借保留。
	public int sumOverlappingActiveRentalReservations(
			String locationId,
			String rentalSkuVariantId,
			LocalDate checkIn,
			LocalDate checkOut) {
		Long reserved = jdbcTemplate.queryForObject("""
				select coalesce(sum(quantity), 0)
				from rental_stock_reservations
				where location_id = ?
				  and rental_sku_variant_id = ?
				  and status = 'active'
				  and check_in < ?
				  and check_out > ?
				""", Long.class, locationId, rentalSkuVariantId, checkOut, checkIn);

		return reserved == null ? 0 : Math.toIntExact(reserved);
	}

	// 會員與冪等鍵唯一，可用來回放先前已建立的 Booking Checkout。
	public Optional<BookingRow> findByIdempotencyKey(String customerId, String idempotencyKey) {
		return jdbcTemplate.query("""
				select id, display_no, customer_id, checkout_request_hash, campground_id,
				       campground_name_snapshot, region_snapshot, check_in, check_out,
				       guest_count, weekday_count, holiday_count, zone_total,
				       rental_total, applied_discount, final_amount,
				       payment_method::text, payment_status::text, status::text,
				       checkout_expires_at
				from bookings
				where customer_id = ? and checkout_idempotency_key = ?
				""", (rs, rowNum) -> toBookingRow(rs), customerId, idempotencyKey)
				.stream()
				.findFirst();
	}

	// calendar_dates 有標記 is_holiday=true 的住宿日才算假日，其餘算平日。
	public int countHolidayDates(LocalDate checkIn, LocalDate checkOut) {
		Integer count = jdbcTemplate.queryForObject("""
				select count(*)
				from calendar_dates
				where calendar_date >= ?
				  and calendar_date < ?
				  and is_holiday = true
				""", Integer.class, checkIn, checkOut);

		return count == null ? 0 : count;
	}

	// 建立 pending、unpaid 的 Booking 表頭。
	public void insertBooking(BookingInsert row) {
		jdbcTemplate.update("""
				insert into bookings (
				    id, display_no, customer_id, checkout_idempotency_key, checkout_request_hash,
				    campground_id, campground_name_snapshot, region_snapshot,
				    check_in, check_out, guest_count, weekday_count, holiday_count,
				    zone_total, rental_total, applied_discount, final_amount,
				    payment_method, payment_status, checkout_expires_at,
				    status, created_at, updated_at
				)
				values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.00, ?,
				        ?::payment_method, 'unpaid'::payment_status, ?,
				        'pending'::booking_status, ?, ?)
				""",
				row.id(),
				row.displayNo(),
				row.customerId(),
				row.idempotencyKey(),
				row.requestHash(),
				row.campgroundId(),
				row.campgroundName(),
				row.region(),
				row.checkIn(),
				row.checkOut(),
				row.guestCount(),
				row.weekdayCount(),
				row.holidayCount(),
				row.zoneTotal(),
				row.rentalTotal(),
				row.zoneTotal().add(row.rentalTotal()),
				row.paymentMethod(),
				utc(row.expiresAt()),
				utc(row.createdAt()),
				utc(row.createdAt()));
	}

	// 每個營位明細保存建立當下的類型與平假日價格快照。
	public void insertSelectedZone(String bookingId, SelectedZoneInsert row) {
		jdbcTemplate.update("""
				insert into booking_selected_zones (
				    booking_id, zone_id, zone_type_snapshot,
				    price_weekday_snapshot, price_holiday_snapshot, quantity
				)
				values (?, ?, ?, ?, ?, ?)
				""",
				bookingId,
				row.zoneId(),
				row.type(),
				row.priceWeekday(),
				row.priceHoliday(),
				row.quantity());
	}

	// 建立租借成交快照並回傳流水號，供保留帳外鍵使用。
	public long insertSelectedRental(String bookingId, SelectedRentalInsert row) {
		Long id = jdbcTemplate.queryForObject("""
				insert into booking_selected_rentals (
				    booking_id, rental_listing_id, rental_sku_variant_id,
				    sku_snapshot, name_snapshot, specification_snapshot,
				    price_weekday_snapshot, price_holiday_snapshot,
				    discount_snapshot, quantity
				)
				values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				returning id
				""",
				Long.class,
				bookingId,
				row.rentalListingId(),
				row.rentalSkuVariantId(),
				row.sku(),
				row.name(),
				row.specification(),
				row.priceWeekday(),
				row.priceHoliday(),
				row.discountRate(),
				row.quantity());

		if (id == null) {
			throw new IllegalStateException("Created booking rental could not return an id");
		}

		return id;
	}

	// 建立日期區間 active 保留帳；E-6 取消預約時會將其釋放。
	public void insertRentalReservation(
			long selectedRentalId,
			SelectedRentalInsert row,
			LocalDate checkIn,
			LocalDate checkOut,
			String idempotencyKey,
			Instant reservedAt) {
		jdbcTemplate.update("""
				insert into rental_stock_reservations (
				    booking_selected_rental_id, rental_sku_variant_id, location_id,
				    check_in, check_out, quantity, status,
				    idempotency_key, reserved_at, inventory_domain
				)
				values (?, ?, ?, ?, ?, ?, 'active', ?, ?, 'rental')
				""",
				selectedRentalId,
				row.rentalSkuVariantId(),
				row.locationId(),
				checkIn,
				checkOut,
				row.quantity(),
				idempotencyKey,
				utc(reservedAt));
	}

	// 建立初始 pending 歷程，讓狀態變化可追蹤。
	public void insertPendingHistory(String bookingId, Instant occurredAt) {
		jdbcTemplate.update("""
				insert into booking_status_history (booking_id, status, occurred_at, actor_id, note)
				values (?, 'pending'::booking_status, ?, null, 'Booking checkout created')
				""", bookingId, utc(occurredAt));
	}

	// 回放與新建回應都從資料庫讀取同一份營位快照。
	public List<SelectedZoneRow> findSelectedZones(String bookingId) {
		return jdbcTemplate.query("""
				select zone_id, zone_type_snapshot, price_weekday_snapshot,
				       price_holiday_snapshot, quantity
				from booking_selected_zones
				where booking_id = ?
				order by zone_id
				""", (rs, rowNum) -> new SelectedZoneRow(
				rs.getString("zone_id"),
				rs.getString("zone_type_snapshot"),
				rs.getBigDecimal("price_weekday_snapshot"),
				rs.getBigDecimal("price_holiday_snapshot"),
				rs.getInt("quantity")), bookingId);
	}

	// 回放與新建回應都從資料庫讀取同一份租借快照。
	public List<SelectedRentalRow> findSelectedRentals(String bookingId) {
		return jdbcTemplate.query("""
				select rental_listing_id, rental_sku_variant_id, sku_snapshot,
				       name_snapshot, specification_snapshot,
				       price_weekday_snapshot, price_holiday_snapshot,
				       discount_snapshot, quantity
				from booking_selected_rentals
				where booking_id = ?
				order by rental_listing_id
				""", (rs, rowNum) -> new SelectedRentalRow(
				rs.getString("rental_listing_id"),
				rs.getString("rental_sku_variant_id"),
				rs.getString("sku_snapshot"),
				rs.getString("name_snapshot"),
				rs.getString("specification_snapshot"),
				rs.getBigDecimal("price_weekday_snapshot"),
				rs.getBigDecimal("price_holiday_snapshot"),
				rs.getBigDecimal("discount_snapshot"),
				rs.getInt("quantity")), bookingId);
	}

	public Optional<BookingRow> findById(String bookingId) {
		return jdbcTemplate.query("""
				select id, display_no, customer_id, checkout_request_hash, campground_id,
				       campground_name_snapshot, region_snapshot, check_in, check_out,
				       guest_count, weekday_count, holiday_count, zone_total,
				       rental_total, applied_discount, final_amount,
				       payment_method::text, payment_status::text, status::text,
				       checkout_expires_at
				from bookings
				where id = ?
				""", (rs, rowNum) -> toBookingRow(rs), bookingId)
				.stream()
				.findFirst();
	}

	private BookingRow toBookingRow(java.sql.ResultSet rs) throws java.sql.SQLException {
		return new BookingRow(
				rs.getString("id"),
				rs.getString("display_no"),
				rs.getString("customer_id"),
				rs.getString("checkout_request_hash"),
				rs.getString("campground_id"),
				rs.getString("campground_name_snapshot"),
				rs.getString("region_snapshot"),
				rs.getObject("check_in", LocalDate.class),
				rs.getObject("check_out", LocalDate.class),
				rs.getInt("guest_count"),
				rs.getInt("weekday_count"),
				rs.getInt("holiday_count"),
				rs.getBigDecimal("zone_total"),
				rs.getBigDecimal("rental_total"),
				rs.getBigDecimal("applied_discount"),
				rs.getBigDecimal("final_amount"),
				rs.getString("payment_method"),
				rs.getString("payment_status"),
				rs.getString("status"),
				rs.getObject("checkout_expires_at", OffsetDateTime.class).toInstant());
	}

	public void updateContactSnapshot(
			String bookingId,
			String name,
			String phone,
			String email,
			Instant updatedAt) {
		jdbcTemplate.update("""
				update bookings
				set contact_name_snapshot = ?,
				    contact_phone_snapshot = ?,
				    contact_email_snapshot = ?,
				    updated_at = ?
				where id = ?
				""", name.trim(), phone.trim(), email.trim(), utc(updatedAt), bookingId);
	}

	private OffsetDateTime utc(Instant value) {
		return OffsetDateTime.ofInstant(value, ZoneOffset.UTC);
	}

	public record CampgroundLockRow(String id, String name, String region) {
	}

	public record LockedZoneRow(
			String id,
			String type,
			BigDecimal priceWeekday,
			BigDecimal priceHoliday) {
	}

	public record LockedRentalRow(
			String rentalListingId,
			String rentalSkuVariantId,
			String locationId,
			String sku,
			String name,
			String specification,
			BigDecimal priceWeekday,
			BigDecimal priceHoliday,
			BigDecimal discountRate,
			int onHandQuantity) {
	}

	public record BookingInsert(
			String id,
			String displayNo,
			String customerId,
			String idempotencyKey,
			String requestHash,
			String campgroundId,
			String campgroundName,
			String region,
			LocalDate checkIn,
			LocalDate checkOut,
			int guestCount,
			int weekdayCount,
			int holidayCount,
			BigDecimal zoneTotal,
			BigDecimal rentalTotal,
			String paymentMethod,
			Instant expiresAt,
			Instant createdAt) {
	}

	public record SelectedZoneInsert(
			String zoneId,
			String type,
			BigDecimal priceWeekday,
			BigDecimal priceHoliday,
			int quantity) {
	}

	public record SelectedRentalInsert(
			String rentalListingId,
			String rentalSkuVariantId,
			String locationId,
			String sku,
			String name,
			String specification,
			BigDecimal priceWeekday,
			BigDecimal priceHoliday,
			BigDecimal discountRate,
			int quantity) {
	}

	public record BookingRow(
			String id,
			String displayNo,
			String customerId,
			String requestHash,
			String campgroundId,
			String campgroundName,
			String region,
			LocalDate checkIn,
			LocalDate checkOut,
			int guestCount,
			int weekdayCount,
			int holidayCount,
			BigDecimal zoneTotal,
			BigDecimal rentalTotal,
			BigDecimal discount,
			BigDecimal finalAmount,
			String paymentMethod,
			String paymentStatus,
			String status,
			Instant checkoutExpiresAt) {
	}

	public record SelectedZoneRow(
			String zoneId,
			String type,
			BigDecimal priceWeekday,
			BigDecimal priceHoliday,
			int quantity) {
	}

	public record SelectedRentalRow(
			String rentalListingId,
			String rentalSkuVariantId,
			String sku,
			String name,
			String specification,
			BigDecimal priceWeekday,
			BigDecimal priceHoliday,
			BigDecimal discountRate,
			int quantity) {
	}
}
