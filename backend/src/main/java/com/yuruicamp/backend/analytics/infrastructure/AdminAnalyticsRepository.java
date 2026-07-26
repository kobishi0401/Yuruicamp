package com.yuruicamp.backend.analytics.infrastructure;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Analytics JDBC 聚合（ADM-W4-06）；自然日以 Asia/Taipei 切日。
 */
@Repository
public class AdminAnalyticsRepository {

	private static final String ORDER_DAY = "(o.placed_at AT TIME ZONE 'Asia/Taipei')::date";
	private static final String BOOKING_DAY = "(b.created_at AT TIME ZONE 'Asia/Taipei')::date";
	private static final String REVENUE_STATUSES = "('shipped', 'completed')";

	private final NamedParameterJdbcTemplate jdbc;

	public AdminAnalyticsRepository(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public long countOrdersInPeriod(LocalDate from, LocalDate to) {
		return queryLong("""
				select count(*) from orders o
				where %s between :from and :to
				""".formatted(ORDER_DAY), from, to);
	}

	public long countPendingShipment() {
		Long value = jdbc.queryForObject(
				"select count(*) from orders where status = 'unshipped'",
				new MapSqlParameterSource(),
				Long.class);
		return value == null ? 0L : value;
	}

	public long countRefundsInPeriod(LocalDate from, LocalDate to) {
		return queryLong("""
				select count(*) from orders o
				where o.status = 'cancelled'
				  and (o.payment_status = 'refunded' or o.refund_status::text <> 'none')
				  and %s between :from and :to
				""".formatted(ORDER_DAY), from, to);
	}

	public long sumSoldQuantityInPeriod(LocalDate from, LocalDate to) {
		return queryLong("""
				select coalesce(sum(oi.quantity), 0)
				from order_items oi
				join orders o on o.id = oi.order_id
				where o.status in %s
				  and %s between :from and :to
				""".formatted(REVENUE_STATUSES, ORDER_DAY), from, to);
	}

	public BigDecimal sumOrderRevenueInPeriod(LocalDate from, LocalDate to) {
		return queryDecimal("""
				select coalesce(sum(o.total), 0)
				from orders o
				where o.status in %s
				  and %s between :from and :to
				""".formatted(REVENUE_STATUSES, ORDER_DAY), from, to);
	}

	public List<DailyRevenueRow> shopDailyRevenue(LocalDate from, LocalDate to) {
		return jdbc.query("""
				select %s as day, coalesce(sum(o.total), 0) as revenue
				from orders o
				where o.status in %s
				  and %s between :from and :to
				group by 1
				order by 1
				""".formatted(ORDER_DAY, REVENUE_STATUSES, ORDER_DAY),
				params(from, to),
				(rs, rowNum) -> new DailyRevenueRow(rs.getObject("day", LocalDate.class), rs.getBigDecimal("revenue")));
	}

	public List<TopProductRow> shopTopProducts(LocalDate from, LocalDate to, int limit) {
		return jdbc.query("""
				select oi.product_id,
				       max(oi.product_name_snapshot) as name,
				       coalesce(sum(oi.quantity * oi.unit_price_snapshot), 0) as revenue,
				       coalesce(sum(oi.quantity), 0) as quantity
				from order_items oi
				join orders o on o.id = oi.order_id
				where o.status in %s
				  and %s between :from and :to
				group by oi.product_id
				order by revenue desc, quantity desc
				limit :limit
				""".formatted(REVENUE_STATUSES, ORDER_DAY),
				params(from, to).addValue("limit", limit),
				this::mapTopProduct);
	}

	/**
	 * 商城類別營收占比：僅 shipped 訂單，分類來自 product → equipment_item → category。
	 */
	public List<CategoryBreakdownRow> shopCategoryBreakdown(LocalDate from, LocalDate to) {
		return jdbc.query("""
				select coalesce(nullif(trim(pc.name), ''), '未分類') as label,
				       coalesce(sum(oi.quantity * oi.unit_price_snapshot), 0)::text as value
				from order_items oi
				join orders o on o.id = oi.order_id
				join products p on p.id = oi.product_id
				join equipment_items ei on ei.id = p.item_id
				join product_categories pc on pc.id = ei.category_id
				where o.status = 'shipped'
				  and %s between :from and :to
				group by pc.name
				order by sum(oi.quantity * oi.unit_price_snapshot) desc, label
				""".formatted(ORDER_DAY),
				params(from, to),
				this::mapCategoryBreakdown);
	}

	public long countBookingsInPeriod(LocalDate from, LocalDate to) {
		return queryLong("""
				select count(*) from bookings b
				where %s between :from and :to
				""".formatted(BOOKING_DAY), from, to);
	}

	public long countPendingBookings() {
		Long value = jdbc.queryForObject(
				"select count(*) from bookings where status = 'pending'",
				new MapSqlParameterSource(),
				Long.class);
		return value == null ? 0L : value;
	}

	public long countCancelledBookingsInPeriod(LocalDate from, LocalDate to) {
		return queryLong("""
				select count(*) from bookings b
				where b.status = 'cancelled'
				  and %s between :from and :to
				""".formatted(BOOKING_DAY), from, to);
	}

	public long countCompletedBookingsInPeriod(LocalDate from, LocalDate to) {
		return queryLong("""
				select count(*) from bookings b
				where b.status = 'completed'
				  and %s between :from and :to
				""".formatted(BOOKING_DAY), from, to);
	}

	public BigDecimal sumBookingRevenueInPeriod(LocalDate from, LocalDate to) {
		return queryDecimal("""
				select coalesce(sum(b.final_amount), 0)
				from bookings b
				where b.payment_status = 'paid'
				  and %s between :from and :to
				""".formatted(BOOKING_DAY), from, to);
	}

	public BigDecimal sumBookingRentalInPeriod(LocalDate from, LocalDate to) {
		return queryDecimal("""
				select coalesce(sum(b.rental_total), 0)
				from bookings b
				where b.payment_status = 'paid'
				  and %s between :from and :to
				""".formatted(BOOKING_DAY), from, to);
	}

	public List<DailyRevenueRow> bookingDailyRevenue(LocalDate from, LocalDate to) {
		return jdbc.query("""
				select %s as day, coalesce(sum(b.final_amount), 0) as revenue
				from bookings b
				where b.payment_status = 'paid'
				  and %s between :from and :to
				group by 1
				order by 1
				""".formatted(BOOKING_DAY, BOOKING_DAY),
				params(from, to),
				(rs, rowNum) -> new DailyRevenueRow(rs.getObject("day", LocalDate.class), rs.getBigDecimal("revenue")));
	}

	public List<CampgroundRevenueRow> bookingByCampground(LocalDate from, LocalDate to) {
		return jdbc.query("""
				select b.campground_id,
				       max(b.campground_name_snapshot) as name,
				       max(b.region_snapshot) as region,
				       coalesce(sum(b.final_amount), 0) as revenue
				from bookings b
				where b.payment_status = 'paid'
				  and %s between :from and :to
				group by b.campground_id
				order by revenue desc, b.campground_id
				""".formatted(BOOKING_DAY),
				params(from, to),
				(rs, rowNum) -> new CampgroundRevenueRow(
						rs.getString("campground_id"),
						rs.getString("name"),
						rs.getString("region"),
						rs.getBigDecimal("revenue")));
	}

	public List<RegionRevenueRow> bookingByRegion(LocalDate from, LocalDate to) {
		return jdbc.query("""
				select coalesce(nullif(trim(b.region_snapshot), ''), '其他') as region,
				       coalesce(sum(b.final_amount), 0) as revenue
				from bookings b
				where b.payment_status = 'paid'
				  and %s between :from and :to
				group by 1
				order by revenue desc, region
				""".formatted(BOOKING_DAY),
				params(from, to),
				(rs, rowNum) -> new RegionRevenueRow(rs.getString("region"), rs.getBigDecimal("revenue")));
	}

	/**
	 * 租借裝備類別占比：paid 預約，分類來自 rental SKU → equipment_item → category；value 為租借件數。
	 */
	public List<CategoryBreakdownRow> bookingRentalCategoryBreakdown(LocalDate from, LocalDate to) {
		return jdbc.query("""
				select coalesce(nullif(trim(pc.name), ''), '未分類') as label,
				       coalesce(sum(bsr.quantity), 0)::text as value
				from booking_selected_rentals bsr
				join bookings b on b.id = bsr.booking_id
				join rental_sku_variants rsv on rsv.id = bsr.rental_sku_variant_id
				join rental_skus rs on rs.id = rsv.rental_sku_id
				join equipment_items ei on ei.id = rs.item_id
				join product_categories pc on pc.id = ei.category_id
				where b.payment_status = 'paid'
				  and %s between :from and :to
				group by pc.name
				order by sum(bsr.quantity) desc, label
				""".formatted(BOOKING_DAY),
				params(from, to),
				this::mapCategoryBreakdown);
	}

	private TopProductRow mapTopProduct(ResultSet rs, int rowNum) throws SQLException {
		return new TopProductRow(
				rs.getString("product_id"),
				rs.getString("name"),
				rs.getBigDecimal("revenue"),
				rs.getLong("quantity"));
	}

	private CategoryBreakdownRow mapCategoryBreakdown(ResultSet rs, int rowNum) throws SQLException {
		return new CategoryBreakdownRow(rs.getString("label"), rs.getString("value"));
	}

	private long queryLong(String sql, LocalDate from, LocalDate to) {
		Long value = jdbc.queryForObject(sql, params(from, to), Long.class);
		return value == null ? 0L : value;
	}

	private BigDecimal queryDecimal(String sql, LocalDate from, LocalDate to) {
		BigDecimal value = jdbc.queryForObject(sql, params(from, to), BigDecimal.class);
		return value == null ? BigDecimal.ZERO : value;
	}

	private MapSqlParameterSource params(LocalDate from, LocalDate to) {
		return new MapSqlParameterSource().addValue("from", from).addValue("to", to);
	}

	public record DailyRevenueRow(LocalDate day, BigDecimal revenue) {
	}

	public record TopProductRow(String productId, String name, BigDecimal revenue, long quantity) {
	}

	public record CampgroundRevenueRow(String campgroundId, String name, String region, BigDecimal revenue) {
	}

	public record RegionRevenueRow(String region, BigDecimal revenue) {
	}

	public record CategoryBreakdownRow(String label, String value) {
	}
}
