package com.yuruicamp.backend.order.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.order.infrastructure.AdminOrderCommandRepository;
import com.yuruicamp.backend.order.infrastructure.AdminOrderReadRepository;
import com.yuruicamp.backend.payment.application.PaymentRefundService;
import com.yuruicamp.backend.logistics.application.EcpayLogisticsCreateService;
import com.yuruicamp.backend.logistics.application.EcpayLogisticsPrintService;
import com.yuruicamp.backend.order.api.AdminLogisticsPrintLaunchResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class AdminOrderServiceTest {

	@Mock
	private AdminOrderReadRepository readRepository;

	@Mock
	private AdminOrderCommandRepository commandRepository;

	@Mock
	private PaymentRefundService paymentRefundService;

	@Mock
	private EcpayLogisticsCreateService logisticsCreateService;

	@Mock
	private EcpayLogisticsPrintService logisticsPrintService;

	private AdminOrderService service;

	@BeforeEach
	void setUp() {
		service = new AdminOrderService(
				readRepository, commandRepository, paymentRefundService,
				logisticsCreateService, logisticsPrintService);
	}

	@Test
	void paidOnlineOrderCanBeShipped() {
		when(commandRepository.lockById("O1")).thenReturn(Optional.of(state("unshipped", "ecpay-credit", "paid")));
		when(readRepository.findDetail("O1")).thenReturn(Optional.of(detail("shipped")));

		service.ship("O1", "A1", null);

		verify(logisticsCreateService).createShipment("O1");
		verify(commandRepository).updateStatus(eq("O1"), eq("shipped"), any(Instant.class));
		verify(commandRepository).addHistory(eq("O1"), eq("shipped"), any(Instant.class), eq("A1"), any());
	}

	@Test
	void unpaidOnlineOrderCannotBeShipped() {
		when(commandRepository.lockById("O1")).thenReturn(Optional.of(state("unshipped", "ecpay-credit", "unpaid")));

		assertThatThrownBy(() -> service.ship("O1", "A1", null))
				.isInstanceOf(BusinessException.class);
	}

	@Test
	void unpaidCodOrderCanBeCancelledWithoutRefund() {
		when(commandRepository.lockById("O1")).thenReturn(Optional.of(state("unshipped", "cod", "unpaid")));
		when(readRepository.findDetail("O1")).thenReturn(Optional.of(detail("cancelled")));

		service.cancel("O1", "A1", "客人取消");

		verify(paymentRefundService, never()).refundOrderFully(any(), any());
		verify(commandRepository).cancelUnpaid(eq("O1"), any(Instant.class));
		verify(commandRepository).releaseActiveReservations(eq("O1"), any(Instant.class));
		verify(commandRepository).clearOrderCouponsForUnpaidCancel(eq("O1"), any(Instant.class));
	}

	@Test
	void paidOnlineOrderCancelsAfterRefund() {
		when(commandRepository.lockById("O1")).thenReturn(Optional.of(state("unshipped", "ecpay-credit", "paid")));
		when(commandRepository.addHistory(eq("O1"), eq("cancelled"), any(Instant.class), eq("A1"), any()))
				.thenReturn(99L);
		when(readRepository.findDetail("O1")).thenReturn(Optional.of(detail("cancelled")));

		service.cancel("O1", "A1", null);

		verify(paymentRefundService).refundOrderFully(eq("O1"), eq(BigDecimal.TEN));
		verify(commandRepository).cancelPaidAndRefunded(eq("O1"), any(Instant.class));
		verify(commandRepository).rollbackConsumedCouponClaim("O1");
		verify(commandRepository).addRefundEvent(eq("O1"), eq(99L), any(Instant.class), eq("A1"), any());
	}

	@Test
	void shippedOrderCannotBeCancelled() {
		when(commandRepository.lockById("O1")).thenReturn(Optional.of(state("shipped", "ecpay-credit", "paid")));

		assertThatThrownBy(() -> service.cancel("O1", "A1", null))
				.isInstanceOf(BusinessException.class);
		verify(paymentRefundService, never()).refundOrderFully(any(), any());
	}

	@Test
	void printLogisticsLabelDelegatesWithoutMutatingOrder() {
		var launch = new AdminLogisticsPrintLaunchResponse(
				"O1",
				"https://logistics-stage.ecpay.com.tw/helper/printTradeDocument",
				Map.of("MerchantID", "2000132", "AllPayLogisticsID", "1234567", "CheckMacValue", "ABC"));
		when(logisticsPrintService.launchPrintTradeDocument("O1")).thenReturn(launch);

		AdminLogisticsPrintLaunchResponse result = service.printLogisticsLabel("O1");

		assertThat(result.actionUrl()).contains("printTradeDocument");
		assertThat(result.fields()).containsEntry("AllPayLogisticsID", "1234567");
		verify(logisticsPrintService).launchPrintTradeDocument("O1");
		verify(commandRepository, never()).updateStatus(any(), any(), any());
		verify(commandRepository, never()).addHistory(any(), any(), any(), any(), any());
	}

	private static AdminOrderCommandRepository.OrderState state(String status, String method, String payment) {
		return new AdminOrderCommandRepository.OrderState(
				"O1", "C1", status, method, payment, "none", BigDecimal.TEN);
	}

	private static AdminOrderReadRepository.DetailRow detail(String status) {
		return new AdminOrderReadRepository.DetailRow(
				"O1", "ORD-0001", "C1", "Customer", "active", "Buyer", "buyer@example.test",
				"Recipient", "0900", "Address", java.math.BigDecimal.ZERO,
				java.math.BigDecimal.ZERO, java.math.BigDecimal.ZERO, java.math.BigDecimal.ZERO,
				"ecpay-credit", "paid", "none", status, null, Instant.EPOCH, Instant.EPOCH, Instant.EPOCH,
				"delivery", "1234567", "300", "訂單處理中", Instant.EPOCH);
	}
}
