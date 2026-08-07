package com.yuruicamp.backend.config;

import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Application-level settings bound from {@code yuruicamp.*} properties.
 * 專案設定：CORS、Firebase（只驗 ID Token，不自簽 JWT）。
 */
@ConfigurationProperties(prefix = "yuruicamp")
public class YuruicampProperties {

	private final Cors cors = new Cors();
	private final Firebase firebase = new Firebase();
	private final Ecpay ecpay = new Ecpay();
	private final EcpayLogistics ecpayLogistics = new EcpayLogistics();
	private final N8n n8n = new N8n();

	public Cors getCors() {
		return cors;
	}

	public Firebase getFirebase() {
		return firebase;
	}

	public Ecpay getEcpay() {
		return ecpay;
	}

	public EcpayLogistics getEcpayLogistics() {
		return ecpayLogistics;
	}

	public N8n getN8n() {
		return n8n;
	}

	public static class Cors {
		/** Comma-separated origins are split in {@link WebConfig}. */
		private List<String> allowedOrigins = new ArrayList<>();

		public List<String> getAllowedOrigins() {
			return allowedOrigins;
		}

		public void setAllowedOrigins(List<String> allowedOrigins) {
			this.allowedOrigins = allowedOrigins;
		}
	}

	public static class Firebase {
		/** When false, use DevFirebaseTokenVerifier (tokens prefixed with {@code dev:}). */
		private boolean enabled = false;
		/** Absolute path to Firebase service-account JSON; empty when disabled. */
		private String credentialsPath = "";
		/**
		 * Firebase / GCP project id（與前端 VITE_FIREBASE_PROJECT_ID 相同）。
		 * 建議顯式設定；若空白則嘗試從 service account JSON 讀取。
		 */
		private String projectId = "";

		public boolean isEnabled() {
			return enabled;
		}

		public void setEnabled(boolean enabled) {
			this.enabled = enabled;
		}

		public String getCredentialsPath() {
			return credentialsPath;
		}

		public void setCredentialsPath(String credentialsPath) {
			this.credentialsPath = credentialsPath;
		}

		public String getProjectId() {
			return projectId;
		}

		public void setProjectId(String projectId) {
			this.projectId = projectId;
		}
	}

	/**
	 * ECPay（綠界）設定。本機預設 stub=true，不連真實綠界。
	 * 沙箱預設值對齊 .ecpay-skill test-vectors（MerchantID 3002607）。
	 */
	public static class Ecpay {
		/** true：本機 stub Gateway；false：表單 POST 到綠界沙箱／正式。 */
		private boolean stub = true;
		private String merchantId = "3002607";
		private String hashKey = "pwFHCqoQZGmho4w6";
		private String hashIv = "EkRm7iFT261dpevs";
		/** AIO 付款表單 POST 位址（stub=false 時使用）。 */
		private String paymentUrl = "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5";
		/**
		 * 對外可達的 API 根路徑（含 /api），用來組 NotifyURL／OrderResultURL。
		 * 本機預設 localhost；接真實綠界時請改成 ngrok／正式網域。
		 */
		private String publicApiBaseUrl = "http://localhost:8080/api";
		/** 前端根網址；Return 導頁用。 */
		private String frontendBaseUrl = "http://127.0.0.1:5173";
		private String orderSuccessPath = "/storefront/pages/checkout-success.html";
		private String orderFailurePath = "/storefront/pages/checkout.html";
		private String bookingSuccessPath = "/booking/pages/booking-success.html";
		private String bookingFailurePath = "/booking/pages/booking-checkout.html";

		public boolean isStub() {
			return stub;
		}

		public void setStub(boolean stub) {
			this.stub = stub;
		}

		public String getMerchantId() {
			return merchantId;
		}

		public void setMerchantId(String merchantId) {
			// Trim: Secret Manager / shell piping often appends CRLF and breaks CheckMacValue.
			// 中文：去掉尾端換行，避免綠界 10200073 CheckMacValue Error。
			this.merchantId = trimToNull(merchantId);
		}

		public String getHashKey() {
			return hashKey;
		}

		public void setHashKey(String hashKey) {
			this.hashKey = trimToNull(hashKey);
		}

		public String getHashIv() {
			return hashIv;
		}

		public void setHashIv(String hashIv) {
			this.hashIv = trimToNull(hashIv);
		}

		public String getPaymentUrl() {
			return paymentUrl;
		}

		public void setPaymentUrl(String paymentUrl) {
			this.paymentUrl = paymentUrl;
		}

		public String getPublicApiBaseUrl() {
			return publicApiBaseUrl;
		}

		public void setPublicApiBaseUrl(String publicApiBaseUrl) {
			this.publicApiBaseUrl = publicApiBaseUrl;
		}

		public String getFrontendBaseUrl() {
			return frontendBaseUrl;
		}

		public void setFrontendBaseUrl(String frontendBaseUrl) {
			this.frontendBaseUrl = frontendBaseUrl;
		}

		public String getOrderSuccessPath() {
			return orderSuccessPath;
		}

		public void setOrderSuccessPath(String orderSuccessPath) {
			this.orderSuccessPath = orderSuccessPath;
		}

		public String getOrderFailurePath() {
			return orderFailurePath;
		}

		public void setOrderFailurePath(String orderFailurePath) {
			this.orderFailurePath = orderFailurePath;
		}

		public String getBookingSuccessPath() {
			return bookingSuccessPath;
		}

		public void setBookingSuccessPath(String bookingSuccessPath) {
			this.bookingSuccessPath = bookingSuccessPath;
		}

		public String getBookingFailurePath() {
			return bookingFailurePath;
		}

		public void setBookingFailurePath(String bookingFailurePath) {
			this.bookingFailurePath = bookingFailurePath;
		}
	}

	/**
	 * ECPay 國內物流（B2C CVS FAMI）。帳號與 AIO 金流不同；CheckMacValue 用 MD5。
	 */
	public static class EcpayLogistics {
		/** true：地圖／建單走本機 stub，不連 logistics-stage。 */
		private boolean stub = true;
		private String merchantId = "2000132";
		private String hashKey = "5294y06JbISpM5x9";
		private String hashIv = "v77hoKGq4kWxNNIS";
		private String apiBaseUrl = "https://logistics-stage.ecpay.com.tw";
		private String logisticsSubType = "FAMI";
		/** 宅配 HOME 子類型（與 CVS FAMI 分開，避免 TCAT/FAMI 搞混）。 */
		private String homeLogisticsSubType = "TCAT";
		private String senderName = "Yuruicamp";
		private String senderCellPhone = "0912345678";
		/** 宅配 TCAT 必填：寄件人郵遞區號（3 或 5 碼）。 */
		private String senderZipCode = "100";
		/** 宅配 TCAT 必填：寄件人完整地址（>6 字元）。 */
		private String senderAddress = "台北市中正區忠孝西路一段50號";
		private String goodsName = "Yuruicamp商品";

		public boolean isStub() {
			return stub;
		}

		public void setStub(boolean stub) {
			this.stub = stub;
		}

		public String getMerchantId() {
			return merchantId;
		}

		public void setMerchantId(String merchantId) {
			this.merchantId = trimToNull(merchantId);
		}

		public String getHashKey() {
			return hashKey;
		}

		public void setHashKey(String hashKey) {
			this.hashKey = trimToNull(hashKey);
		}

		public String getHashIv() {
			return hashIv;
		}

		public void setHashIv(String hashIv) {
			this.hashIv = trimToNull(hashIv);
		}

		public String getApiBaseUrl() {
			return apiBaseUrl;
		}

		public void setApiBaseUrl(String apiBaseUrl) {
			this.apiBaseUrl = apiBaseUrl;
		}

		public String getLogisticsSubType() {
			return logisticsSubType;
		}

		public void setLogisticsSubType(String logisticsSubType) {
			this.logisticsSubType = logisticsSubType;
		}

		public String getHomeLogisticsSubType() {
			return homeLogisticsSubType;
		}

		public void setHomeLogisticsSubType(String homeLogisticsSubType) {
			this.homeLogisticsSubType = homeLogisticsSubType;
		}

		public String getSenderName() {
			return senderName;
		}

		public void setSenderName(String senderName) {
			this.senderName = senderName;
		}

		public String getSenderCellPhone() {
			return senderCellPhone;
		}

		public void setSenderCellPhone(String senderCellPhone) {
			this.senderCellPhone = senderCellPhone;
		}

		public String getSenderZipCode() {
			return senderZipCode;
		}

		public void setSenderZipCode(String senderZipCode) {
			this.senderZipCode = senderZipCode;
		}

		public String getSenderAddress() {
			return senderAddress;
		}

		public void setSenderAddress(String senderAddress) {
			this.senderAddress = senderAddress;
		}

		public String getGoodsName() {
			return goodsName;
		}

		public void setGoodsName(String goodsName) {
			this.goodsName = goodsName;
		}
	}

	/**
	 * n8n server-to-server CS integration (API Key). Empty key rejects all calls.
	 * notifyWebhookUrl／notifySecret 供本後端主動推播訂單事件給 n8n；兩者需同時設定，任一空字串代表停用。
	 */
	public static class N8n {
		private String apiKey = "";
		private String notifyWebhookUrl = "";
		private String notifySecret = "";

		public String getApiKey() {
			return apiKey;
		}

		public void setApiKey(String apiKey) {
			this.apiKey = apiKey;
		}

		public String getNotifyWebhookUrl() {
			return notifyWebhookUrl;
		}

		public void setNotifyWebhookUrl(String notifyWebhookUrl) {
			this.notifyWebhookUrl = notifyWebhookUrl;
		}

		public String getNotifySecret() {
			return notifySecret;
		}

		public void setNotifySecret(String notifySecret) {
			this.notifySecret = notifySecret;
		}
	}

	/** Trim whitespace/CRLF from secret-backed strings; keep null as null. */
	private static String trimToNull(String value) {
		return value == null ? null : value.trim();
	}
}
