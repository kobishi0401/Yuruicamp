package com.yuruicamp.backend.analytics.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 預約分析彙總回應（ADM-W4-06）。
 */
public record AdminAnalyticsBookingSummaryResponse(
		AdminAnalyticsPeriodResponse period,
		String granularity,
		BookingKpis kpis,
		List<TimeSeriesPoint> timeSeries,
		List<CampgroundRow> byCampground,
		List<RegionRow> byRegion) {

	public record BookingKpis(
			long periodBookingCount,
			long pendingCount,
			long cancelledCount,
			int cancelRatePercent,
			long completedCount,
			BigDecimal revenueTotal,
			BigDecimal rentalAmount,
			int rentalRatioPercent) {
	}

	public record TimeSeriesPoint(LocalDate bucket, BigDecimal revenue) {
	}

	public record CampgroundRow(
			String campgroundId,
			String campgroundName,
			String region,
			BigDecimal revenue) {
	}

	public record RegionRow(String region, BigDecimal revenue) {
	}
}
