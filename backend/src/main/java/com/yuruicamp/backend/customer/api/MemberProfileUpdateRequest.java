package com.yuruicamp.backend.customer.api;

import java.time.LocalDate;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@JsonIgnoreProperties(ignoreUnknown = false)
public record MemberProfileUpdateRequest(
		@NotBlank @Size(min = 1, max = 100) String name,
		@NotBlank @Pattern(regexp = "^09\\d{8}$", message = "phone must match 09xxxxxxxx") String phone,
		@PastOrPresent LocalDate birthday) {
}
