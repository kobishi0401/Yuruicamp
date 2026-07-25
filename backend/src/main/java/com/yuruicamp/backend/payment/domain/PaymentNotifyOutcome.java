package com.yuruicamp.backend.payment.domain;

/**
 * Notify 處理結果（內部用；對外綠界一律回 {@code 1|OK} 除非驗簽失敗）。
 */
public enum PaymentNotifyOutcome {
	/** 首次成功入帳 */
	SUCCESS,
	/** 同交易重送，或單據已 paid */
	IGNORED_DUPLICATE,
	/** 業務失敗（金額不符、已取消、RtnCode≠1 等）已寫 failed 列 */
	FAILED,
	/** CheckMacValue 失敗；不應回 1|OK */
	SIGNATURE_INVALID
}
