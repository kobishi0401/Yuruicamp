package com.yuruicamp.backend.logistics.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yuruicamp.backend.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

class EcpayTcatAddressFormatterTest {

	@Test
	void compactsTaichungNantunAddressForTcat() {
		var formatted = EcpayTcatAddressFormatter.format("408 臺中市 南屯區 公益路190號");

		assertThat(formatted.zipCode()).isEqualTo("408");
		assertThat(formatted.receiverAddress()).isEqualTo("台中市南屯區公益路190號");
	}

	@Test
	void doesNotChangeZipWhenMismatchWithDistrict() {
		var formatted = EcpayTcatAddressFormatter.format("403 臺中市 南屯區 公益路190號");

		assertThat(formatted.zipCode()).isEqualTo("403");
		assertThat(formatted.receiverAddress()).isEqualTo("台中市南屯區公益路190號");
	}

	@Test
	void compactsSenderAddressForTcat() {
		assertThat(EcpayTcatAddressFormatter.compactAddress("台北市中正區 忠孝西路一段50號"))
				.isEqualTo("台北市中正區忠孝西路一段50號");
		assertThat(EcpayTcatAddressFormatter.compactAddress("臺北市 信義區 信義路"))
				.isEqualTo("台北市信義區信義路");
	}

	@Test
	void missingZipThrowsConflict() {
		assertThatThrownBy(() -> EcpayTcatAddressFormatter.format("臺中市 南屯區 公益路190號"))
				.isInstanceOf(BusinessException.class)
				.hasMessageContaining("postal code");
	}

	@Test
	void tooShortAddressAfterCompactThrowsConflict() {
		assertThatThrownBy(() -> EcpayTcatAddressFormatter.format("100 臺北市"))
				.isInstanceOf(BusinessException.class)
				.hasMessageContaining("Receiver address");
	}
}
