package com.yuruicamp.backend.order.api;

import java.util.List;

import com.yuruicamp.backend.common.api.ApiResponse;
import com.yuruicamp.backend.common.security.CustomerPrincipal;
import com.yuruicamp.backend.config.OpenApiConfig;
import com.yuruicamp.backend.order.application.MemberOrderService;
import com.yuruicamp.backend.order.application.MemberOrderService.MemberOrders;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// 會員訂單 API 只採用登入 principal，不接受前端指定會員 ID。
@RestController
@RequestMapping("/api/me/orders")
@Tag(name = "Member Orders", description = "目前登入會員的訂單列表與詳情")
@SecurityRequirement(name = OpenApiConfig.FIREBASE_BEARER)
public class MemberOrderController {

	private final MemberOrderService service;

	public MemberOrderController(MemberOrderService service) {
		this.service = service;
	}

	// 取得目前登入會員的全部訂單，依下單時間新到舊排列。
	@GetMapping
	@Operation(summary = "取得目前會員的訂單列表")
	public ApiResponse<List<MemberOrderResponse>> list(
			@AuthenticationPrincipal CustomerPrincipal principal) {
		MemberOrders result = service.list(principal.customerId());

		return ApiResponse.ok(result.data(), result.meta());
	}

	// 取得目前登入會員擁有的單筆訂單詳情。
	@GetMapping("/{orderId}")
	@Operation(summary = "取得目前會員的單筆訂單詳情")
	public ApiResponse<MemberOrderResponse> get(
			@AuthenticationPrincipal CustomerPrincipal principal,
			@PathVariable String orderId) {
		return ApiResponse.ok(service.get(principal.customerId(), orderId));
	}

	// 會員主動要求以 LINE 追蹤這張訂單；驗證歸屬與 LINE 綁定後發佈事件通知 n8n，不等待推播完成。
	@PostMapping("/{orderId}/line-cs-notify")
	@Operation(summary = "通知 n8n：會員主動要求以 LINE 追蹤這張訂單")
	public ApiResponse<Void> notifyLineCs(
			@AuthenticationPrincipal CustomerPrincipal principal,
			@PathVariable String orderId) {
		service.notifyLineCsInquiry(principal.customerId(), orderId);
		return ApiResponse.ok(null);
	}
}
