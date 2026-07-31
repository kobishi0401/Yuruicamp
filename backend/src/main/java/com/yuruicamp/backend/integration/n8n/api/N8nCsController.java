package com.yuruicamp.backend.integration.n8n.api;

import java.util.List;

import com.yuruicamp.backend.common.api.ApiResponse;
import com.yuruicamp.backend.integration.n8n.application.N8nCsOrderService;
import io.swagger.v3.oas.annotations.Hidden;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Server-to-server CS API for n8n (API Key auth — not Firebase / Admin RBAC).
 */
@RestController
@RequestMapping("/api/integrations/n8n")
@Hidden
public class N8nCsController {

	private final N8nCsOrderService n8nCsOrderService;

	public N8nCsController(N8nCsOrderService n8nCsOrderService) {
		this.n8nCsOrderService = n8nCsOrderService;
	}

	@GetMapping("/customers/by-line-user-id/{lineUserId}")
	public ApiResponse<N8nCustomerLinkResponse> resolve(
			@PathVariable String lineUserId) {
		return ApiResponse.ok(n8nCsOrderService.resolveByLineUserId(lineUserId));
	}

	@GetMapping("/customers/by-line-user-id/{lineUserId}/orders")
	public ApiResponse<List<N8nOrderCsCardResponse>> listRecentOrders(
			@PathVariable String lineUserId,
			@RequestParam(required = false) Integer limit) {
		return ApiResponse.ok(n8nCsOrderService.listRecentOrders(lineUserId, limit));
	}

	@GetMapping("/customers/by-line-user-id/{lineUserId}/orders/by-display-no/{displayNo}")
	public ApiResponse<N8nOrderCsCardResponse> findByDisplayNo(
			@PathVariable String lineUserId,
			@PathVariable String displayNo) {
		return ApiResponse.ok(n8nCsOrderService.findByDisplayNo(lineUserId, displayNo));
	}
}
