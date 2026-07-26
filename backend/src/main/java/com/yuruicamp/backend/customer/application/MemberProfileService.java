package com.yuruicamp.backend.customer.application;

import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneId;

import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.customer.api.MemberProfileResponse;
import com.yuruicamp.backend.customer.api.MemberProfileUpdateRequest;
import com.yuruicamp.backend.customer.domain.Customer;
import com.yuruicamp.backend.customer.domain.CustomerStatus;
import com.yuruicamp.backend.customer.infrastructure.CustomerRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MemberProfileService {

	private static final ZoneId TAIPEI = ZoneId.of("Asia/Taipei");

	private final CustomerRepository customerRepository;

	public MemberProfileService(CustomerRepository customerRepository) {
		this.customerRepository = customerRepository;
	}

	@Transactional(readOnly = true)
	public MemberProfileResponse getProfile(String customerId) {
		Customer customer = activeCustomer(customerId);
		return toResponse(customer);
	}

	@Transactional
	public MemberProfileResponse updateProfile(String customerId, MemberProfileUpdateRequest request) {
		Customer customer = customerRepository.findByIdForUpdate(customerId)
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Customer not found"));
		assertActive(customer);

		if (request.birthday() != null) {
			validateAdultBirthday(request.birthday());
		}

		customer.setName(request.name().trim());
		customer.setPhone(request.phone().trim());
		customer.setBirthday(request.birthday());
		customer.setUpdatedAt(java.time.Instant.now());

		return toResponse(customer);
	}

	private Customer activeCustomer(String customerId) {
		Customer customer = customerRepository.findById(customerId)
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Customer not found"));
		assertActive(customer);
		return customer;
	}

	private void assertActive(Customer customer) {
		if (customer.getStatus() != CustomerStatus.active || customer.getDeletedAt() != null) {
			throw new BusinessException(ErrorCode.CONFLICT, "Customer is not active");
		}
	}

	private void validateAdultBirthday(LocalDate birthday) {
		int age = Period.between(birthday, LocalDate.now(TAIPEI)).getYears();
		if (age < 18) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR, "Member must be at least 18 years old");
		}
	}

	private MemberProfileResponse toResponse(Customer customer) {
		return new MemberProfileResponse(
				customer.getName(),
				customer.getEmail(),
				customer.getPhone(),
				customer.getBirthday(),
				customer.getAuthProvider(),
				customer.getRegisteredAt());
	}
}
