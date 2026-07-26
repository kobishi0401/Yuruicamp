package com.yuruicamp.backend.common.admin;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AdminStatusLabelsTest {

	@Test
	void mapsBookingStatusToChinese() {
		assertThat(AdminStatusLabels.bookingHistoryLabel("pending", "Booking checkout created"))
				.isEqualTo("待確認");
		assertThat(AdminStatusLabels.bookingHistoryLabel("confirmed", null)).isEqualTo("已確認");
	}

	@Test
	void notePaymentSemanticsOverrideStatus() {
		assertThat(AdminStatusLabels.bookingHistoryLabel("pending", "ECPay notify: payment marked paid"))
				.isEqualTo("已付款");
	}

	@Test
	void noteRefundSemanticsWinOverPayment() {
		assertThat(AdminStatusLabels.orderHistoryLabel("cancelled", "Full refund after admin cancel"))
				.isEqualTo("已退款");
	}

	@Test
	void mapsOrderStatusToChinese() {
		assertThat(AdminStatusLabels.orderHistoryLabel("unshipped", "Checkout draft created"))
				.isEqualTo("待出貨");
	}
}
