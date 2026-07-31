package com.yuruicamp.backend.auth.application;

import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

import com.yuruicamp.backend.auth.api.CustomerSessionResponse;
import com.yuruicamp.backend.auth.infrastructure.FirebaseTokenVerifier;
import com.yuruicamp.backend.auth.infrastructure.VerifiedFirebaseToken;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.customer.domain.Customer;
import com.yuruicamp.backend.customer.domain.CustomerStatus;
import com.yuruicamp.backend.customer.infrastructure.CustomerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CustomerAuthService {

	private final FirebaseTokenVerifier tokenVerifier;
	private final CustomerRepository customerRepository;
	private final CustomerSessionMapper customerSessionMapper;

	public CustomerAuthService(
			FirebaseTokenVerifier tokenVerifier,
			CustomerRepository customerRepository,
			CustomerSessionMapper customerSessionMapper) {
		this.tokenVerifier = tokenVerifier;
		this.customerRepository = customerRepository;
		this.customerSessionMapper = customerSessionMapper;
	}

	/**
	 * Verify Firebase ID Token, upsert {@code customers}, return profile (no JWT issued).
	 * When the verified token includes a LINE User ID, persist it on the Customer
	 * (reject if already bound to a different Customer).
	 */
	@Transactional
	public CustomerSessionResponse establishSession(String idToken) {
		VerifiedFirebaseToken verified = tokenVerifier.verify(idToken);
		Instant now = Instant.now();

		var byUid = customerRepository.findByFirebaseUid(verified.uid());
		if (byUid.isPresent()) {
			Customer existing = byUid.get();
			assertUsable(existing);
			touchProfile(existing, verified, now);
			bindLineUserId(existing, verified);
			return customerSessionMapper.toResponse(customerRepository.save(existing), false);
		}

		var byEmail = customerRepository.findByEmailIgnoreCase(verified.email());
		if (byEmail.isPresent()) {
			Customer existing = byEmail.get();
			assertUsable(existing);
			if (existing.getFirebaseUid() != null && !existing.getFirebaseUid().equals(verified.uid())) {
				throw new BusinessException(ErrorCode.CONFLICT, "Email already linked to another Firebase account");
			}
			existing.setFirebaseUid(verified.uid());
			touchProfile(existing, verified, now);
			bindLineUserId(existing, verified);
			return customerSessionMapper.toResponse(customerRepository.save(existing), false);
		}

		Customer created = new Customer();
		created.setId(newCustomerId());
		created.setName(verified.displayName());
		created.setEmail(verified.email().toLowerCase(Locale.ROOT));
		created.setRegisteredAt(now);
		created.setPoints(0);
		created.setFirstPurchaseUsed(false);
		created.setAuthProvider(verified.authProvider());
		created.setFirebaseUid(verified.uid());
		created.setAvatarUrl(verified.pictureUrl());
		created.setStatus(CustomerStatus.active);
		created.setCreatedAt(now);
		created.setUpdatedAt(now);
		bindLineUserId(created, verified);
		return customerSessionMapper.toResponse(customerRepository.save(created), true);
	}

	private static void assertUsable(Customer customer) {
		if (customer.getStatus() == CustomerStatus.deleted || customer.getDeletedAt() != null) {
			throw new BusinessException(ErrorCode.FORBIDDEN, "Customer account is deleted");
		}
		if (customer.getStatus() == CustomerStatus.suspended) {
			throw new BusinessException(ErrorCode.CUSTOMER_SUSPENDED, "Customer account is suspended");
		}
	}

	private static void touchProfile(Customer customer, VerifiedFirebaseToken verified, Instant now) {
		if (verified.displayName() != null && !verified.displayName().isBlank()) {
			customer.setName(verified.displayName());
		}
		if (verified.pictureUrl() != null) {
			customer.setAvatarUrl(verified.pictureUrl());
		}
		customer.setAuthProvider(verified.authProvider());
		customer.setUpdatedAt(now);
	}

	/**
	 * Persist LINE User ID only from verified token claims.
	 * Does not clear an existing binding when the token has no LINE identity.
	 */
	private void bindLineUserId(Customer customer, VerifiedFirebaseToken verified) {
		String lineUserId = verified.lineUserId();
		if (lineUserId == null || lineUserId.isBlank()) {
			return;
		}
		String normalized = lineUserId.trim();
		var owner = customerRepository.findByLineUserId(normalized);
		if (owner.isPresent() && !owner.get().getId().equals(customer.getId())) {
			throw new BusinessException(
					ErrorCode.LINE_USER_ID_CONFLICT,
					"This LINE account is already linked to another member");
		}
		customer.setLineUserId(normalized);
	}

	private static String newCustomerId() {
		return UUID.randomUUID().toString().replace("-", "");
	}
}
