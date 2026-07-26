package com.yuruicamp.backend.booking.application;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Optional;

import com.yuruicamp.backend.booking.infrastructure.AdminBookingCommandRepository;
import com.yuruicamp.backend.booking.infrastructure.AdminBookingReadRepository;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.payment.application.PaymentRefundService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class AdminBookingServiceTest {

	@Mock
	private AdminBookingReadRepository readRepository;

	@Mock
	private AdminBookingCommandRepository commandRepository;

	@Mock
	private PaymentRefundService paymentRefundService;

	private AdminBookingService service;

	@BeforeEach
	void setUp() {
		service = new AdminBookingService(readRepository, commandRepository, paymentRefundService,
				Clock.fixed(Instant.parse("2026-07-21T00:00:00Z"), ZoneOffset.UTC));
	}

	@Test
	void unpaidBookingCannotBeConfirmed() {
		when(commandRepository.lockById("B1")).thenReturn(Optional.of(
				state("pending", "unpaid")));

		assertThatThrownBy(() -> service.confirm("B1", "A1", null))
				.isInstanceOf(BusinessException.class);
	}

	@Test
	void paidConfirmedBookingAfterCheckoutCanBeCompleted() {
		when(commandRepository.lockById("B1")).thenReturn(Optional.of(
				state("confirmed", "paid")));
		when(readRepository.findDetail("B1")).thenReturn(Optional.of(detail()));

		service.complete("B1", "A1", null);

		verify(commandRepository).fulfillRentalReservations(eq("B1"), any(Instant.class));
	}

	@Test
	void paidPendingBookingCanBeCancelledWithRefund() {
		when(commandRepository.lockById("B1")).thenReturn(Optional.of(state("pending", "paid")));
		when(readRepository.findDetail("B1")).thenReturn(Optional.of(detail()));

		service.cancel("B1", "A1", "客服取消");

		verify(paymentRefundService).refundBookingFully(eq("B1"), eq(BigDecimal.TEN));
		verify(commandRepository).cancelPaidAndRefunded(eq("B1"), any(Instant.class));
		verify(commandRepository).releaseActiveRentalReservations(eq("B1"), any(Instant.class));
	}

	@Test
	void unpaidBookingCannotUseAdminCancel() {
		when(commandRepository.lockById("B1")).thenReturn(Optional.of(state("pending", "unpaid")));

		assertThatThrownBy(() -> service.cancel("B1", "A1", null))
				.isInstanceOf(BusinessException.class);
		verify(paymentRefundService, never()).refundBookingFully(any(), any());
	}

	private static AdminBookingCommandRepository.BookingState state(String status, String payment) {
		return new AdminBookingCommandRepository.BookingState(
				"B1", status, payment, LocalDate.of(2026, 7, 20), BigDecimal.TEN);
	}

	private static AdminBookingReadRepository.DetailRow detail() {
		return new AdminBookingReadRepository.DetailRow(
				"B1", "BK-0001", "C1", "Customer", "active", "C002", "Camp", "北部",
				LocalDate.of(2026, 7, 18), LocalDate.of(2026, 7, 20), 2, 2, 0,
				java.math.BigDecimal.ZERO, java.math.BigDecimal.ZERO, java.math.BigDecimal.ZERO,
				java.math.BigDecimal.ZERO, "ecpay-credit", "paid", Instant.EPOCH,
				"completed", null, null, null, null, Instant.EPOCH, Instant.EPOCH);
	}
}
