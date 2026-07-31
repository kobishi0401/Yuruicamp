package com.yuruicamp.backend.integration.n8n.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yuruicamp.backend.common.api.ApiErrorBody;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.config.YuruicampProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Authenticates n8n server-to-server calls with {@code X-Api-Key}.
 * Separate from member Firebase Bearer and Admin RBAC.
 */
@Component
public class N8nApiKeyAuthenticationFilter extends OncePerRequestFilter {

	public static final String API_KEY_HEADER = "X-Api-Key";
	private static final String N8N_PATH_PREFIX = "/api/integrations/n8n/";

	private final YuruicampProperties properties;
	private final ObjectMapper objectMapper;

	public N8nApiKeyAuthenticationFilter(YuruicampProperties properties, ObjectMapper objectMapper) {
		this.properties = properties;
		this.objectMapper = objectMapper;
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		String path = request.getRequestURI();
		return path == null || !path.startsWith(N8N_PATH_PREFIX);
	}

	@Override
	protected void doFilterInternal(
			HttpServletRequest request,
			HttpServletResponse response,
			FilterChain filterChain) throws ServletException, IOException {
		String configured = properties.getN8n().getApiKey();
		String presented = request.getHeader(API_KEY_HEADER);
		if (!StringUtils.hasText(configured) || !StringUtils.hasText(presented)
				|| !constantTimeEquals(configured.trim(), presented.trim())) {
			writeUnauthorized(response, "Invalid or missing n8n API key");
			return;
		}
		var authentication = new UsernamePasswordAuthenticationToken(
				"n8n",
				null,
				List.of(new SimpleGrantedAuthority("ROLE_N8N")));
		SecurityContextHolder.getContext().setAuthentication(authentication);
		filterChain.doFilter(request, response);
	}

	private void writeUnauthorized(HttpServletResponse response, String message) throws IOException {
		response.setStatus(ErrorCode.UNAUTHORIZED.getStatus().value());
		response.setContentType(MediaType.APPLICATION_JSON_VALUE);
		objectMapper.writeValue(
				response.getOutputStream(),
				ApiErrorBody.of(ErrorCode.UNAUTHORIZED.code(), message));
	}

	/** Avoid short-circuit timing leaks when comparing API keys. */
	private static boolean constantTimeEquals(String expected, String actual) {
		return MessageDigest.isEqual(
				expected.getBytes(StandardCharsets.UTF_8),
				actual.getBytes(StandardCharsets.UTF_8));
	}
}
