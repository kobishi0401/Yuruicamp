package com.yuruicamp.backend.logistics.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class EcpayReceiverNameRulesTest {

	@ParameterizedTest
	@ValueSource(strings = { "陳柏榮", "王小明", "歐陽娜娜", "Johnson", "Mary" })
	void acceptsValidReceiverNames(String name) {
		assertThat(EcpayReceiverNameRules.validate(name)).isEmpty();
	}

	@ParameterizedTest
	@ValueSource(strings = { "Po-Jung Chen", "Amy", "A B", "王1", "  ", "" })
	void rejectsInvalidReceiverNames(String name) {
		assertThat(EcpayReceiverNameRules.validate(name)).isPresent();
	}

	@ParameterizedTest
	@CsvSource({
			"Po-Jung Chen, true",
			"陳柏榮, false",
			"王小明, false",
	})
	void representativeSandboxCases(String name, boolean shouldFail) {
		assertThat(EcpayReceiverNameRules.validate(name).isPresent()).isEqualTo(shouldFail);
	}
}
