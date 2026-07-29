package com.yuruicamp.backend.logistics.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class EcpayTaiwanDistrictZipTest {

	@Test
	void lookupNantunDistrictZip() {
		assertThat(EcpayTaiwanDistrictZip.lookup("臺中市", "南屯區")).isEqualTo("408");
	}

	@Test
	void parseCityDistrictFromSpacedStreetAddress() {
		var parsed = EcpayTaiwanDistrictZip.parseCityDistrict("臺中市 南屯區 公益路190號");

		assertThat(parsed).isPresent();
		assertThat(parsed.get().city()).isEqualTo("臺中市");
		assertThat(parsed.get().district()).isEqualTo("南屯區");
	}

	@Test
	void validateZipMatchesDistrictThrowsWhenMismatch() {
		org.assertj.core.api.Assertions.assertThatThrownBy(
				() -> EcpayTaiwanDistrictZip.validateZipMatchesDistrict("403", "臺中市 南屯區 公益路190號"))
				.isInstanceOf(com.yuruicamp.backend.common.exception.BusinessException.class)
				.hasMessageContaining("expected 408");
	}
}
