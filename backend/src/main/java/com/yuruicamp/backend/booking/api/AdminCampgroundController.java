package com.yuruicamp.backend.booking.api;

import java.util.List;

import com.yuruicamp.backend.booking.application.AdminCampgroundService;
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
 * 用途：後台營區主檔 CRUD／啟停（ADM-W4-01）。
 * 核心重點：RBAC 沿用 `booking-calendar.view`／`booking-calendar.edit`（與公休同一組）。
 * Admin campgrounds CRUD; RBAC reuses booking-calendar.view/edit.
 */
@RestController
@RequestMapping("/api/admin/campgrounds")
@SecurityRequirement(name = OpenApiConfig.FIREBASE_BEARER)
@Tag(name = "Admin Campgrounds", description = "營區主檔查詢、建立、更新、啟停與安全刪除")
public class AdminCampgroundController {

	private final AdminCampgroundService service;

	public AdminCampgroundController(AdminCampgroundService service) {
		this.service = service;
	}

	@GetMapping
	@PreAuthorize("hasAuthority('booking-calendar.view')")
	@Operation(summary = "營區列表", description = "RBAC: booking-calendar.view；含停用營區，公開 API 只回 active")
	public ApiResponse<List<AdminCampgroundResponse>> list() {
		return ApiResponse.ok(service.list());
	}

	@GetMapping("/{id}")
	@PreAuthorize("hasAuthority('booking-calendar.view')")
	@Operation(summary = "營區詳情", description = "RBAC: booking-calendar.view")
	public ApiResponse<AdminCampgroundResponse> get(@PathVariable String id) {
		return ApiResponse.ok(service.get(id));
	}

	@PostMapping
	@PreAuthorize("hasAuthority('booking-calendar.edit')")
	@Operation(summary = "建立營區", description = "RBAC: booking-calendar.edit")
	public ApiResponse<AdminCampgroundResponse> create(@Valid @RequestBody AdminCampgroundCreateRequest request) {
		return ApiResponse.ok(service.create(request));
	}

	@PatchMapping("/{id}")
	@PreAuthorize("hasAuthority('booking-calendar.edit')")
	@Operation(summary = "更新營區／啟停", description = "RBAC: booking-calendar.edit；不可改 id；傳 active 即可啟停")
	public ApiResponse<AdminCampgroundResponse> update(
			@PathVariable String id,
			@Valid @RequestBody AdminCampgroundUpdateRequest request) {
		return ApiResponse.ok(service.update(id, request));
	}

	@DeleteMapping("/{id}")
	@PreAuthorize("hasAuthority('booking-calendar.edit')")
	@Operation(summary = "刪除未引用營區", description = "RBAC: booking-calendar.edit；有 zones／預約／公休／listing／租借庫位引用 → 409，改用 active=false")
	public ApiResponse<Void> delete(@PathVariable String id) {
		service.delete(id);
		return ApiResponse.ok(null);
	}
}
