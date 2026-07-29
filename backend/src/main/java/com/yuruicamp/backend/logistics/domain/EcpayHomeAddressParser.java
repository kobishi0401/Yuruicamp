package com.yuruicamp.backend.logistics.domain;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 解析訂單 {@code shipping_address_snapshot} 為綠界 HOME 建單所需郵遞區號與地址。
 * 格式來自 {@code formatShippingAddressLine}：{@code 403 臺中市 南屯區 路號}。
 */
public final class EcpayHomeAddressParser {

	private static final Pattern LEADING_ZIP = Pattern.compile("^(\\d{3,5})\\s+(.*)$");

	private EcpayHomeAddressParser() {
	}

	public record ParsedAddress(String zipCode, String streetAddress) {
	}

	public static ParsedAddress parse(String rawAddress) {
		if (rawAddress == null || rawAddress.isBlank()) {
			return new ParsedAddress("", "");
		}
		String normalized = rawAddress.trim().replaceAll("\\s+", " ");
		Matcher matcher = LEADING_ZIP.matcher(normalized);
		if (matcher.matches()) {
			return new ParsedAddress(matcher.group(1).trim(), matcher.group(2).trim());
		}
		return new ParsedAddress("", normalized);
	}
}
