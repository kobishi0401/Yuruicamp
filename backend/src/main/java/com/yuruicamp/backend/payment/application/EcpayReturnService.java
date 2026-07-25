package com.yuruicamp.backend.payment.application;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import com.yuruicamp.backend.config.YuruicampProperties;
import org.springframework.stereotype.Service;

/**
 * D-4：綠界 OrderResultURL／本機 stub 導回前端。
 * <b>禁止</b>在此標記 paid；只負責 302 到成功／失敗頁，前端再查 API 確認。
 */
@Service
public class EcpayReturnService {

	private final YuruicampProperties.Ecpay ecpay;

	public EcpayReturnService(YuruicampProperties properties) {
		this.ecpay = properties.getEcpay();
	}

	/**
	 * @param params form 或 query（RtnCode、CustomField1、MerchantTradeNo…）
	 * @return 絕對 URL，供 302 Location
	 */
	public String resolveFrontendRedirect(Map<String, String> params) {
		String customField1 = value(params, "CustomField1");
		String rtnCode = value(params, "RtnCode");
		boolean success = "1".equals(rtnCode);

		boolean isBooking = customField1.startsWith("booking:");
		String entityId = isBooking
				? customField1.substring("booking:".length()).trim()
				: customField1.startsWith("order:")
						? customField1.substring("order:".length()).trim()
						: value(params, "MerchantTradeNo");

		String path;
		if (isBooking) {
			path = success ? ecpay.getBookingSuccessPath() : ecpay.getBookingFailurePath();
		}
		else {
			path = success ? ecpay.getOrderSuccessPath() : ecpay.getOrderFailurePath();
		}

		String base = trimTrailingSlash(ecpay.getFrontendBaseUrl());
		String normalizedPath = path.startsWith("/") ? path : "/" + path;
		String idParam = isBooking ? "bookingId" : "orderId";
		StringBuilder url = new StringBuilder(base)
				.append(normalizedPath)
				.append(normalizedPath.contains("?") ? "&" : "?")
				.append(idParam)
				.append("=")
				.append(encode(entityId));
		if (!success) {
			url.append("&paymentResult=failed");
		}
		return url.toString();
	}

	private static String value(Map<String, String> params, String key) {
		if (params == null || key == null) {
			return "";
		}
		String raw = params.get(key);
		return raw == null ? "" : raw.trim();
	}

	private static String trimTrailingSlash(String value) {
		if (value == null || value.isBlank()) {
			return "";
		}
		return value.endsWith("/") ? value.substring(0, value.length() - 1) : value.trim();
	}

	private static String encode(String value) {
		return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
	}
}
