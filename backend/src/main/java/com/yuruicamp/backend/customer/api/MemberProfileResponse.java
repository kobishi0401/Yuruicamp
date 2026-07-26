package com.yuruicamp.backend.customer.api;

import java.time.Instant;
import java.time.LocalDate;

// GET /api/me/profile 回傳會員主檔（不含 preferences）。
public record MemberProfileResponse(
		String name,
		String email,
		String phone,
		LocalDate birthday,
		String authProvider,
		Instant registeredAt) {
}
