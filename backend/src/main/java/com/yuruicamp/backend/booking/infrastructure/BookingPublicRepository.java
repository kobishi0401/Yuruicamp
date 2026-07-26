package com.yuruicamp.backend.booking.infrastructure;

import java.math.BigDecimal;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

// Booking 公開查詢使用 PostgreSQL read model，避免把查詢用 View 硬映射成可寫 Entity。
@Repository
public class BookingPublicRepository {

	private final JdbcTemplate jdbcTemplate;

	public BookingPublicRepository(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	// 只取得可公開預約的有效營區。
	public List<CampgroundRow> findActiveCampgrounds() {
		return jdbcTemplate.query("""
				select campground.id,
				       campground.name,
				       campground.region,
				       campground.description,
				       campground.active,
				       array(
				           select tag.label
				           from campground_environment_tags relation
				           join environment_tags tag on tag.id = relation.tag_id
				           where relation.campground_id = campground.id
				             and tag.active = true
				           order by tag.sort_order, tag.id
				       ) as environment_tags,
				       array(
				           select tag.label
				           from campground_facility_tags relation
				           join facility_tags tag on tag.id = relation.tag_id
				           where relation.campground_id = campground.id
				             and tag.active = true
				           order by tag.sort_order, tag.id
				       ) as facility_tags
				from campgrounds campground
				where campground.active = true
				order by campground.id
				""", this::mapCampground);
	}

	// 依 ID 取得有效營區，停用營區對公開 API 等同不存在。
	public Optional<CampgroundRow> findActiveCampground(String id) {
		return jdbcTemplate.query("""
				select campground.id,
				       campground.name,
				       campground.region,
				       campground.description,
				       campground.active,
				       array(
				           select tag.label
				           from campground_environment_tags relation
				           join environment_tags tag on tag.id = relation.tag_id
				           where relation.campground_id = campground.id
				             and tag.active = true
				           order by tag.sort_order, tag.id
				       ) as environment_tags,
				       array(
				           select tag.label
				           from campground_facility_tags relation
				           join facility_tags tag on tag.id = relation.tag_id
				           where relation.campground_id = campground.id
				             and tag.active = true
				           order by tag.sort_order, tag.id
				       ) as facility_tags
				from campgrounds campground
				where campground.id = ? and campground.active = true
				""", this::mapCampground, id)
				.stream()
				.findFirst();
	}

	// 將營區基本資料與兩組標籤整理成公開 API 使用的唯讀資料。
	private CampgroundRow mapCampground(ResultSet resultSet, int rowNumber) throws SQLException {
		return new CampgroundRow(
				resultSet.getString("id"),
				resultSet.getString("name"),
				resultSet.getString("region"),
				resultSet.getString("description"),
				resultSet.getBoolean("active"),
				toLabelList(resultSet, "environment_tags"),
				toLabelList(resultSet, "facility_tags"));
	}

	// PostgreSQL array 轉為不可變字串清單，避免查無標籤時回傳 null。
	private List<String> toLabelList(ResultSet resultSet, String columnName) throws SQLException {
		Array labels = resultSet.getArray(columnName);
		if (labels == null) {
			return List.of();
		}
		try {
			String[] values = (String[]) labels.getArray();

			return List.copyOf(Arrays.asList(values));
		} finally {
			labels.free();
		}
	}

	// 詳情只載入有效營位，並以 ID 維持穩定順序。
	public List<ZoneRow> findActiveZones(String campgroundId) {
		return jdbcTemplate.query("""
				select id, type, capacity_per_site, price_weekday,
				       price_holiday, total_sites, active
				from campground_zones
				where campground_id = ? and active = true
				order by id
				""", (rs, rowNum) -> new ZoneRow(
				rs.getString("id"),
				rs.getString("type"),
				rs.getInt("capacity_per_site"),
				rs.getBigDecimal("price_weekday"),
				rs.getBigDecimal("price_holiday"),
				rs.getInt("total_sites"),
				rs.getBoolean("active")), campgroundId);
	}

	// 以 active_rental_listing_view 為有效上架真相，再確認營區與租借庫位仍可用。
	public List<RentalEquipmentRow> findActiveRentalEquipment(String campgroundId) {
		return jdbcTemplate.query("""
				select listing.id,
				       listing.rental_sku_variant_id,
				       listing.campground_id,
				       item.name,
				       listing.price_per_day_weekday,
				       listing.price_per_day_holiday
				from active_rental_listing_view listing
				join rental_sku_variants variant on variant.id = listing.rental_sku_variant_id
				join rental_skus sku on sku.id = variant.rental_sku_id
				join equipment_items item on item.id = sku.item_id
				join campgrounds campground on campground.id = listing.campground_id
				join inventory_locations location on location.id = listing.location_id
				where listing.campground_id = ?
				  and campground.active = true
				  and location.active = true
				  and location.inventory_domain = 'rental'
				  and location.type = 'campground'
				order by listing.id
				""", (rs, rowNum) -> new RentalEquipmentRow(
				rs.getString("id"),
				rs.getString("rental_sku_variant_id"),
				rs.getString("campground_id"),
				rs.getString("name"),
				rs.getBigDecimal("price_per_day_weekday"),
				rs.getBigDecimal("price_per_day_holiday")), campgroundId);
	}

	// 政策固定讀取 singleton id=1。
	public Optional<PolicyRow> findPolicy() {
		return jdbcTemplate.query("""
				select booking_window_days, advance_days, max_nights,
				       timezone, date_boundary_hour, low_availability_threshold
				from booking_policies
				where id = 1
				""", (rs, rowNum) -> new PolicyRow(
				rs.getInt("booking_window_days"),
				rs.getInt("advance_days"),
				rs.getInt("max_nights"),
				rs.getString("timezone"),
				rs.getInt("date_boundary_hour"),
				rs.getInt("low_availability_threshold")))
				.stream()
				.findFirst();
	}

	// 占用狀態由資料庫政策決定，不在 Java 寫死。
	public List<String> findOccupyingStatuses() {
		return jdbcTemplate.queryForList("""
				select status::text
				from booking_policy_occupying_statuses
				where policy_id = 1
				order by status::text
				""", String.class);
	}

	// 只公開有效營區的關閉規則。
	public List<ClosureRow> findClosuresForActiveCampgrounds() {
		return jdbcTemplate.query("""
				select closure.id, closure.campground_id, closure.closure_type,
				       closure.start_date, closure.end_date, closure.weekday,
				       closure.effective_from, closure.effective_to, closure.reason
				from campground_closures closure
				join campgrounds campground on campground.id = closure.campground_id
				where campground.active = true
				order by closure.id
				""", (rs, rowNum) -> new ClosureRow(
				rs.getLong("id"),
				rs.getString("campground_id"),
				rs.getString("closure_type"),
				rs.getObject("start_date", LocalDate.class),
				rs.getObject("end_date", LocalDate.class),
				rs.getObject("weekday", Integer.class),
				rs.getObject("effective_from", LocalDate.class),
				rs.getObject("effective_to", LocalDate.class),
				rs.getString("reason")));
	}

	// DB 函式的結束日為包含端點；Service 會傳入退房日前一日。
	public List<ZoneAvailabilityRow> findZoneAvailability(
			LocalDate from,
			LocalDate toInclusive,
			String campgroundId) {
		return jdbcTemplate.query("""
				select zone_id, stay_date, available_quantity, is_closed
				from get_zone_availability(?, ?, ?, null)
				order by zone_id, stay_date
				""", (rs, rowNum) -> new ZoneAvailabilityRow(
				rs.getString("zone_id"),
				rs.getObject("stay_date", LocalDate.class),
				rs.getInt("available_quantity"),
				rs.getBoolean("is_closed")), from, toInclusive, campgroundId);
	}

	// 讀取有效 listing 的實體庫存（不含 FOR UPDATE；計算公式與 Checkout 一致）。
	public Optional<RentalStockRow> findActiveRentalStock(String campgroundId, String rentalListingId) {
		return jdbcTemplate.query("""
				select listing.id, listing.rental_sku_variant_id, mapping.location_id,
				       stock.on_hand_quantity
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
				  and listing.active = true
				  and variant.status = 'active'
				  and sku.status = 'active'
				  and item.active = true
				  and location.active = true
				  and location.inventory_domain = 'rental'
				  and location.type = 'campground'
				""", (rs, rowNum) -> new RentalStockRow(
				rs.getString("id"),
				rs.getString("rental_sku_variant_id"),
				rs.getString("location_id"),
				rs.getInt("on_hand_quantity")),
				rentalListingId,
				campgroundId)
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

	public record CampgroundRow(
			String id,
			String name,
			String region,
			String description,
			boolean active,
			List<String> environmentTags,
			List<String> facilityTags) {
	}

	public record ZoneRow(
			String id,
			String type,
			int capacityPerSite,
			BigDecimal priceWeekday,
			BigDecimal priceHoliday,
			int totalSites,
			boolean active) {
	}

	public record RentalEquipmentRow(
			String id,
			String rentalSkuVariantId,
			String campgroundId,
			String name,
			BigDecimal pricePerDayWeekday,
			BigDecimal pricePerDayHoliday) {
	}

	public record PolicyRow(
			int bookingWindowDays,
			int advanceDays,
			int maxNights,
			String timezone,
			int dateBoundaryHour,
			int lowAvailabilityThreshold) {
	}

	public record ClosureRow(
			long id,
			String campgroundId,
			String closureType,
			LocalDate startDate,
			LocalDate endDate,
			Integer weekday,
			LocalDate effectiveFrom,
			LocalDate effectiveTo,
			String reason) {
	}

	public record ZoneAvailabilityRow(
			String zoneId,
			LocalDate stayDate,
			int availableQuantity,
			boolean closed) {
	}

	public record RentalStockRow(
			String rentalListingId,
			String rentalSkuVariantId,
			String locationId,
			int onHandQuantity) {
	}
}
