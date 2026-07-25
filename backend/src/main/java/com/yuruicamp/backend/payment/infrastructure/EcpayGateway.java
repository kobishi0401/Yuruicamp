package com.yuruicamp.backend.payment.infrastructure;

import java.math.BigDecimal;
import java.util.Map;

import com.yuruicamp.backend.payment.domain.EcpayRefundResult;

/**
 * ECPay Gateway 抽象（D-1／D-2／W3 退款）。
 * stub=true：本機模擬付款頁與退款成功；stub=false：fields 仍由本機簽 CMV，actionUrl 指向綠界。
 */
public interface EcpayGateway {

	/** 驗證 Notify／Callback 的 CheckMacValue（AIO SHA256）。 */
	boolean verifyNotify(Map<String, String> params);

	/**
	 * 組一組「付款成功」Notify 欄位並附上 CheckMacValue（僅 stub 模式用於 IT／手動模擬）。
	 *
	 * @param merchantTradeNo 商店交易編號（≤20 字元）
	 * @param tradeNo         綠界交易號（冪等鍵的一部分）
	 * @param tradeAmt        金額（整數元）
	 * @param customField1    建議 {@code order:{id}} 或 {@code booking:{id}}，方便對單
	 */
	Map<String, String> buildStubPaidNotify(
			String merchantTradeNo,
			String tradeNo,
			int tradeAmt,
			String customField1);

	/**
	 * D-2：組 AIO Checkout 表單欄位（含 CheckMacValue）。
	 * MerchantTradeNo 必須 ≤20 字元；真實 orderId／bookingId 放 CustomField1。
	 */
	Map<String, String> buildAioCheckoutFields(EcpayCheckoutRequest request, String merchantTradeNo);

	/** 瀏覽器 form POST 的目標；stub 時指向本機 stub checkout。 */
	String checkoutActionUrl();

	boolean isStub();

	String merchantId();

	/**
	 * W3 全額退款。stub=true 固定成功；非 stub 本波尚未接真實綠界 HTTP（回失敗）。
	 *
	 * @param merchantTradeNo 原付款商店交易編號
	 * @param providerTradeNo 綠界 TradeNo（可空）
	 * @param tradeAmt        退款金額（整數元語意由呼叫端決定）
	 */
	EcpayRefundResult refundFull(String merchantTradeNo, String providerTradeNo, BigDecimal tradeAmt);
}
