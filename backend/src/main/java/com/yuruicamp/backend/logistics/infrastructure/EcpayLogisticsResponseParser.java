package com.yuruicamp.backend.logistics.infrastructure;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

import com.yuruicamp.backend.logistics.domain.EcpayLogisticsCreateResult;

/**
 * 解析綠界國內物流 pipe-separated 回應（例：{@code 1|OK|AllPayLogisticsID=...&CVSPaymentNo=...}）。
 */
public final class EcpayLogisticsResponseParser {

	private EcpayLogisticsResponseParser() {
	}

	public static EcpayLogisticsCreateResult parseCreateResponse(String body) {
		if (body == null || body.isBlank()) {
			return EcpayLogisticsCreateResult.failed("", "Empty logistics response");
		}
		String[] parts = body.trim().split("\\|", 3);
		String rtnCode = parts.length > 0 ? parts[0].trim() : "";
		String rtnMsg = parts.length > 1 ? parts[1].trim() : "";
		Map<String, String> fields = parts.length > 2 ? parseQueryLike(parts[2]) : Map.of();
		if (!"1".equals(rtnCode)) {
			return EcpayLogisticsCreateResult.failed(rtnCode, rtnMsg);
		}
		return new EcpayLogisticsCreateResult(
				true,
				rtnCode,
				rtnMsg,
				fields.get("AllPayLogisticsID"),
				fields.get("CVSPaymentNo"),
				fields.get("MerchantTradeNo"));
	}

	static Map<String, String> parseQueryLike(String raw) {
		Map<String, String> fields = new LinkedHashMap<>();
		for (String pair : raw.split("&")) {
			int idx = pair.indexOf('=');
			if (idx <= 0) {
				continue;
			}
			String key = decode(pair.substring(0, idx));
			String value = decode(pair.substring(idx + 1));
			fields.put(key, value);
		}
		return fields;
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
