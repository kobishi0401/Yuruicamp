package com.yuruicamp.backend.integration.n8n.api;

/**
 * Resolve Customer by LINE User ID for n8n CS bots.
 * Server-to-server only — not for browser clients.
 */
public record N8nCustomerLinkResponse(
		boolean linked,
		String customerId) {
}
