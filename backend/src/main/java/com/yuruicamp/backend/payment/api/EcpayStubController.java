package com.yuruicamp.backend.payment.api;

import java.util.LinkedHashMap;
import java.util.Map;

import com.yuruicamp.backend.common.api.ApiResponse;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.config.YuruicampProperties;
import com.yuruicamp.backend.payment.application.EcpayReturnService;
import com.yuruicamp.backend.payment.application.PaymentNotifyService;
import com.yuruicamp.backend.payment.domain.PaymentNotifyOutcome;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 本機 stub：模擬綠界付款頁與 simulate-paid（D-1／D-2）。
 * {@code yuruicamp.ecpay.stub=false} 時一律 404。
 */
@RestController
@RequestMapping("/api/payments/ecpay/stub")
public class EcpayStubController {

	private final YuruicampProperties properties;
	private final PaymentNotifyService notifyService;
	private final EcpayReturnService returnService;

	public EcpayStubController(
			YuruicampProperties properties,
			PaymentNotifyService notifyService,
			EcpayReturnService returnService) {
		this.properties = properties;
		this.notifyService = notifyService;
		this.returnService = returnService;
	}

	@PostMapping("/simulate-paid")
	public ApiResponse<SimulatePaidResponse> simulatePaid(@Valid @RequestBody SimulatePaidRequest request) {
		requireStub();
		PaymentNotifyOutcome outcome = notifyService.simulatePaid(request.orderId(), request.bookingId());
		return ApiResponse.ok(new SimulatePaidResponse(outcome.name()));
	}

	/**
	 * 假綠界付款頁：前端 form POST 到這裡 → Notify 入帳 → 302 到前端成功／失敗頁。
	 */
	@PostMapping(value = "/aio-checkout", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
	public ResponseEntity<Void> aioCheckout(@RequestParam MultiValueMap<String, String> form) {
		requireStub();
		Map<String, String> params = toSingleValueMap(form);
		String customField1 = params.getOrDefault("CustomField1", "");
		String orderId = null;
		String bookingId = null;
		if (customField1.startsWith("order:")) {
			orderId = customField1.substring("order:".length()).trim();
		}
		else if (customField1.startsWith("booking:")) {
			bookingId = customField1.substring("booking:".length()).trim();
		}
		else {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR,
					"CustomField1 must be order:{id} or booking:{id}");
		}

		PaymentNotifyOutcome outcome = notifyService.simulatePaid(orderId, bookingId);
		Map<String, String> returnParams = new LinkedHashMap<>();
		returnParams.put("CustomField1", customField1);
		returnParams.put("MerchantTradeNo", params.getOrDefault("MerchantTradeNo", ""));
		returnParams.put("RtnCode", outcome == PaymentNotifyOutcome.SUCCESS
				|| outcome == PaymentNotifyOutcome.IGNORED_DUPLICATE ? "1" : "0");
		returnParams.put("RtnMsg", outcome.name());

		String location = returnService.resolveFrontendRedirect(returnParams);
		return ResponseEntity.status(HttpStatus.FOUND)
				.header("Location", location)
				.build();
	}

	private void requireStub() {
		if (!properties.getEcpay().isStub()) {
			throw new BusinessException(ErrorCode.NOT_FOUND, "ECPay stub is disabled");
		}
	}

	private static Map<String, String> toSingleValueMap(MultiValueMap<String, String> form) {
		Map<String, String> params = new LinkedHashMap<>();
		if (form == null) {
			return params;
		}
		form.forEach((key, values) -> {
			if (key != null && values != null && !values.isEmpty() && values.get(0) != null) {
				params.put(key, values.get(0));
			}
		});
		return params;
	}

	public record SimulatePaidRequest(String orderId, String bookingId) {

		@AssertTrue(message = "Provide exactly one of orderId or bookingId")
		public boolean isXorTarget() {
			boolean hasOrder = orderId != null && !orderId.isBlank();
			boolean hasBooking = bookingId != null && !bookingId.isBlank();
			return hasOrder != hasBooking;
		}
	}

	public record SimulatePaidResponse(String outcome) {
	}
}
