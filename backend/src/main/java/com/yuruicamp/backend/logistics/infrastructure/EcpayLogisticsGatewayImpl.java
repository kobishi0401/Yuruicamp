package com.yuruicamp.backend.logistics.infrastructure;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import com.yuruicamp.backend.config.YuruicampProperties;
import com.yuruicamp.backend.logistics.domain.EcpayLogisticsCreateResult;
import com.yuruicamp.backend.payment.infrastructure.EcpayCheckMacValue;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 綠界國內物流：stub 與 stage 共用 MD5 簽章；live 建單以 form POST 呼叫 /Express/Create。
 */
@Component
public class EcpayLogisticsGatewayImpl implements EcpayLogisticsGateway {

	private static final Logger log = LoggerFactory.getLogger(EcpayLogisticsGatewayImpl.class);
	private static final int RAW_BODY_LOG_MAX = 2000;
	private static final Pattern ADMIN_CITY = Pattern.compile("^(.+?[市縣])");

	private final YuruicampProperties.Ecpay ecpay;
	private final YuruicampProperties.EcpayLogistics logistics;
	private final HttpClient httpClient = HttpClient.newBuilder()
			.connectTimeout(Duration.ofSeconds(15))
			.build();

	public EcpayLogisticsGatewayImpl(YuruicampProperties properties) {
		this.ecpay = properties.getEcpay();
		this.logistics = properties.getEcpayLogistics();
	}

	@Override
	public boolean verifyCallback(Map<String, String> params) {
		return EcpayCheckMacValue.verify(params, logistics.getHashKey(), logistics.getHashIv(), "MD5");
	}

	@Override
	public Map<String, String> buildMapFormFields(String merchantTradeNo) {
		Map<String, String> params = new LinkedHashMap<>();
		params.put("MerchantID", logistics.getMerchantId());
		params.put("MerchantTradeNo", merchantTradeNo);
		params.put("LogisticsType", "CVS");
		params.put("LogisticsSubType", logistics.getLogisticsSubType());
		params.put("IsCollection", "N");
		params.put("ServerReplyURL", publicApiBase() + "/logistics/ecpay/map-result");
		sign(params);
		return params;
	}

	@Override
	public Map<String, String> buildCreateHomeFields(
			String merchantTradeNo,
			String merchantTradeDate,
			int goodsAmount,
			String goodsName,
			String senderName,
			String senderCellPhone,
			String senderZipCode,
			String senderAddress,
			String receiverName,
			String receiverCellPhone,
			String receiverZipCode,
			String receiverAddress,
			String logisticsSubType) {
		Map<String, String> params = new LinkedHashMap<>();
		params.put("MerchantID", logistics.getMerchantId());
		params.put("MerchantTradeNo", merchantTradeNo);
		params.put("MerchantTradeDate", merchantTradeDate);
		params.put("LogisticsType", "HOME");
		params.put("LogisticsSubType", logisticsSubType);
		params.put("GoodsAmount", String.valueOf(goodsAmount));
		params.put("GoodsName", goodsName);
		params.put("SenderName", senderName);
		params.put("SenderCellPhone", senderCellPhone);
		params.put("SenderZipCode", senderZipCode);
		params.put("SenderAddress", senderAddress);
		params.put("ReceiverName", receiverName);
		params.put("ReceiverCellPhone", receiverCellPhone);
		params.put("ReceiverZipCode", receiverZipCode);
		params.put("ReceiverAddress", receiverAddress);
		// Source: developers.ecpay.com.tw/7414.md — TCAT 固定帶入 4（不限時）
		params.put("ScheduledPickupTime", "4");
		params.put("ScheduledDeliveryTime", "4");
		if (isTcatSubType(logisticsSubType)) {
			params.put("IsCollection", "N");
			params.put("Temperature", "0001");
			params.put("Specification", "0001");
			params.put("Distance", inferTcatDistance(senderAddress, receiverAddress));
		}
		params.put("ServerReplyURL", publicApiBase() + "/logistics/ecpay/notify");
		sign(params);
		return params;
	}

	@Override
	public Map<String, String> buildCreateCvsFields(
			String merchantTradeNo,
			String merchantTradeDate,
			int goodsAmount,
			String goodsName,
			String senderName,
			String senderCellPhone,
			String receiverName,
			String receiverCellPhone,
			String receiverStoreId,
			String logisticsSubType) {
		Map<String, String> params = new LinkedHashMap<>();
		params.put("MerchantID", logistics.getMerchantId());
		params.put("MerchantTradeNo", merchantTradeNo);
		params.put("MerchantTradeDate", merchantTradeDate);
		params.put("LogisticsType", "CVS");
		params.put("LogisticsSubType", logisticsSubType);
		params.put("GoodsAmount", String.valueOf(goodsAmount));
		params.put("GoodsName", goodsName);
		params.put("SenderName", senderName);
		params.put("SenderCellPhone", senderCellPhone);
		params.put("ReceiverName", receiverName);
		params.put("ReceiverCellPhone", receiverCellPhone);
		params.put("ReceiverStoreID", receiverStoreId);
		params.put("ServerReplyURL", publicApiBase() + "/logistics/ecpay/notify");
		sign(params);
		return params;
	}

	@Override
	public String mapActionUrl() {
		if (logistics.isStub()) {
			return publicApiBase() + "/logistics/ecpay/stub/map";
		}
		return trimTrailingSlash(logistics.getApiBaseUrl()) + "/Express/map";
	}

	@Override
	public String createActionUrl() {
		return trimTrailingSlash(logistics.getApiBaseUrl()) + "/Express/Create";
	}

	@Override
	public Map<String, String> buildPrintTradeDocumentFields(String allPayLogisticsId) {
		Map<String, String> params = new LinkedHashMap<>();
		params.put("MerchantID", logistics.getMerchantId());
		params.put("AllPayLogisticsID", allPayLogisticsId);
		sign(params);
		return params;
	}

	@Override
	public String printTradeDocumentActionUrl() {
		return trimTrailingSlash(logistics.getApiBaseUrl()) + "/helper/printTradeDocument";
	}

	@Override
	public EcpayLogisticsCreateResult createCvsOrder(Map<String, String> fields) {
		if (logistics.isStub()) {
			return new EcpayLogisticsCreateResult(
					true,
					"1",
					"OK",
					"STUB" + System.currentTimeMillis(),
					"STUBCVS" + System.currentTimeMillis() % 1_000_000,
					fields.get("MerchantTradeNo"));
		}
		return postCreateOrder(fields);
	}

	@Override
	public EcpayLogisticsCreateResult createHomeOrder(Map<String, String> fields) {
		if (logistics.isStub()) {
			return new EcpayLogisticsCreateResult(
					true,
					"1",
					"OK",
					"STUB" + System.currentTimeMillis(),
					null,
					fields.get("MerchantTradeNo"));
		}
		return postCreateOrder(fields);
	}

	private EcpayLogisticsCreateResult postCreateOrder(Map<String, String> fields) {
		try {
			String body = encodeForm(fields);
			HttpRequest request = HttpRequest.newBuilder()
					.uri(URI.create(createActionUrl()))
					.timeout(Duration.ofSeconds(30))
					.header("Content-Type", "application/x-www-form-urlencoded")
					.POST(HttpRequest.BodyPublishers.ofString(body))
					.build();
			HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
			if (response.statusCode() < 200 || response.statusCode() >= 300) {
				logWarnRawCreateBody(response.body(), "HTTP " + response.statusCode());
				return EcpayLogisticsCreateResult.failed(
						String.valueOf(response.statusCode()),
						"HTTP " + response.statusCode());
			}
			EcpayLogisticsCreateResult parsed = EcpayLogisticsResponseParser.parseCreateResponse(response.body());
			if (!parsed.success()
					|| parsed.allPayLogisticsId() == null
					|| parsed.allPayLogisticsId().isBlank()) {
				logWarnRawCreateBody(response.body(),
						parsed.success() ? "missing AllPayLogisticsID" : parsed.rtnCode() + " " + parsed.rtnMsg());
			}
			return parsed;
		}
		catch (IOException | InterruptedException ex) {
			Thread.currentThread().interrupt();
			return EcpayLogisticsCreateResult.failed("HTTP_ERROR", ex.getMessage());
		}
	}

	private static void logWarnRawCreateBody(String body, String reason) {
		String raw = body == null ? "" : body;
		// Redact CheckMacValue so hash material is not written to logs (規格：勿打 hash 機密)
		raw = raw.replaceAll("(?i)CheckMacValue=[^&\\s|]*", "CheckMacValue=***");
		if (raw.length() > RAW_BODY_LOG_MAX) {
			raw = raw.substring(0, RAW_BODY_LOG_MAX) + "…(truncated)";
		}
		log.warn("ECPay logistics Create response issue ({}): {}", reason, raw);
	}

	@Override
	public boolean isStub() {
		return logistics.isStub();
	}

	@Override
	public String merchantId() {
		return logistics.getMerchantId();
	}

	private void sign(Map<String, String> params) {
		params.put("CheckMacValue",
				EcpayCheckMacValue.generate(params, logistics.getHashKey(), logistics.getHashIv(), "MD5"));
	}

	private String publicApiBase() {
		return trimTrailingSlash(ecpay.getPublicApiBaseUrl());
	}

	private static String trimTrailingSlash(String value) {
		if (value == null || value.isBlank()) {
			return "";
		}
		return value.endsWith("/") ? value.substring(0, value.length() - 1) : value.trim();
	}

	private static String encodeForm(Map<String, String> fields) {
		return fields.entrySet().stream()
				.map(entry -> URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8)
						+ "="
						+ URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8))
				.collect(Collectors.joining("&"));
	}

	private static boolean isTcatSubType(String logisticsSubType) {
		return logisticsSubType != null && "TCAT".equalsIgnoreCase(logisticsSubType.trim());
	}

	/** 7414 Distance：00 同縣市、01 外縣市、02 離島。 */
	static String inferTcatDistance(String senderAddress, String receiverAddress) {
		String receiverCity = extractAdminCity(receiverAddress);
		if (isOffshoreAdminCity(receiverCity)) {
			return "02";
		}
		String senderCity = extractAdminCity(senderAddress);
		if (senderCity.isBlank() || receiverCity.isBlank()) {
			return "01";
		}
		return normalizeAdminCity(senderCity).equals(normalizeAdminCity(receiverCity)) ? "00" : "01";
	}

	private static String extractAdminCity(String compactAddress) {
		if (compactAddress == null || compactAddress.isBlank()) {
			return "";
		}
		Matcher matcher = ADMIN_CITY.matcher(compactAddress.trim());
		return matcher.find() ? matcher.group(1) : "";
	}

	private static boolean isOffshoreAdminCity(String city) {
		return city.contains("澎湖") || city.contains("金門") || city.contains("連江");
	}

	private static String normalizeAdminCity(String city) {
		return city.replace('臺', '台');
	}
}
