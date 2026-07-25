package com.yuruicamp.backend.booking.api;

import java.util.List;

import com.yuruicamp.backend.booking.application.AdminCampgroundZoneService;
import com.yuruicamp.backend.common.api.ApiResponse;
import com.yuruicamp.backend.config.OpenApiConfig;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 用途：後台營位／區域 CRUD（ADM-W4-02）；路徑掛在營區底下。
 * RBAC 沿用 booking-calendar.view／edit。
 */
@RestController
@RequestMapping("/api/admin/campgrounds/{campgroundId}/zones")
@SecurityRequirement(name = OpenApiConfig.FIREBASE_BEARER)
@Tag(name = "Admin Campground Zones", description = "營位查詢、建立、更新、啟停與安全刪除")
public class AdminCampgroundZoneController {

	private final AdminCampgroundZoneService service;

	public AdminCampgroundZoneController(AdminCampgroundZoneService service) {
		this.service = service;
	}

	@GetMapping
	@PreAuthorize("hasAuthority('booking-calendar.view')")
	@Operation(summary = "營位列表", description = "RBAC: booking-calendar.view；含停用營位")
	public ApiResponse<List<AdminCampgroundZoneResponse>> list(@PathVariable String campgroundId) {
		return ApiResponse.ok(service.list(campgroundId));
	}

	@GetMapping("/{zoneId}")
	@PreAuthorize("hasAuthority('booking-calendar.view')")
	@Operation(summary = "營位詳情", description = "RBAC: booking-calendar.view")
	public ApiResponse<AdminCampgroundZoneResponse> get(
			@PathVariable String campgroundId,
			@PathVariable String zoneId) {
		return ApiResponse.ok(service.get(campgroundId, zoneId));
	}

	@PostMapping
	@PreAuthorize("hasAuthority('booking-calendar.edit')")
	@Operation(summary = "建立營位", description = "RBAC: booking-calendar.edit")
	public ApiResponse<AdminCampgroundZoneResponse> create(
			@PathVariable String campgroundId,
			@Valid @RequestBody AdminCampgroundZoneCreateRequest request) {
		return ApiResponse.ok(service.create(campgroundId, request));
	}

	@PatchMapping("/{zoneId}")
	@PreAuthorize("hasAuthority('booking-calendar.edit')")
	@Operation(summary = "更新營位／啟停", description = "RBAC: booking-calendar.edit；降 totalSites 低於占用峰值 → 409")
	public ApiResponse<AdminCampgroundZoneResponse> update(
			@PathVariable String campgroundId,
			@PathVariable String zoneId,
			@Valid @RequestBody AdminCampgroundZoneUpdateRequest request) {
		return ApiResponse.ok(service.update(campgroundId, zoneId, request));
	}

	@DeleteMapping("/{zoneId}")
	@PreAuthorize("hasAuthority('booking-calendar.edit')")
	@Operation(summary = "刪除未引用營位", description = "RBAC: booking-calendar.edit；有預約選位或 zone_blocks → 409")
	public ApiResponse<Void> delete(
			@PathVariable String campgroundId,
			@PathVariable String zoneId) {
		service.delete(campgroundId, zoneId);
		return ApiResponse.ok(null);
	}
}
