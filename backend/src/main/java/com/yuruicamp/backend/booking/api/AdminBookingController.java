package com.yuruicamp.backend.booking.api;

import java.time.LocalDate;
import java.util.List;

import com.yuruicamp.backend.booking.application.AdminBookingService;
import com.yuruicamp.backend.common.api.ApiResponse;
import com.yuruicamp.backend.common.security.AdminPrincipal;
import com.yuruicamp.backend.config.OpenApiConfig;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/bookings")
@SecurityRequirement(name = OpenApiConfig.FIREBASE_BEARER)
@Tag(name = "Admin Bookings", description = "後台預約查詢與履約狀態管理")
public class AdminBookingController {

	private final AdminBookingService service;

	public AdminBookingController(AdminBookingService service) {
		this.service = service;
	}

	// 查詢後台預約分頁列表，支援營區、租借、日期與狀態篩選。
	@GetMapping
	@PreAuthorize("hasAuthority('bookings.view')")
	@Operation(summary = "預約列表", description = "RBAC: bookings.view")
	public ApiResponse<List<AdminBookingListResponse>> list(
			@RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "20") int size,
			@RequestParam(defaultValue = "") String q,
			@RequestParam(required = false) List<String> status,
			@RequestParam(required = false) List<String> paymentStatus,
			@RequestParam(required = false) List<String> campgroundId,
			@RequestParam(required = false) List<String> region,
			@RequestParam(required = false) Boolean hasRental,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate checkInFrom,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate checkInTo,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate createdFrom,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate createdTo,
			@RequestParam(defaultValue = "createdAt,desc") String sort) {
		var result = service.list(page, size, q, empty(status), empty(paymentStatus), empty(campgroundId),
				empty(region), hasRental, checkInFrom, checkInTo, createdFrom, createdTo, sort);

		return ApiResponse.ok(result.data(), result.meta());
	}

	// 取得預約的營位、租借快照與狀態歷程。
	@GetMapping("/{id}")
	@PreAuthorize("hasAuthority('bookings.view')")
	@Operation(summary = "預約詳情", description = "RBAC: bookings.view")
	public ApiResponse<AdminBookingDetailResponse> get(@PathVariable String id) {
		return ApiResponse.ok(service.get(id));
	}

	// 確認已由可信付款流程標記為 paid 的預約。
	@PostMapping("/{id}/confirm")
	@PreAuthorize("hasAuthority('bookings.edit')")
	@Operation(summary = "確認預約", description = "RBAC: bookings.edit")
	public ApiResponse<AdminBookingDetailResponse> confirm(
			@PathVariable String id,
			@AuthenticationPrincipal AdminPrincipal principal,
			@Valid @RequestBody(required = false) AdminBookingTransitionRequest request) {
		return ApiResponse.ok(service.confirm(id, principal.adminUserId(), request == null ? null : request.note()));
	}

	// 完成已退房的 confirmed 預約並結清租借保留帳。
	@PostMapping("/{id}/complete")
	@PreAuthorize("hasAuthority('bookings.edit')")
	@Operation(summary = "完成預約", description = "RBAC: bookings.edit")
	public ApiResponse<AdminBookingDetailResponse> complete(
			@PathVariable String id,
			@AuthenticationPrincipal AdminPrincipal principal,
			@Valid @RequestBody(required = false) AdminBookingTransitionRequest request) {
		return ApiResponse.ok(service.complete(id, principal.adminUserId(), request == null ? null : request.note()));
	}

	// W3-03：已付款預約取消＋同交易全額退款。
	@PostMapping("/{id}/cancel")
	@PreAuthorize("hasAuthority('bookings.edit')")
	@Operation(summary = "取消已付款預約", description = "RBAC: bookings.edit；先退款再釋放")
	public ApiResponse<AdminBookingDetailResponse> cancel(
			@PathVariable String id,
			@AuthenticationPrincipal AdminPrincipal principal,
			@Valid @RequestBody(required = false) AdminBookingTransitionRequest request) {
		return ApiResponse.ok(service.cancel(id, principal.adminUserId(), request == null ? null : request.note()));
	}

	// 覆寫預約內部備註；不改履約或付款狀態。
	@PatchMapping("/{id}/internal-note")
	@PreAuthorize("hasAuthority('bookings.edit')")
	@Operation(summary = "更新預約內部備註", description = "RBAC: bookings.edit")
	public ApiResponse<AdminBookingDetailResponse> updateInternalNote(
			@PathVariable String id,
			@Valid @RequestBody AdminInternalNoteRequest request) {
		return ApiResponse.ok(service.updateInternalNote(id, request.internalNote()));
	}

	private static List<String> empty(List<String> values) {
		return values == null ? List.of() : values;
	}
}
