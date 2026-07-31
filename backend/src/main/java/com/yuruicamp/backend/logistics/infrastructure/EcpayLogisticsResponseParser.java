package com.yuruicamp.backend.logistics.infrastructure;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

import com.yuruicamp.backend.logistics.domain.EcpayLogisticsCreateResult;

/**
 * 解析綠界國內物流幕後 Create 回應。
 * <p>
 * Official success: {@code 1|MerchantID=…&AllPayLogisticsID=…&…}
 * Official error: {@code 0| ErrorMessage}
 */
public final class EcpayLogisticsResponseParser {

	private EcpayLogisticsResponseParser() {
	}

	public static EcpayLogisticsCreateResult parseCreateResponse(String body) {
		if (body == null || body.isBlank()) {
			return EcpayLogisticsCreateResult.failed("", "Empty logistics response");
		}
		String normalized = stripWrappers(body.trim());
		int pipe = normalized.indexOf('|');
		if (pipe < 0) {
			return EcpayLogisticsCreateResult.failed("", "Unexpected logistics response format");
		}
		String head = normalized.substring(0, pipe).trim();
		String rest = normalized.substring(pipe + 1).trim();
		if (!"1".equals(head)) {
			return EcpayLogisticsCreateResult.failed(head, rest);
		}
		Map<String, String> fields = parseQueryLike(rest);
		// Prefer RtnCode / RtnMsg from the query when present (official Create puts them there)
		String rtnCode = blankToNull(fields.get("RtnCode"));
		if (rtnCode == null) {
			rtnCode = head;
		}
		String rtnMsg = blankToNull(fields.get("RtnMsg"));
		if (rtnMsg == null) {
			rtnMsg = "OK";
		}
		return new EcpayLogisticsCreateResult(
				true,
				rtnCode,
				rtnMsg,
				blankToNull(fields.get("AllPayLogisticsID")),
				blankToNull(fields.get("CVSPaymentNo")),
				blankToNull(fields.get("MerchantTradeNo")));
	}

	static Map<String, String> parseQueryLike(String raw) {
		Map<String, String> fields = new LinkedHashMap<>();
		if (raw == null || raw.isBlank()) {
			return fields;
		}
		for (String pair : raw.split("&")) {
			int idx = pair.indexOf('=');
			if (idx <= 0) {
				continue;
			}
			String key = decode(pair.substring(0, idx).trim());
			String value = decode(pair.substring(idx + 1).trim());
			if (!key.isEmpty()) {
				fields.put(key, value);
			}
		}
		return fields;
	}

	/** Strip optional HTML wrappers from doc examples / odd gateways. */
	private static String stripWrappers(String body) {
		String value = body;
		if (value.regionMatches(true, 0, "<xmp>", 0, 5)) {
			value = value.substring(5);
		}
		if (value.toLowerCase().endsWith("</xmp>")) {
			value = value.substring(0, value.length() - 6);
		}
		return value.trim();
	}

	private static String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

	private static String decode(String value) {
		return URLDecoder.decode(value, StandardCharsets.UTF_8);
	}

	public static Map<String, String> toSingleValueMap(Map<String, String[]> source) {
		Map<String, String> params = new HashMap<>();
		if (source == null) {
			return params;
		}
		source.forEach((key, values) -> {
			if (key != null && values != null && values.length > 0 && values[0] != null) {
				params.put(key, values[0]);
			}
		});
		return params;
	}
}
