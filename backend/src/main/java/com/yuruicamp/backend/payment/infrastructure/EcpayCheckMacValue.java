package com.yuruicamp.backend.payment.infrastructure;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.Map;
import java.util.StringJoiner;
import java.util.TreeMap;

/**
 * ECPay CheckMacValue（AIO SHA256／物流 MD5）。
 * 演算法對齊 {@code .ecpay-skill/guides/13-checkmacvalue.md} Java 範例與 test-vectors。
 */
public final class EcpayCheckMacValue {

	private EcpayCheckMacValue() {
	}

	/** ECPay 專用 URL encode：urlencode → 小寫 → .NET 字元還原；~ 強制成 %7e。 */
	public static String ecpayUrlEncode(String source) {
		String encoded = URLEncoder.encode(source, StandardCharsets.UTF_8).toLowerCase(Locale.ROOT);
		return encoded
				.replace("%2d", "-")
				.replace("%5f", "_")
				.replace("%2e", ".")
				.replace("%21", "!")
				.replace("%2a", "*")
				.replace("%28", "(")
				.replace("%29", ")")
				.replace("~", "%7e");
	}

	/**
	 * @param method {@code SHA256}（AIO）或 {@code MD5}（物流）；大小寫不敏感
	 */
	public static String generate(Map<String, String> params, String hashKey, String hashIv, String method) {
		TreeMap<String, String> sorted = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
		params.forEach((key, value) -> {
			if (key != null && !"CheckMacValue".equalsIgnoreCase(key) && value != null) {
				sorted.put(key, value);
			}
		});

		StringJoiner joiner = new StringJoiner("&");
		sorted.forEach((key, value) -> joiner.add(key + "=" + value));
		String raw = "HashKey=" + hashKey + "&" + joiner + "&HashIV=" + hashIv;
		String encoded = ecpayUrlEncode(raw);

		try {
			MessageDigest digest = MessageDigest.getInstance(
					"md5".equalsIgnoreCase(method) ? "MD5" : "SHA-256");
			byte[] hash = digest.digest(encoded.getBytes(StandardCharsets.UTF_8));
			StringBuilder hex = new StringBuilder(hash.length * 2);
			for (byte b : hash) {
				hex.append(String.format("%02x", b));
			}
			return hex.toString().toUpperCase(Locale.ROOT);
		}
		catch (Exception ex) {
			throw new IllegalStateException("Failed to generate ECPay CheckMacValue", ex);
		}
	}

	/** Timing-safe 比對收到的 CheckMacValue 與重算結果。 */
	public static boolean verify(Map<String, String> params, String hashKey, String hashIv, String method) {
		String received = params.getOrDefault("CheckMacValue", "");
		if (received == null || received.isBlank()) {
			return false;
		}
		String calculated = generate(params, hashKey, hashIv, method);
		return MessageDigest.isEqual(
				received.getBytes(StandardCharsets.UTF_8),
				calculated.getBytes(StandardCharsets.UTF_8));
	}
}
