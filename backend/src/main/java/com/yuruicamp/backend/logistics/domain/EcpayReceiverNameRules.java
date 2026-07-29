package com.yuruicamp.backend.logistics.domain;

import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;

/**
 * 綠界國內物流 ReceiverName 格式（建單 API；錯誤碼 10500070）。
 * 僅 trim，不 silent 清洗連字號或空格。
 */
public final class EcpayReceiverNameRules {

	public static final String INVALID_MESSAGE =
			"收件人姓名不符合綠界物流格式（僅中英文、4–10 字元，不可含 - 或空格）。請使用中文姓名如「陳柏榮」。";

	private EcpayReceiverNameRules() {
	}

	public static String normalize(String name) {
		return name == null ? "" : name.trim();
	}

	public static boolean isValid(String name) {
		String trimmed = normalize(name);
		if (trimmed.isEmpty()) {
			return false;
		}
		int chinese = 0;
		int english = 0;
		for (int offset = 0; offset < trimmed.length();) {
			int codePoint = trimmed.codePointAt(offset);
			if (isChinese(codePoint)) {
				chinese++;
			}
			else if (isEnglishLetter(codePoint)) {
				english++;
			}
			else {
				return false;
			}
			offset += Character.charCount(codePoint);
		}
		if (chinese > 0 && english > 0) {
			int total = chinese + english;
			return total >= 4 && total <= 10;
		}
		if (chinese > 0) {
			return chinese >= 2 && chinese <= 5;
		}
		if (english > 0) {
			return english >= 4 && english <= 10;
		}
		return false;
	}

	public static void validateOrThrow(String name) {
		if (!isValid(name)) {
			throw new BusinessException(ErrorCode.CONFLICT, INVALID_MESSAGE);
		}
	}

	private static boolean isChinese(int codePoint) {
		Character.UnicodeBlock block = Character.UnicodeBlock.of(codePoint);
		return block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS
				|| block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_A
				|| block == Character.UnicodeBlock.CJK_COMPATIBILITY_IDEOGRAPHS;
	}

	private static boolean isEnglishLetter(int codePoint) {
		return (codePoint >= 'A' && codePoint <= 'Z') || (codePoint >= 'a' && codePoint <= 'z');
	}
}
