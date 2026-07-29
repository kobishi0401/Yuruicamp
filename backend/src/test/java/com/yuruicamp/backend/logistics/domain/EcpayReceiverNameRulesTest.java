package com.yuruicamp.backend.logistics.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yuruicamp.backend.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

class EcpayReceiverNameRulesTest {

	@Test
	void acceptsChineseName() {
		assertThat(EcpayReceiverNameRules.isValid("陳柏榮")).isTrue();
		assertThat(EcpayReceiverNameRules.isValid("王小明")).isTrue();
	}

	@Test
	void acceptsEnglishName() {
		assertThat(EcpayReceiverNameRules.isValid("Mary")).isTrue();
		assertThat(EcpayReceiverNameRules.isValid("PoJung")).isTrue();
	}

	@Test
	void rejectsHyphenAndSpace() {
		assertThat(EcpayReceiverNameRules.isValid("Po-Jung Chen")).isFalse();
		assertThat(EcpayReceiverNameRules.isValid("王 小明")).isFalse();
	}

	@Test
	void rejectsTooShortChinese() {
		assertThat(EcpayReceiverNameRules.isValid("王")).isFalse();
	}

	@Test
	void rejectsTooShortEnglish() {
		assertThat(EcpayReceiverNameRules.isValid("Amy")).isFalse();
	}

	@Test
	void rejectsDigitsAndSymbols() {
		assertThat(EcpayReceiverNameRules.isValid("王小明1")).isFalse();
		assertThat(EcpayReceiverNameRules.isValid("Test@Name")).isFalse();
	}

	@Test
	void validateOrThrowRejectsInvalidName() {
		assertThatThrownBy(() -> EcpayReceiverNameRules.validateOrThrow("Po-Jung Chen"))
				.isInstanceOf(BusinessException.class)
				.hasMessageContaining("綠界物流格式");
	}

	@Test
	void normalizeTrimsWhitespace() {
		assertThat(EcpayReceiverNameRules.normalize(" 陳柏榮 ")).isEqualTo("陳柏榮");
	}
}
