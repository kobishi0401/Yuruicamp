package com.yuruicamp.backend.config;

import java.util.Arrays;
import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

	@Value("${yuruicamp.review-upload-dir:./data/uploads/reviews}")
	private String reviewUploadDirectory;

	@Override
	public void addResourceHandlers(ResourceHandlerRegistry registry) {
		java.nio.file.Path uploadRoot = java.nio.file.Path.of(reviewUploadDirectory)
				.toAbsolutePath()
				.normalize()
				.getParent();
		registry.addResourceHandler("/assets/uploads/**")
				.addResourceLocations(uploadRoot.toUri().toString());
	}

	@Bean
	CorsConfigurationSource corsConfigurationSource(YuruicampProperties properties) {
		// 用途：建立整個後端共用的 CORS 規則，讓允許的前端來源可以呼叫 API。
		// 核心重點：支援設定檔清單及逗號分隔環境變數；未設定時只開放本機 Vite 開發來源。
		List<String> origins = properties.getCors().getAllowedOrigins();
		if (origins == null || origins.isEmpty()) {
			origins = List.of("http://127.0.0.1:5173", "http://localhost:5173");
		}
		else if (origins.size() == 1 && origins.getFirst().contains(",")) {
			// 支援單一環境變數形式，例如 "http://a,http://b"。
			origins = Arrays.stream(origins.getFirst().split(","))
					.map(String::trim)
					.filter(s -> !s.isEmpty())
					.toList();
		}

		CorsConfiguration config = new CorsConfiguration();
		config.setAllowedOrigins(origins);
		config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
		config.setAllowedHeaders(List.of("*"));
		config.setAllowCredentials(true);
		config.setMaxAge(3600L);

		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();

		// 綠界 OrderResultURL／Notify 由 payment*.ecpay.com.tw 或綠界伺服器 POST；
		// 與 Vite 前端 Origin 不同，需單獨規則，否則瀏覽器導回會 403 Invalid CORS request。
		CorsConfiguration ecpayCors = new CorsConfiguration();
		ecpayCors.setAllowedOriginPatterns(List.of("*"));
		ecpayCors.setAllowedMethods(List.of("GET", "POST", "OPTIONS"));
		ecpayCors.setAllowedHeaders(List.of("*"));
		ecpayCors.setAllowCredentials(false);
		ecpayCors.setMaxAge(3600L);
		source.registerCorsConfiguration("/api/payments/ecpay/**", ecpayCors);

		source.registerCorsConfiguration("/**", config);
		return source;
	}
}
