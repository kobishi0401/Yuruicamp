package com.yuruicamp.backend.booking.api;

import java.time.LocalDate;
import java.util.List;

import com.yuruicamp.backend.booking.application.AdminCalendarDateService;
import com.yuruicamp.backend.common.api.ApiResponse;
import com.yuruicamp.backend.config.OpenApiConfig;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 用途：後台假日曆（特殊節日標記）維護（ADM-W4-03）。
 * RBAC：booking-calendar.view／edit（與公休、營區同一組）。
 */
@RestController
@RequestMapping("/api/admin/calendar-dates")
@SecurityRequirement(name = OpenApiConfig.FIREBASE_BEARER)
@Tag(name = "Admin Calendar Dates", description = "特殊節日曆查詢與標記（影響特殊節日價 tier）")
public class AdminCalendarDateController {

	private final AdminCalendarDateService service;

	public AdminCalendarDateController(AdminCalendarDateService service) {
		this.service = service;
	}

	@GetMapping
	@PreAuthorize("hasAuthority('booking-calendar.view')")
	@Operation(summary = "區間假日曆", description = "RBAC: booking-calendar.view；回傳區間內每一天（含未標記的一般日）")
	public ApiResponse<List<AdminCalendarDateResponse>> listRange(
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
		return ApiResponse.ok(service.listRange(from, to));
	}

	@PutMapping("/{date}")
	@PreAuthorize("hasAuthority('booking-calendar.edit')")
	@Operation(summary = "標記或取消特殊節日", description = "RBAC: booking-calendar.edit；isHoliday=false 刪除列恢復一般日")
	public ApiResponse<AdminCalendarDateResponse> upsert(
			@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
			@Valid @RequestBody AdminCalendarDateUpsertRequest request) {
		return ApiResponse.ok(service.upsert(date, request));
	}

	@DeleteMapping("/{date}")
	@PreAuthorize("hasAuthority('booking-calendar.edit')")
	@Operation(summary = "取消特殊節日標記", description = "RBAC: booking-calendar.edit；等同 isHoliday=false")
	public ApiResponse<Void> delete(
			@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		service.delete(date);
		return ApiResponse.ok(null);
	}
}
