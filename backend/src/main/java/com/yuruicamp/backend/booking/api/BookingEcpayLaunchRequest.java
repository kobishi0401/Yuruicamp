package com.yuruicamp.backend.booking.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * O2：ECPay 導轉前寫入預約聯絡人快照。
 * Contact snapshot written in the same transaction as ECPay launch.
 */
public record BookingEcpayLaunchRequest(@NotNull @Valid Contact contact) {

	public record Contact(
			@NotBlank String name,
			@NotBlank String phone,
			@NotBlank @Email String email) {
	}
}
