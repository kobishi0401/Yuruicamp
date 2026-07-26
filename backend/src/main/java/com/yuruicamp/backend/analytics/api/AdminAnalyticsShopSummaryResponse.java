package com.yuruicamp.backend.analytics.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 商城分析彙總回應（ADM-W4-06）。
 */
public record AdminAnalyticsShopSummaryResponse(
		AdminAnalyticsPeriodResponse period,
		String granularity,
		ShopKpis kpis,
		List<TimeSeriesPoint> timeSeries,
		List<TopProductRow> topProducts,
		List<AdminAnalyticsCategoryBreakdownRow> categoryBreakdown) {

	public record ShopKpis(
			long orderCount,
			long pendingShipmentCount,
			long refundCount,
			int refundRatePercent,
			long soldQuantity,
			BigDecimal revenueTotal) {
	}

	public record TimeSeriesPoint(LocalDate bucket, BigDecimal revenue) {
	}

	public record TopProductRow(
			String productId,
			String name,
			BigDecimal revenue,
			long quantity) {
	}
}
