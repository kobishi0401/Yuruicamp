package com.yuruicamp.backend.logistics.api;

import java.util.LinkedHashMap;
import java.util.Map;

import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.config.YuruicampProperties;
import com.yuruicamp.backend.logistics.infrastructure.EcpayLogisticsGateway;
import com.yuruicamp.backend.payment.infrastructure.EcpayCheckMacValue;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 本機 stub：模擬綠界電子地圖選店（固定測試全家門市）。
 */
@RestController
@RequestMapping("/api/logistics/ecpay/stub")
public class EcpayLogisticsStubController {

	private static final String STUB_STORE_ID = "006598";
	private static final String STUB_STORE_NAME = "Stub全家測試店";
	private static final String STUB_STORE_ADDRESS = "台北市大安區測試路1號";

	private final YuruicampProperties properties;
	private final EcpayLogisticsGateway logisticsGateway;

	public EcpayLogisticsStubController(YuruicampProperties properties, EcpayLogisticsGateway logisticsGateway) {
		this.properties = properties;
		this.logisticsGateway = logisticsGateway;
	}

	@PostMapping(value = "/map", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
	public ResponseEntity<String> stubMap(@RequestParam MultiValueMap<String, String> form) {
		requireStub();
		Map<String, String> incoming = toSingleValueMap(form);
		String merchantTradeNo = incoming.getOrDefault("MerchantTradeNo", "STUBMAP");

		Map<String, String> result = new LinkedHashMap<>();
		result.put("MerchantID", logisticsGateway.merchantId());
		result.put("MerchantTradeNo", merchantTradeNo);
		result.put("LogisticsSubType", properties.getEcpayLogistics().getLogisticsSubType());
		result.put("CVSStoreID", STUB_STORE_ID);
		result.put("CVSStoreName", STUB_STORE_NAME);
		result.put("CVSAddress", STUB_STORE_ADDRESS);
		result.put("CheckMacValue", EcpayCheckMacValue.generate(
				result,
				properties.getEcpayLogistics().getHashKey(),
				properties.getEcpayLogistics().getHashIv(),
				"MD5"));

		String mapResultUrl = trimSlash(properties.getEcpay().getPublicApiBaseUrl()) + "/logistics/ecpay/map-result";
		StringBuilder html = new StringBuilder();
		html.append("<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>ECPay Logistics Stub</title></head><body>");
		html.append("<p>本機物流 stub：將使用測試全家門市。</p>");
		html.append("<form method=\"post\" action=\"").append(escapeHtml(mapResultUrl)).append("\">");
		result.forEach((key, value) -> html.append("<input type=\"hidden\" name=\"")
				.append(escapeHtml(key))
				.append("\" value=\"")
				.append(escapeHtml(value))
				.append("\"/>"));
		html.append("<button type=\"submit\">確認測試門市</button></form></body></html>");

		return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(html.toString());
	}

	private void requireStub() {
		if (!properties.getEcpayLogistics().isStub()) {
			throw new BusinessException(ErrorCode.NOT_FOUND, "ECPay logistics stub is disabled");
		}
	}

	private static Map<String, String> toSingleValueMap(MultiValueMap<String, String> form) {
		Map<String, String> params = new LinkedHashMap<>();
		if (form == null) {
			return params;
		}
		form.forEach((key, values) -> {
			if (key != null && values != null && !values.isEmpty() && values.get(0) != null) {
				params.put(key, values.get(0));
			}
		});
		return params;
	}

	private static String trimSlash(String value) {
		if (value == null || value.isBlank()) {
			return "";
		}
		return value.endsWith("/") ? value.substring(0, value.length() - 1) : value.trim();
	}

	private static String escapeHtml(String value) {
		if (value == null) {
			return "";
		}
		return value.replace("&", "&amp;")
				.replace("\"", "&quot;")
				.replace("<", "&lt;")
				.replace(">", "&gt;");
	}
}
