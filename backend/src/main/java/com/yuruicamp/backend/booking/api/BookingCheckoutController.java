package com.yuruicamp.backend.booking.api;

import com.yuruicamp.backend.booking.application.BookingCheckoutService;
import com.yuruicamp.backend.booking.application.BookingMemberService;
import com.yuruicamp.backend.booking.application.BookingLifecycleService;
import com.yuruicamp.backend.common.api.ApiResponse;
import com.yuruicamp.backend.common.security.CustomerPrincipal;
import com.yuruicamp.backend.config.OpenApiConfig;
import com.yuruicamp.backend.payment.api.EcpayLaunchResponse;
import com.yuruicamp.backend.payment.application.EcpayLaunchService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// E-3～E-6 會員預約 Checkout API，只負責認證資料、輸入綁定與 Envelope。
@RestController
@RequestMapping("/api/booking/checkout/sessions")
@Tag(name = "Booking Checkout", description = "Pending booking checkout and zone hold")
@SecurityRequirement(name = OpenApiConfig.FIREBASE_BEARER)
public class BookingCheckoutController {

	private final BookingCheckoutService service;
	private final BookingMemberService memberService;
	private final BookingLifecycleService lifecycleService;
	private final EcpayLaunchService ecpayLaunchService;

	public BookingCheckoutController(
			BookingCheckoutService service,
			BookingMemberService memberService,
			BookingLifecycleService lifecycleService,
			EcpayLaunchService ecpayLaunchService) {
		this.service = service;
		this.memberService = memberService;
		this.lifecycleService = lifecycleService;
		this.ecpayLaunchService = ecpayLaunchService;
	}

	@PostMapping
	@Operation(summary = "建立 pending、unpaid 的預約 Checkout")
	public ApiResponse<BookingCheckoutSessionResponse> create(
			@AuthenticationPrincipal CustomerPrincipal principal,
			@Valid @RequestBody BookingCheckoutCreateRequest request) {
		return ApiResponse.ok(service.create(principal.customerId(), request));
	}

	@GetMapping("/{bookingId}")
	@Operation(summary = "讀取目前會員的 Booking Checkout")
	public ApiResponse<BookingCheckoutSessionResponse> get(
			@AuthenticationPrincipal CustomerPrincipal principal,
			@PathVariable String bookingId) {
		return ApiResponse.ok(memberService.getCheckoutSession(principal.customerId(), bookingId));
	}

	@PostMapping("/{bookingId}/cancel")
	@Operation(summary = "取消目前會員的 pending、unpaid Booking Checkout")
	public ApiResponse<BookingCheckoutSessionResponse> cancel(
			@AuthenticationPrincipal CustomerPrincipal principal,
			@PathVariable String bookingId) {
		return ApiResponse.ok(lifecycleService.cancel(principal.customerId(), bookingId));
	}

	@PostMapping("/{bookingId}/ecpay")
	@Operation(summary = "D-2：取得綠界（或本機 stub）AIO 表單欄位；不標記 paid")
	public ApiResponse<EcpayLaunchResponse> ecpay(
			@AuthenticationPrincipal CustomerPrincipal principal,
			@PathVariable String bookingId) {
		return ApiResponse.ok(ecpayLaunchService.launchForBooking(principal.customerId(), bookingId));
	}
}
