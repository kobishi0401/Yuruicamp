package com.yuruicamp.backend.auth.application;

import com.yuruicamp.backend.auth.api.CustomerSessionResponse;
import com.yuruicamp.backend.customer.domain.Customer;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface CustomerSessionMapper {

	@Mapping(target = "customerId", source = "customer.id")
	@Mapping(target = "email", source = "customer.email")
	@Mapping(target = "name", source = "customer.name")
	@Mapping(target = "authProvider", source = "customer.authProvider")
	@Mapping(target = "firebaseUid", source = "customer.firebaseUid")
	@Mapping(target = "status", expression = "java(customer.getStatus().name())")
	@Mapping(target = "created", source = "created")
	@Mapping(
			target = "lineBound",
			expression = "java(customer.getLineUserId() != null && !customer.getLineUserId().isBlank())")
	CustomerSessionResponse toResponse(Customer customer, boolean created);
}
