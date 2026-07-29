package com.yuruicamp.backend.logistics.domain;

import java.util.Optional;
import java.util.regex.Pattern;

import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;

/**
 * 綠界 B2C 物流 {@code ReceiverName} 規則（對齊官方 10500070）。
 * 僅 trim，不做 silent 字元清洗。
 */
public final class EcpayReceiverNameRules {

	public static final String USER_MESSAGE =
			"收件人姓名不符合綠界物流格式（僅中英文、不可含 - 或空格）。請使用中文姓名如「陳柏榮」。";

	private static final Pattern ALLOWED_CHARACTERS = Pattern.compile("^[\\u4e00-\\u9fffA-Za-z]+$");

	private EcpayReceiverNameRules() {
	}

	public static void validateOrThrow(String rawName) {
		validate(rawName).ifPresent(message -> {
			throw new BusinessException(ErrorCode.CONFLICT, message);
		});
	}

	public static Optional<String> validate(String rawName) {
		if (rawName == null) {
			return Optional.of(USER_MESSAGE);
		}
		String name = rawName.trim();
		if (name.isEmpty()) {
			return Optional.of("收件人姓名不可為空");
		}
		if (!ALLOWED_CHARACTERS.matcher(name).matches()) {
			return Optional.of(USER_MESSAGE);
		}

		int chineseCount = countHanCharacters(name);
		int englishCount = name.codePointCount(0, name.length()) - chineseCount;
		if (chineseCount > 0 && englishCount > 0) {
			return Optional.of(USER_MESSAGE);
		}
		if (chineseCount > 0) {
			return chineseCount >= 2 && chineseCount <= 5
					? Optional.empty()
					: Optional.of(USER_MESSAGE);
		}
		return englishCount >= 4 && englishCount <= 10
				? Optional.empty()
				: Optional.of(USER_MESSAGE);
	}

	private static int countHanCharacters(String text) {
		int count = 0;
		for (int offset = 0; offset < text.length(); ) {
			int codePoint = text.codePointAt(offset);
			if (Character.UnicodeScript.of(codePoint) == Character.UnicodeScript.HAN) {
				count++;
			}
			offset += Character.charCount(codePoint);
		}
		return count;
	}
}
