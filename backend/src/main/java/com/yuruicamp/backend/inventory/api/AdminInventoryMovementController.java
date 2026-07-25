package com.yuruicamp.backend.inventory.api;

import java.util.List;

import com.yuruicamp.backend.common.api.ApiResponse;
import com.yuruicamp.backend.common.security.AdminPrincipal;
import com.yuruicamp.backend.config.OpenApiConfig;
import com.yuruicamp.backend.inventory.application.AdminInventoryMovementService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
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
@RequestMapping("/api/admin/inventory-movements")
@SecurityRequirement(name = OpenApiConfig.FIREBASE_BEARER)
@Tag(name = "Admin Inventory Movements", description = "後台庫存異動：product_stock_update 稽核（post 不定庫存）＋ rental transfer 營地互轉（post 改庫存）")
public class AdminInventoryMovementController {

	private final AdminInventoryMovementService service;

	public AdminInventoryMovementController(AdminInventoryMovementService service) {
		this.service = service;
	}

	@GetMapping
	@PreAuthorize("hasAuthority('movement.view')")
	@Operation(summary = "庫存異動列表", description = "RBAC: movement.view")
	public ApiResponse<List<AdminInventoryMovementResponse>> list(
			@RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "100") int size,
			@RequestParam(defaultValue = "") String q,
			@RequestParam(defaultValue = "") String inventoryDomain,
			@RequestParam(defaultValue = "") String status,
			@RequestParam(defaultValue = "") String movementType,
			@RequestParam(defaultValue = "occurredAt,desc") String sort) {
		var result = service.list(
				page,
				size,
				q,
				inventoryDomain,
				status,
				movementType,
				sort);

		return ApiResponse.ok(result.data(), result.meta());
	}

	@GetMapping("/{id}")
	@PreAuthorize("hasAuthority('movement.view')")
	@Operation(summary = "庫存異動詳情", description = "RBAC: movement.view")
	public ApiResponse<AdminInventoryMovementResponse> get(@PathVariable long id) {
		return ApiResponse.ok(service.get(id));
	}

	@GetMapping("/lookups")
	@PreAuthorize("hasAuthority('movement.view')")
	@Operation(summary = "庫存異動選項", description = "RBAC: movement.view")
	public ApiResponse<AdminInventoryMovementLookupResponse> getLookups() {
		return ApiResponse.ok(service.getLookups());
	}

	@PostMapping
	@PreAuthorize("hasAuthority('movement.edit')")
	@Operation(summary = "建立庫存異動草稿", description = "RBAC: movement.edit；product_stock_update 或 rental transfer")
	public ApiResponse<AdminInventoryMovementResponse> createDraft(
			@AuthenticationPrincipal AdminPrincipal principal,
			@Valid @RequestBody AdminInventoryMovementCreateRequest request) {
		return ApiResponse.ok(service.createDraft(principal.adminUserId(), request));
	}

	@PostMapping("/{id}/items")
	@PreAuthorize("hasAuthority('movement.edit')")
	@Operation(summary = "新增庫存異動明細", description = "RBAC: movement.edit")
	public ApiResponse<AdminInventoryMovementResponse> addItem(
			@PathVariable long id,
			@Valid @RequestBody AdminInventoryMovementItemRequest request) {
		return ApiResponse.ok(service.addItem(id, request));
	}

	@PostMapping("/{id}/post")
	@PreAuthorize("hasAuthority('movement.edit')")
	@Operation(summary = "定稿庫存異動", description = "RBAC: movement.edit；product_stock_update 不定 on-hand；rental transfer 改租借庫存；重複過帳冪等")
	public ApiResponse<AdminInventoryMovementResponse> post(
			@AuthenticationPrincipal AdminPrincipal principal,
			@PathVariable long id) {
		return ApiResponse.ok(service.post(id, principal.adminUserId()));
	}

	@PostMapping("/{id}/cancel")
	@PreAuthorize("hasAuthority('movement.edit')")
	@Operation(summary = "作廢庫存異動", description = "RBAC: movement.edit")
	public ApiResponse<AdminInventoryMovementResponse> cancel(
			@AuthenticationPrincipal AdminPrincipal principal,
			@PathVariable long id) {
		return ApiResponse.ok(service.cancel(id, principal.adminUserId()));
	}

	@PatchMapping("/{id}")
	@PreAuthorize("hasAuthority('movement.edit')")
	@Operation(summary = "修改異動表頭原因", description = "RBAC: movement.edit；不更新 employeeId")
	public ApiResponse<AdminInventoryMovementResponse> patchReason(
			@PathVariable long id,
			@Valid @RequestBody AdminInventoryMovementReasonPatchRequest request) {
		return ApiResponse.ok(service.patchReason(id, request.reason()));
	}

	@PatchMapping("/{id}/items/{itemId}")
	@PreAuthorize("hasAuthority('movement.edit')")
	@Operation(summary = "修改異動明細備註／異動性質", description = "RBAC: movement.edit；不更新 employeeId")
	public ApiResponse<AdminInventoryMovementResponse> patchItemLineReason(
			@PathVariable long id,
			@PathVariable long itemId,
			@Valid @RequestBody AdminInventoryMovementLineReasonPatchRequest request) {
		return ApiResponse.ok(service.patchItemLineReason(
				id, itemId, request.lineReason(), request.lineNature()));
	}
}