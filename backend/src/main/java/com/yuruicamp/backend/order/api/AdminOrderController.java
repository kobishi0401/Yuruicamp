package com.yuruicamp.backend.order.api;

import java.time.LocalDate;
import java.util.List;

import com.yuruicamp.backend.common.api.ApiResponse;
import com.yuruicamp.backend.common.security.AdminPrincipal;
import com.yuruicamp.backend.config.OpenApiConfig;
import com.yuruicamp.backend.order.application.AdminOrderService;
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
@RequestMapping("/api/admin/orders")
@SecurityRequirement(name = OpenApiConfig.FIREBASE_BEARER)
@Tag(name = "Admin Orders", description = "後台訂單查詢與履約狀態管理")
public class AdminOrderController {

	private final AdminOrderService service;

	public AdminOrderController(AdminOrderService service) {
		this.service = service;
	}

	// 查詢後台訂單分頁列表，支援付款、狀態、日期與排序條件。
	@GetMapping
	@PreAuthorize("hasAuthority('orders.view')")
	@Operation(summary = "訂單列表", description = "RBAC: orders.view")
	public ApiResponse<List<AdminOrderListResponse>> list(
			@RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "20") int size,
			@RequestParam(defaultValue = "") String q,
			@RequestParam(required = false) List<String> status,
			@RequestParam(required = false) List<String> paymentStatus,
			@RequestParam(required = false) List<String> paymentMethod,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate placedFrom,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate placedTo,
			@RequestParam(defaultValue = "placedAt,desc") String sort) {
		var result = service.list(page, size, q, empty(status), empty(paymentStatus), empty(paymentMethod),
				placedFrom, placedTo, sort);

		return ApiResponse.ok(result.data(), result.meta());
	}

	// 取得單一訂單的收件快照、商品明細與狀態歷程。
	@GetMapping("/{id}")
	@PreAuthorize("hasAuthority('orders.view')")
	@Operation(summary = "訂單詳情", description = "RBAC: orders.view")
	public ApiResponse<AdminOrderDetailResponse> get(@PathVariable String id) {
		return ApiResponse.ok(service.get(id));
	}

	// 將符合付款條件的未出貨訂單標記為已出貨。
	@PostMapping("/{id}/ship")
	@PreAuthorize("hasAuthority('orders.edit')")
	@Operation(summary = "訂單出貨", description = "RBAC: orders.edit")
	public ApiResponse<AdminOrderDetailResponse> ship(
			@PathVariable String id,
			@AuthenticationPrincipal AdminPrincipal principal,
			@Valid @RequestBody(required = false) AdminOrderTransitionRequest request) {
		return ApiResponse.ok(service.ship(id, principal.adminUserId(), request == null ? null : request.note()));
	}

	// 將已出貨訂單標記為完成，COD 會在同一交易完成收款。
	@PostMapping("/{id}/complete")
	@PreAuthorize("hasAuthority('orders.edit')")
	@Operation(summary = "完成訂單", description = "RBAC: orders.edit")
	public ApiResponse<AdminOrderDetailResponse> complete(
			@PathVariable String id,
			@AuthenticationPrincipal AdminPrincipal principal,
			@Valid @RequestBody(required = false) AdminOrderTransitionRequest request) {
		return ApiResponse.ok(service.complete(id, principal.adminUserId(), request == null ? null : request.note()));
	}

	// W3-01／W3-02：未出貨取消；已付款線上單同交易全額退款。
	@PostMapping("/{id}/cancel")
	@PreAuthorize("hasAuthority('orders.edit')")
	@Operation(summary = "取消未出貨訂單", description = "RBAC: orders.edit；paid 線上單先退款")
	public ApiResponse<AdminOrderDetailResponse> cancel(
			@PathVariable String id,
			@AuthenticationPrincipal AdminPrincipal principal,
			@Valid @RequestBody(required = false) AdminOrderTransitionRequest request) {
		return ApiResponse.ok(service.cancel(id, principal.adminUserId(), request == null ? null : request.note()));
	}

	// 覆寫訂單內部備註；不改履約或付款狀態。
	@PatchMapping("/{id}/internal-note")
	@PreAuthorize("hasAuthority('orders.edit')")
	@Operation(summary = "更新訂單內部備註", description = "RBAC: orders.edit")
	public ApiResponse<AdminOrderDetailResponse> updateInternalNote(
			@PathVariable String id,
			@Valid @RequestBody AdminInternalNoteRequest request) {
		return ApiResponse.ok(service.updateInternalNote(id, request.internalNote()));
	}

	private static List<String> empty(List<String> values) {
		return values == null ? List.of() : values;
	}
}
