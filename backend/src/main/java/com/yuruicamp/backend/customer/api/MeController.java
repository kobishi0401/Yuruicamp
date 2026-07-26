package com.yuruicamp.backend.customer.api;

import com.yuruicamp.backend.common.api.ApiResponse;
import com.yuruicamp.backend.common.security.CustomerPrincipal;
import com.yuruicamp.backend.config.OpenApiConfig;
import com.yuruicamp.backend.customer.application.MemberProfileService;
import com.yuruicamp.backend.customer.application.MemberShippingAddressService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

/**
 * Skeleton probe: proves Firebase Bearer → CustomerPrincipal works.
 */
@RestController
@RequestMapping("/api/me")
@Tag(name = "Me")
@SecurityRequirement(name = OpenApiConfig.FIREBASE_BEARER)
public class MeController {
	private final MemberShippingAddressService shippingAddressService;
	private final MemberProfileService profileService;

	public MeController(
			MemberShippingAddressService shippingAddressService,
			MemberProfileService profileService) {
		this.shippingAddressService = shippingAddressService;
		this.profileService = profileService;
	}

	@GetMapping
	@Operation(summary = "Current customer principal (requires prior /api/auth/firebase/session)")
	public ApiResponse<CustomerPrincipal> me(@AuthenticationPrincipal CustomerPrincipal principal) {
		return ApiResponse.ok(principal);
	}

	@GetMapping("/profile")
	@Operation(summary = "Get the authenticated customer's profile (name, phone, birthday)")
	public ApiResponse<MemberProfileResponse> getProfile(@AuthenticationPrincipal CustomerPrincipal principal) {
		return ApiResponse.ok(profileService.getProfile(principal.customerId()));
	}

	@PatchMapping("/profile")
	@Operation(summary = "Update the authenticated customer's profile fields")
	public ApiResponse<MemberProfileResponse> updateProfile(
			@AuthenticationPrincipal CustomerPrincipal principal,
			@Valid @RequestBody MemberProfileUpdateRequest request) {
		return ApiResponse.ok(profileService.updateProfile(principal.customerId(), request));
	}

	@GetMapping("/shipping-address")
	@Operation(summary = "Get the authenticated customer's default shipping address")
	public ApiResponse<MemberShippingAddressResponse> getShippingAddress(
			@AuthenticationPrincipal CustomerPrincipal principal) {
		return ApiResponse.ok(shippingAddressService.getDefault(principal.customerId()));
	}

	@PutMapping("/shipping-address")
	@Operation(summary = "Create or replace the authenticated customer's default shipping address")
	public ApiResponse<MemberShippingAddressResponse> saveShippingAddress(
			@AuthenticationPrincipal CustomerPrincipal principal,
			@Valid @RequestBody MemberShippingAddressRequest request) {
		return ApiResponse.ok(shippingAddressService.saveDefault(principal.customerId(), request));
	}
}
