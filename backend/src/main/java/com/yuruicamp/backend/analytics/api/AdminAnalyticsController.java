package com.yuruicamp.backend.analytics.api;

import java.time.LocalDate;

import com.yuruicamp.backend.analytics.application.AdminAnalyticsService;
import com.yuruicamp.backend.common.api.ApiResponse;
import com.yuruicamp.backend.config.OpenApiConfig;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 用途：後台分析報表彙總（ADM-W4-06）。
 * RBAC：analytics.view
 */
@RestController
@RequestMapping("/api/admin/analytics")
@SecurityRequirement(name = OpenApiConfig.FIREBASE_BEARER)
@Tag(name = "Admin Analytics", description = "分析報表伺服器端彙總")
public class AdminAnalyticsController {

	private final AdminAnalyticsService service;

	public AdminAnalyticsController(AdminAnalyticsService service) {
		this.service = service;
	}

	@GetMapping("/shop-summary")
	@PreAuthorize("hasAuthority('analytics.view')")
	@Operation(summary = "商城分析彙總", description = "RBAC: analytics.view")
	public ApiResponse<AdminAnalyticsShopSummaryResponse> shopSummary(
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
		return ApiResponse.ok(service.shopSummary(from, to));
	}

	@GetMapping("/booking-summary")
	@PreAuthorize("hasAuthority('analytics.view')")
	@Operation(summary = "預約分析彙總", description = "RBAC: analytics.view")
	public ApiResponse<AdminAnalyticsBookingSummaryResponse> bookingSummary(
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
		return ApiResponse.ok(service.bookingSummary(from, to));
	}
}
