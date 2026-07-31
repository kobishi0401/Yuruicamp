package com.yuruicamp.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.env.PropertySource;

/**
 * Guards Trade Document CJK: sender address / goods name defaults must load as Unicode
 * (YAML UTF-8), not mojibake from mis-decoded .properties.
 */
class EcpayLogisticsConfigUnicodeTest {

	@Test
	void applicationYamlDefaultsContainReadableChinese() throws IOException {
		ClassPathResource resource = new ClassPathResource("application.yml");
		List<PropertySource<?>> sources = new YamlPropertySourceLoader().load("applicationYml", resource);
		assertThat(sources).isNotEmpty();

		StandardEnvironment env = new StandardEnvironment();
		for (PropertySource<?> source : sources) {
			env.getPropertySources().addFirst(source);
		}

		assertThat(env.getProperty("yuruicamp.ecpay-logistics.sender-address"))
				.isEqualTo("台北市中正區忠孝西路一段50號");
		assertThat(env.getProperty("yuruicamp.ecpay-logistics.goods-name"))
				.isEqualTo("Yuruicamp商品");
	}
}
