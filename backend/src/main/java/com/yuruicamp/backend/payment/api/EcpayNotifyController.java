package com.yuruicamp.backend.payment.api;

import java.util.LinkedHashMap;
import java.util.Map;

import com.yuruicamp.backend.payment.application.PaymentNotifyService;
import com.yuruicamp.backend.payment.domain.PaymentNotifyOutcome;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 綠界背景通知（付款真相）。必須回純文字 {@code 1|OK}，否則綠界會重送。
 */
@RestController
@RequestMapping("/api/payments/ecpay")
public class EcpayNotifyController {

	public static final String ACK_OK = "1|OK";

	private final PaymentNotifyService notifyService;

	public EcpayNotifyController(PaymentNotifyService notifyService) {
		this.notifyService = notifyService;
	}

	@PostMapping(value = "/notify", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
	public ResponseEntity<String> notify(@RequestParam MultiValueMap<String, String> form) {
		PaymentNotifyOutcome outcome = notifyService.handleNotify(toSingleValueMap(form));
		if (outcome == PaymentNotifyOutcome.SIGNATURE_INVALID) {
			// 驗簽失敗不回 1|OK，避免把偽造通知當成已收妥。
			return ResponseEntity.badRequest()
					.contentType(MediaType.TEXT_PLAIN)
					.body("0|CheckMacValueInvalid");
		}
		return ResponseEntity.ok()
				.contentType(MediaType.TEXT_PLAIN)
				.body(ACK_OK);
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
}
