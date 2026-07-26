package com.yuruicamp.backend.common.admin;

import java.util.Locale;
import java.util.Map;

/**
 * 後台狀態歷程中文標籤；時間格式由前端組裝（yyyy-MM-dd HH:mm｜{label}）。
 * Admin status timeline labels — frontend formats occurredAt + label.
 */
public final class AdminStatusLabels {

	private static final Map<String, String> BOOKING_STATUS = Map.of(
			"pending", "待確認",
			"confirmed", "已確認",
			"completed", "已完成",
			"cancelled", "已取消");

	private static final Map<String, String> ORDER_STATUS = Map.of(
			"unshipped", "待出貨",
			"shipped", "已出貨",
			"completed", "已完成",
			"returned", "已退貨",
			"cancelled", "已取消");

	private AdminStatusLabels() {
	}

	public static String bookingHistoryLabel(String status, String note) {
		return resolveLabel(note, status, BOOKING_STATUS);
	}

	public static String orderHistoryLabel(String status, String note) {
		return resolveLabel(note, status, ORDER_STATUS);
	}

	private static String resolveLabel(String note, String status, Map<String, String> statusLabels) {
		String fromNote = labelFromNote(note);
		if (fromNote != null) {
			return fromNote;
		}
		if (status == null || status.isBlank()) {
			return "";
		}

		return statusLabels.getOrDefault(status.trim(), status.trim());
	}

	/**
	 * note 含退款語意優先；其次付款／paid 語意（例如 ECPay notify）。
	 * Refund note wins; then payment/paid semantics in note text.
	 */
	private static String labelFromNote(String note) {
		if (note == null || note.isBlank()) {
			return null;
		}
		String lower = note.toLowerCase(Locale.ROOT);
		if (lower.contains("refund") || note.contains("退款")) {
			return "已退款";
		}
		if (lower.contains("payment") || lower.contains("paid") || note.contains("付款")) {
			return "已付款";
		}

		return null;
	}
}
