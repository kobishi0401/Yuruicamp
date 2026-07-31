package com.yuruicamp.backend.auth.api;

import java.time.Instant;

/**
 * Profile returned after customer Firebase session (no backend JWT).
 *
 * @param lineBound whether {@code customers.line_user_id} is set (safe UX flag; full id not echoed)
 */
public record CustomerSessionResponse(
		String customerId,
		String email,
		String name,
		String authProvider,
		String firebaseUid,
		String status,
		Instant registeredAt,
		boolean created,
		boolean lineBound) {
}
