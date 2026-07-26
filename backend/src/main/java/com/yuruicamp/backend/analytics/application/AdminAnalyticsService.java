package com.yuruicamp.backend.analytics.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.yuruicamp.backend.analytics.api.AdminAnalyticsBookingSummaryResponse;
import com.yuruicamp.backend.analytics.api.AdminAnalyticsBookingSummaryResponse.BookingKpis;
import com.yuruicamp.backend.analytics.api.AdminAnalyticsBookingSummaryResponse.CampgroundRow;
import com.yuruicamp.backend.analytics.api.AdminAnalyticsBookingSummaryResponse.RegionRow;
import com.yuruicamp.backend.analytics.api.AdminAnalyticsBookingSummaryResponse.TimeSeriesPoint;
import com.yuruicamp.backend.analytics.api.AdminAnalyticsPeriodResponse;
import com.yuruicamp.backend.analytics.api.AdminAnalyticsShopSummaryResponse;
import com.yuruicamp.backend.analytics.api.AdminAnalyticsShopSummaryResponse.ShopKpis;
import com.yuruicamp.backend.analytics.api.AdminAnalyticsShopSummaryResponse.TopProductRow;
import com.yuruicamp.backend.analytics.api.AdminAnalyticsCategoryBreakdownRow;
import com.yuruicamp.backend.analytics.infrastructure.AdminAnalyticsRepository;
import com.yuruicamp.backend.analytics.infrastructure.AdminAnalyticsRepository.CampgroundRevenueRow;
import com.yuruicamp.backend.analytics.infrastructure.AdminAnalyticsRepository.CategoryBreakdownRow;
import com.yuruicamp.backend.analytics.infrastructure.AdminAnalyticsRepository.DailyRevenueRow;
import com.yuruicamp.backend.analytics.infrastructure.AdminAnalyticsRepository.RegionRevenueRow;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 用途：分析報表彙總（ADM-W4-06）；口徑見 Admin API v0.23 §11.3。
 */
@Service
public class AdminAnalyticsService {

	private static final int MAX_RANGE_DAYS = 366;
	private static final int WEEKLY_THRESHOLD_DAYS = 60;

	private final AdminAnalyticsRepository repository;

	public AdminAnalyticsService(AdminAnalyticsRepository repository) {
		this.repository = repository;
	}

	@Transactional(readOnly = true)
	public AdminAnalyticsShopSummaryResponse shopSummary(LocalDate from, LocalDate to) {
		validateRange(from, to);
		long orderCount = repository.countOrdersInPeriod(from, to);
		long refundCount = repository.countRefundsInPeriod(from, to);
		int refundRate = percent(refundCount, orderCount);
		BigDecimal revenueTotal = repository.sumOrderRevenueInPeriod(from, to);

		ShopKpis kpis = new ShopKpis(
				orderCount,
				repository.countPendingShipment(),
				refundCount,
				refundRate,
				repository.sumSoldQuantityInPeriod(from, to),
				revenueTotal);

		long dayCount = ChronoUnit.DAYS.between(from, to) + 1;
		String granularity = dayCount > WEEKLY_THRESHOLD_DAYS ? "week" : "day";
		List<AdminAnalyticsShopSummaryResponse.TimeSeriesPoint> series = buildSeries(
				repository.shopDailyRevenue(from, to),
				from,
				to,
				granularity);

		List<TopProductRow> topProducts = repository.shopTopProducts(from, to, 10).stream()
				.map(row -> new TopProductRow(row.productId(), row.name(), row.revenue(), row.quantity()))
				.toList();

		List<AdminAnalyticsCategoryBreakdownRow> categoryBreakdown =
				toCategoryBreakdownRows(repository.shopCategoryBreakdown(from, to));

		return new AdminAnalyticsShopSummaryResponse(
				new AdminAnalyticsPeriodResponse(from, to),
				granularity,
				kpis,
				series,
				topProducts,
				categoryBreakdown);
	}

	@Transactional(readOnly = true)
	public AdminAnalyticsBookingSummaryResponse bookingSummary(LocalDate from, LocalDate to) {
		validateRange(from, to);
		long periodCount = repository.countBookingsInPeriod(from, to);
		long cancelled = repository.countCancelledBookingsInPeriod(from, to);
		BigDecimal revenue = repository.sumBookingRevenueInPeriod(from, to);
		BigDecimal rental = repository.sumBookingRentalInPeriod(from, to);

		BookingKpis kpis = new BookingKpis(
				periodCount,
				repository.countPendingBookings(),
				cancelled,
				percent(cancelled, periodCount),
				repository.countCompletedBookingsInPeriod(from, to),
				revenue,
				rental,
				percentMoney(rental, revenue));

		long dayCount = ChronoUnit.DAYS.between(from, to) + 1;
		String granularity = dayCount > WEEKLY_THRESHOLD_DAYS ? "week" : "day";
		List<TimeSeriesPoint> series = buildBookingSeries(
				repository.bookingDailyRevenue(from, to),
				from,
				to,
				granularity);

		List<CampgroundRow> byCampground = repository.bookingByCampground(from, to).stream()
				.map(this::toCampgroundRow)
				.toList();
		List<RegionRow> byRegion = repository.bookingByRegion(from, to).stream()
				.map(row -> new RegionRow(row.region(), row.revenue()))
				.toList();

		List<AdminAnalyticsCategoryBreakdownRow> categoryBreakdown =
				toCategoryBreakdownRows(repository.bookingRentalCategoryBreakdown(from, to));

		return new AdminAnalyticsBookingSummaryResponse(
				new AdminAnalyticsPeriodResponse(from, to),
				granularity,
				kpis,
				series,
				byCampground,
				byRegion,
				categoryBreakdown);
	}

	private CampgroundRow toCampgroundRow(CampgroundRevenueRow row) {
		return new CampgroundRow(row.campgroundId(), row.name(), row.region(), row.revenue());
	}

	private List<AdminAnalyticsCategoryBreakdownRow> toCategoryBreakdownRows(List<CategoryBreakdownRow> rows) {
		return rows.stream()
				.map(row -> new AdminAnalyticsCategoryBreakdownRow(row.label(), row.value()))
				.toList();
	}

	private List<AdminAnalyticsShopSummaryResponse.TimeSeriesPoint> buildSeries(
			List<DailyRevenueRow> daily,
			LocalDate from,
			LocalDate to,
			String granularity) {
		Map<LocalDate, BigDecimal> byDay = new LinkedHashMap<>();
		for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
			byDay.put(d, BigDecimal.ZERO);
		}
		for (DailyRevenueRow row : daily) {
			if (row.day() != null) {
				byDay.put(row.day(), row.revenue() == null ? BigDecimal.ZERO : row.revenue());
			}
		}
		if ("week".equals(granularity)) {
			return aggregateWeeksMap(byDay).entrySet().stream()
					.map(e -> new AdminAnalyticsShopSummaryResponse.TimeSeriesPoint(e.getKey(), e.getValue()))
					.toList();
		}
		return byDay.entrySet().stream()
				.map(e -> new AdminAnalyticsShopSummaryResponse.TimeSeriesPoint(e.getKey(), e.getValue()))
				.toList();
	}

	private List<TimeSeriesPoint> buildBookingSeries(
			List<DailyRevenueRow> daily,
			LocalDate from,
			LocalDate to,
			String granularity) {
		Map<LocalDate, BigDecimal> byDay = new LinkedHashMap<>();
		for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
			byDay.put(d, BigDecimal.ZERO);
		}
		for (DailyRevenueRow row : daily) {
			if (row.day() != null) {
				byDay.put(row.day(), row.revenue() == null ? BigDecimal.ZERO : row.revenue());
			}
		}
		if ("week".equals(granularity)) {
			return aggregateWeeksMap(byDay).entrySet().stream()
					.map(e -> new TimeSeriesPoint(e.getKey(), e.getValue()))
					.toList();
		}
		return byDay.entrySet().stream()
				.map(e -> new TimeSeriesPoint(e.getKey(), e.getValue()))
				.toList();
	}

	private Map<LocalDate, BigDecimal> aggregateWeeksMap(Map<LocalDate, BigDecimal> byDay) {
		Map<LocalDate, BigDecimal> weeks = new LinkedHashMap<>();
		for (Map.Entry<LocalDate, BigDecimal> entry : byDay.entrySet()) {
			LocalDate weekStart = entry.getKey().minusDays(entry.getKey().getDayOfWeek().getValue() - 1L);
			weeks.merge(weekStart, entry.getValue(), BigDecimal::add);
		}
		return weeks;
	}

	private void validateRange(LocalDate from, LocalDate to) {
		if (from == null || to == null) {
			throw validation("from and to are required");
		}
		if (to.isBefore(from)) {
			throw validation("to must be on or after from");
		}
		long days = ChronoUnit.DAYS.between(from, to) + 1;
		if (days > MAX_RANGE_DAYS) {
			throw validation("date range must not exceed " + MAX_RANGE_DAYS + " days");
		}
	}

	private int percent(long part, long whole) {
		if (whole <= 0) {
			return 0;
		}
		return Math.toIntExact(Math.round(part * 100.0 / whole));
	}

	private int percentMoney(BigDecimal part, BigDecimal whole) {
		if (whole == null || whole.compareTo(BigDecimal.ZERO) <= 0) {
			return 0;
		}
		if (part == null) {
			return 0;
		}
		return part.multiply(BigDecimal.valueOf(100))
				.divide(whole, 0, RoundingMode.HALF_UP)
				.intValue();
	}

	private BusinessException validation(String message) {
		return new BusinessException(ErrorCode.VALIDATION_ERROR, message);
	}
}
