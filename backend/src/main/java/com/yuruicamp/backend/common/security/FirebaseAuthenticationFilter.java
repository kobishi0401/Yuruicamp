package com.yuruicamp.backend.common.security;

import java.io.IOException;
import java.util.List;
import java.util.ArrayList;

import com.yuruicamp.backend.admin.infrastructure.AdminUserRepository;
import com.yuruicamp.backend.admin.application.AdminPermissionService;
import com.yuruicamp.backend.auth.infrastructure.FirebaseTokenVerifier;
import com.yuruicamp.backend.auth.infrastructure.VerifiedFirebaseToken;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.customer.domain.CustomerStatus;
import com.yuruicamp.backend.customer.infrastructure.CustomerRepository;
import com.yuruicamp.backend.admin.domain.AdminUser;
import com.yuruicamp.backend.customer.domain.Customer;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Reads {@code Authorization: Bearer <Firebase ID Token>}, verifies it, and loads
 * customer or admin principal depending on the request path.
 * <p>
 * Session endpoints authenticate via request body and skip this filter's required auth
 * (they remain permitAll); if a Bearer token is present elsewhere, this filter populates the context.
 */
@Component
public class FirebaseAuthenticationFilter extends OncePerRequestFilter {

	private final FirebaseTokenVerifier tokenVerifier;
	private final CustomerRepository customerRepository;
	private final AdminUserRepository adminUserRepository;
	private final AdminPermissionService adminPermissionService;

	public FirebaseAuthenticationFilter(
			FirebaseTokenVerifier tokenVerifier,
			CustomerRepository customerRepository,
			AdminUserRepository adminUserRepository,
			AdminPermissionService adminPermissionService) {
		this.tokenVerifier = tokenVerifier;
		this.customerRepository = customerRepository;
		this.adminUserRepository = adminUserRepository;
		this.adminPermissionService = adminPermissionService;
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		// n8n uses X-Api-Key + ROLE_N8N; do not reinterpret Bearer as Firebase customer
		String path = request.getRequestURI();
		return path != null && path.startsWith("/api/integrations/n8n/");
	}

	@Override
	protected void doFilterInternal(
			HttpServletRequest request,
			HttpServletResponse response,
			FilterChain filterChain) throws ServletException, IOException {
		String header = request.getHeader(HttpHeaders.AUTHORIZATION);
		if (header != null && header.regionMatches(true, 0, "Bearer ", 0, 7)) {
			String rawToken = header.substring(7).trim();
			if (!rawToken.isEmpty() && SecurityContextHolder.getContext().getAuthentication() == null) {
				try {
					VerifiedFirebaseToken verified = tokenVerifier.verify(rawToken);
					boolean adminPath = request.getRequestURI().startsWith("/api/admin");
					if (adminPath) {
						authenticateAdmin(verified);
					}
					else {
						authenticateCustomer(verified);
					}
				}
				catch (BusinessException ex) {
					// Leave context empty; Security entry-point / method security will reject if needed.
					request.setAttribute("firebaseAuthError", ex.getMessage());
				}
			}
		}
		filterChain.doFilter(request, response);
	}

	private void authenticateCustomer(VerifiedFirebaseToken verified) {
		Customer customer = customerRepository.findByFirebaseUid(verified.uid())
				.or(() -> customerRepository.findByEmailIgnoreCase(verified.email()))
				.orElse(null);
		if (customer == null) {
			return;
		}
		if (customer.getStatus() != CustomerStatus.active || customer.getDeletedAt() != null) {
			return;
		}
		CustomerPrincipal principal = new CustomerPrincipal(
				customer.getId(), customer.getEmail(), customer.getFirebaseUid());
		var auth = new UsernamePasswordAuthenticationToken(
				principal, null, List.of(new SimpleGrantedAuthority("ROLE_CUSTOMER")));
		SecurityContextHolder.getContext().setAuthentication(auth);
	}

	private void authenticateAdmin(VerifiedFirebaseToken verified) {
		AdminUser admin = adminUserRepository.findByEmailIgnoreCase(verified.email()).orElse(null);
		if (admin == null || !admin.isActive()) {
			return;
		}
		if (admin.getFirebaseUid() == null || !admin.getFirebaseUid().equals(verified.uid())) {
			return;
		}
		AdminPrincipal principal = new AdminPrincipal(
				admin.getId(), admin.getEmail(), admin.getRole().name(), admin.getFirebaseUid());
		var authorities = new ArrayList<SimpleGrantedAuthority>();
		authorities.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
		adminPermissionService.resolveEffectivePermissions(admin.getId(), admin.getRole())
				.stream()
				.map(SimpleGrantedAuthority::new)
				.forEach(authorities::add);
		var auth = new UsernamePasswordAuthenticationToken(
				principal, null, authorities);
		SecurityContextHolder.getContext().setAuthentication(auth);
	}
}
