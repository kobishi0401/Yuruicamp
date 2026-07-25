package com.yuruicamp.backend.checkout.api;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.yuruicamp.backend.checkout.application.CheckoutService;
import com.yuruicamp.backend.common.api.ApiResponse;
import com.yuruicamp.backend.common.security.CustomerPrincipal;
import com.yuruicamp.backend.config.OpenApiConfig;
import com.yuruicamp.backend.payment.api.EcpayLaunchResponse;
import com.yuruicamp.backend.payment.application.EcpayLaunchService;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/checkout/sessions")
@Tag(
		name = "Checkout",
		description = "Draft order and 15-minute stock reservation"
)
@SecurityRequirement(name = OpenApiConfig.FIREBASE_BEARER)
public class CheckoutController {

	private final CheckoutService service;
	private final EcpayLaunchService ecpayLaunchService;

	public CheckoutController(CheckoutService service, EcpayLaunchService ecpayLaunchService) {
		this.service = service;
		this.ecpayLaunchService = ecpayLaunchService;
	}

	@PostMapping
	public ApiResponse<CheckoutSessionResponse> create(
			@AuthenticationPrincipal CustomerPrincipal principal,
			@Valid @RequestBody CheckoutCreateRequest request) {
		return ApiResponse.ok(service.create(principal.customerId(), request));
	}

	@GetMapping("/{orderId}")
	public ApiResponse<CheckoutSessionResponse> get(
			@AuthenticationPrincipal CustomerPrincipal principal,
			@PathVariable String orderId) {
		return ApiResponse.ok(service.get(principal.customerId(), orderId));
	}

	@PatchMapping("/{orderId}")
	public ApiResponse<CheckoutSessionResponse> update(
			@AuthenticationPrincipal CustomerPrincipal principal,
			@PathVariable String orderId,
			@Valid @RequestBody CheckoutUpdateRequest request) {
		return ApiResponse.ok(service.update(principal.customerId(), orderId, request));
	}

	@PostMapping("/{orderId}/cancel")
	public ApiResponse<CheckoutSessionResponse> cancel(
			@AuthenticationPrincipal CustomerPrincipal principal,
			@PathVariable String orderId) {
		return ApiResponse.ok(service.cancel(principal.customerId(), orderId));
	}

	@PostMapping("/{orderId}/confirm-cod")
	public ApiResponse<CheckoutSessionResponse> confirmCod(
			@AuthenticationPrincipal CustomerPrincipal principal,
			@PathVariable String orderId) {
		return ApiResponse.ok(service.confirmCod(principal.customerId(), orderId));
	}

	/** D-2：取得綠界（或本機 stub）AIO 表單欄位；不標記 paid。 */
	@PostMapping("/{orderId}/ecpay")
	public ApiResponse<EcpayLaunchResponse> ecpay(
			@AuthenticationPrincipal CustomerPrincipal principal,
			@PathVariable String orderId) {
		return ApiResponse.ok(ecpayLaunchService.launchForOrder(principal.customerId(), orderId));
	}
}
