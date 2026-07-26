package com.yuruicamp.backend.customer.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;

import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.customer.api.MemberProfileUpdateRequest;
import com.yuruicamp.backend.customer.domain.Customer;
import com.yuruicamp.backend.customer.domain.CustomerStatus;
import com.yuruicamp.backend.customer.infrastructure.CustomerRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class MemberProfileServiceTest {

	@Mock
	private CustomerRepository customerRepository;

	private MemberProfileService service;

	@BeforeEach
	void setUp() {
		service = new MemberProfileService(customerRepository);
	}

	@Test
	void getProfileReturnsActiveCustomerFields() {
		Customer customer = activeCustomer();
		when(customerRepository.findById("C001")).thenReturn(Optional.of(customer));

		var response = service.getProfile("C001");

		assertThat(response.name()).isEqualTo("Amy");
		assertThat(response.phone()).isEqualTo("0912345678");
		assertThat(response.email()).isEqualTo("amy@example.test");
		assertThat(response.authProvider()).isEqualTo("google");
	}

	@Test
	void updateProfilePersistsAllowedFields() {
		Customer customer = activeCustomer();
		when(customerRepository.findByIdForUpdate("C001")).thenReturn(Optional.of(customer));

		var response = service.updateProfile(
				"C001",
				new MemberProfileUpdateRequest("Amy Lee", "0987654321", LocalDate.of(1995, 5, 20)));

		assertThat(response.name()).isEqualTo("Amy Lee");
		assertThat(response.phone()).isEqualTo("0987654321");
		assertThat(response.birthday()).isEqualTo(LocalDate.of(1995, 5, 20));
		assertThat(customer.getName()).isEqualTo("Amy Lee");
	}

	@Test
	void rejectsUnderageBirthday() {
		when(customerRepository.findByIdForUpdate("C001"))
				.thenReturn(Optional.of(activeCustomer()));

		assertThatThrownBy(() -> service.updateProfile(
						"C001",
						new MemberProfileUpdateRequest(
								"Amy",
								"0912345678",
								LocalDate.now(ZoneId.of("Asia/Taipei")).minusYears(10))))
				.isInstanceOf(BusinessException.class)
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.VALIDATION_ERROR);
	}

	private Customer activeCustomer() {
		Customer customer = new Customer();
		customer.setId("C001");
		customer.setName("Amy");
		customer.setPhone("0912345678");
		customer.setEmail("amy@example.test");
		customer.setAuthProvider("google");
		customer.setRegisteredAt(Instant.parse("2026-01-01T00:00:00Z"));
		customer.setStatus(CustomerStatus.active);
		return customer;
	}
}
