package com.yuruicamp.backend.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yuruicamp.backend.common.api.ApiErrorBody;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.common.security.FirebaseAuthenticationFilter;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

	/**
	 * Disable the default generated in-memory user; auth is Firebase-only.
	 */
	@Bean
	UserDetailsService firebaseOnlyUserDetailsService() {
		return username -> {
			throw new UsernameNotFoundException("Password login disabled; use Firebase ID Token");
		};
	}

	@Bean
	SecurityFilterChain securityFilterChain(
			HttpSecurity http,
			FirebaseAuthenticationFilter firebaseAuthenticationFilter,
			ObjectMapper objectMapper) throws Exception {
		http
				.csrf(csrf -> csrf.disable())
				.cors(Customizer.withDefaults())
				.sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.authorizeHttpRequests(auth -> auth
						.requestMatchers(
								"/api/health",
								"/v3/api-docs/**",
								"/swagger-ui/**",
								"/swagger-ui.html")
						.permitAll()
						.requestMatchers(HttpMethod.POST, "/api/auth/firebase/session").permitAll()
						.requestMatchers(HttpMethod.POST, "/api/admin/auth/firebase/session").permitAll()
						// 線 B：商品公開讀（Product API Contract v0.1）— 不必登入
						.requestMatchers(HttpMethod.GET, "/api/products", "/api/products/**").permitAll()
						.requestMatchers(HttpMethod.GET, "/api/branches").permitAll()
						// 首頁合作品牌為公開行銷資料，不要求會員登入。
						.requestMatchers(HttpMethod.GET, "/api/brands").permitAll()
						// 線 F：只公開有效優惠券主檔，會員 claim 仍需登入。
						.requestMatchers(HttpMethod.GET, "/api/coupons").permitAll()
						// 線 E-1：只開放明確的營區、裝備、政策與公休讀取端點。
						.requestMatchers(HttpMethod.GET,
								"/api/booking/campgrounds",
								"/api/booking/campgrounds/**",
								"/api/booking/equipment",
								"/api/booking/policy",
								"/api/booking/closures")
						.permitAll()
						// 線 E-2：可用性只查詢，不建立預約或鎖位，因此允許公開呼叫。
						.requestMatchers(HttpMethod.POST, "/api/booking/check-availability").permitAll()
						// 線 D：綠界 Notify 是 Server-to-Server，沒有會員 Bearer；靠 CheckMacValue 驗真。
						.requestMatchers(HttpMethod.POST, "/api/payments/ecpay/notify").permitAll()
						// D-4：瀏覽器從綠界導回，無 Bearer。
						.requestMatchers(HttpMethod.GET, "/api/payments/ecpay/return").permitAll()
						.requestMatchers(HttpMethod.POST, "/api/payments/ecpay/return").permitAll()
						// 本機 stub 模擬付款（stub=false 時 Controller 會拒絕）。
						.requestMatchers("/api/payments/ecpay/stub/**").permitAll()
						// 綠界物流：地圖選店結果 + 物流狀態 notify（CMV-MD5）。
						.requestMatchers(HttpMethod.POST, "/api/logistics/ecpay/map-result").permitAll()
						.requestMatchers(HttpMethod.POST, "/api/logistics/ecpay/notify").permitAll()
						.requestMatchers("/api/logistics/ecpay/stub/**").permitAll()
						// 管理員先通過白名單身分，再由 Controller 的方法權限檢查細項權限。
						.requestMatchers("/api/admin/**").hasRole("ADMIN")
						// Other /api/** still require customer auth until more public GETs are added
						.requestMatchers("/api/**").hasRole("CUSTOMER")
						.anyRequest().authenticated())
				.exceptionHandling(ex -> ex
						.authenticationEntryPoint((request, response, authException) ->
								writeError(response, objectMapper, ErrorCode.UNAUTHORIZED,
										authException.getMessage() != null
												? authException.getMessage()
												: "Authentication required"))
						.accessDeniedHandler((request, response, accessDeniedException) ->
								writeError(response, objectMapper, ErrorCode.FORBIDDEN, "Access denied")))
				.addFilterBefore(firebaseAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
		return http.build();
	}

	private static void writeError(
			HttpServletResponse response,
			ObjectMapper objectMapper,
			ErrorCode code,
			String message) throws java.io.IOException {
		response.setStatus(code.getStatus().value());
		response.setContentType(MediaType.APPLICATION_JSON_VALUE);
		objectMapper.writeValue(response.getOutputStream(), ApiErrorBody.of(code.code(), message));
	}
}
