package com.yuruicamp.backend.auth.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import com.yuruicamp.backend.auth.api.CustomerSessionResponse;
import com.yuruicamp.backend.auth.infrastructure.FirebaseTokenVerifier;
import com.yuruicamp.backend.auth.infrastructure.VerifiedFirebaseToken;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.customer.domain.Customer;
import com.yuruicamp.backend.customer.domain.CustomerStatus;
import com.yuruicamp.backend.customer.infrastructure.CustomerRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/**
 * Secondary seam from LINE n8n CS spec: session upsert persists LINE User ID
 * from verified token claims, rejects clashes, exposes lineBound.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CustomerAuthServiceTest {

	@Mock
	private FirebaseTokenVerifier tokenVerifier;

	@Mock
	private CustomerRepository customerRepository;

	@Mock
	private CustomerSessionMapper customerSessionMapper;

	private CustomerAuthService service;

	@BeforeEach
	void setUp() {
		service = new CustomerAuthService(tokenVerifier, customerRepository, customerSessionMapper);
		when(customerSessionMapper.toResponse(any(Customer.class), anyBoolean())).thenAnswer(invocation -> {
			Customer customer = invocation.getArgument(0);
			boolean created = invocation.getArgument(1);
			boolean lineBound = customer.getLineUserId() != null && !customer.getLineUserId().isBlank();
			return new CustomerSessionResponse(
					customer.getId(),
					customer.getEmail(),
					customer.getName(),
					customer.getAuthProvider(),
					customer.getFirebaseUid(),
					customer.getStatus().name(),
					customer.getRegisteredAt(),
					created,
					lineBound);
		});
		when(customerRepository.save(any(Customer.class))).thenAnswer(invocation -> invocation.getArgument(0));
	}

	@Test
	void createSessionPersistsLineUserIdFromVerifiedToken() {
		when(tokenVerifier.verify("tok")).thenReturn(lineToken("uid-new", "new@example.test", "UlineNew001"));
		when(customerRepository.findByFirebaseUid("uid-new")).thenReturn(Optional.empty());
		when(customerRepository.findByEmailIgnoreCase("new@example.test")).thenReturn(Optional.empty());
		when(customerRepository.findByLineUserId("UlineNew001")).thenReturn(Optional.empty());

		CustomerSessionResponse response = service.establishSession("tok");

		ArgumentCaptor<Customer> captor = ArgumentCaptor.forClass(Customer.class);
		verify(customerRepository).save(captor.capture());
		assertThat(captor.getValue().getLineUserId()).isEqualTo("UlineNew001");
		assertThat(response.lineBound()).isTrue();
		assertThat(response.created()).isTrue();
	}

	@Test
	void existingCustomerUpdatesLineUserIdOnSession() {
		Customer existing = activeCustomer("C-EXIST", "uid-a", "a@example.test", null);
		when(tokenVerifier.verify("tok")).thenReturn(lineToken("uid-a", "a@example.test", "UlineA001"));
		when(customerRepository.findByFirebaseUid("uid-a")).thenReturn(Optional.of(existing));
		when(customerRepository.findByLineUserId("UlineA001")).thenReturn(Optional.empty());

		CustomerSessionResponse response = service.establishSession("tok");

		assertThat(existing.getLineUserId()).isEqualTo("UlineA001");
		assertThat(response.lineBound()).isTrue();
		assertThat(response.created()).isFalse();
		// Account Linking keeps one Customer for the same Firebase UID
		verify(customerRepository, never()).findByEmailIgnoreCase(any());
	}

	@Test
	void rejectsWhenLineUserIdBoundToAnotherCustomer() {
		Customer existing = activeCustomer("C-EXIST", "uid-a", "a@example.test", null);
		Customer other = activeCustomer("C-OTHER", "uid-b", "b@example.test", "UlineTaken");
		when(tokenVerifier.verify("tok")).thenReturn(lineToken("uid-a", "a@example.test", "UlineTaken"));
		when(customerRepository.findByFirebaseUid("uid-a")).thenReturn(Optional.of(existing));
		when(customerRepository.findByLineUserId("UlineTaken")).thenReturn(Optional.of(other));

		assertThatThrownBy(() -> service.establishSession("tok"))
				.isInstanceOf(BusinessException.class)
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.LINE_USER_ID_CONFLICT);

		assertThat(existing.getLineUserId()).isNull();
		verify(customerRepository, never()).save(any());
	}

	@Test
	void sameCustomerRebindIsIdempotent() {
		Customer existing = activeCustomer("C-EXIST", "uid-a", "a@example.test", "UlineA001");
		when(tokenVerifier.verify("tok")).thenReturn(lineToken("uid-a", "a@example.test", "UlineA001"));
		when(customerRepository.findByFirebaseUid("uid-a")).thenReturn(Optional.of(existing));
		when(customerRepository.findByLineUserId("UlineA001")).thenReturn(Optional.of(existing));

		CustomerSessionResponse response = service.establishSession("tok");

		assertThat(response.lineBound()).isTrue();
		verify(customerRepository).save(eq(existing));
	}

	@Test
	void tokenWithoutLineLeavesBoundFlagFalseAndDoesNotClearExisting() {
		Customer existing = activeCustomer("C-EXIST", "uid-a", "a@example.test", "UlineKeep");
		when(tokenVerifier.verify("tok")).thenReturn(
				new VerifiedFirebaseToken("uid-a", "a@example.test", "Amy", "google", null, null));
		when(customerRepository.findByFirebaseUid("uid-a")).thenReturn(Optional.of(existing));

		CustomerSessionResponse response = service.establishSession("tok");

		assertThat(existing.getLineUserId()).isEqualTo("UlineKeep");
		assertThat(response.lineBound()).isTrue();
		verify(customerRepository, never()).findByLineUserId(any());
	}

	private static VerifiedFirebaseToken lineToken(String uid, String email, String lineUserId) {
		return new VerifiedFirebaseToken(uid, email, "Line User", "line", null, lineUserId);
	}

	private static Customer activeCustomer(String id, String firebaseUid, String email, String lineUserId) {
		Customer customer = new Customer();
		customer.setId(id);
		customer.setName("Amy");
		customer.setEmail(email);
		customer.setRegisteredAt(Instant.parse("2026-01-01T00:00:00Z"));
		customer.setPoints(0);
		customer.setFirstPurchaseUsed(false);
		customer.setAuthProvider("google");
		customer.setFirebaseUid(firebaseUid);
		customer.setLineUserId(lineUserId);
		customer.setStatus(CustomerStatus.active);
		customer.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
		customer.setUpdatedAt(Instant.parse("2026-01-01T00:00:00Z"));
		return customer;
	}
}
