package com.yuruicamp.backend.logistics.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class EcpayHomeAddressParserTest {

	@Test
	void parsesLeadingThreeDigitZip() {
		var parsed = EcpayHomeAddressParser.parse("403 臺中市 南屯區 公益路190號");

		assertThat(parsed.zipCode()).isEqualTo("403");
		assertThat(parsed.streetAddress()).isEqualTo("臺中市 南屯區 公益路190號");
	}

	@Test
	void parsesLeadingFiveDigitZip() {
		var parsed = EcpayHomeAddressParser.parse("70156 臺南市 東區 大學路1號");

		assertThat(parsed.zipCode()).isEqualTo("70156");
		assertThat(parsed.streetAddress()).isEqualTo("臺南市 東區 大學路1號");
	}

	@Test
	void missingZipReturnsBlankZipCode() {
		var parsed = EcpayHomeAddressParser.parse("臺中市 南屯區 公益路190號");

		assertThat(parsed.zipCode()).isEmpty();
		assertThat(parsed.streetAddress()).isEqualTo("臺中市 南屯區 公益路190號");
	}
}
