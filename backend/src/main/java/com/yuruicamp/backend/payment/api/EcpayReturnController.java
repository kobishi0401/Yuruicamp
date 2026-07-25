package com.yuruicamp.backend.payment.api;

import java.util.LinkedHashMap;
import java.util.Map;

import com.yuruicamp.backend.payment.application.EcpayReturnService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * D-4：綠界瀏覽器導回（OrderResultURL）。只 302，不改 payment_status。
 */
@RestController
@RequestMapping("/api/payments/ecpay")
public class EcpayReturnController {

	private final EcpayReturnService returnService;

	public EcpayReturnController(EcpayReturnService returnService) {
		this.returnService = returnService;
	}

	@GetMapping("/return")
	public ResponseEntity<Void> returnGet(@RequestParam Map<String, String> query) {
		return redirect(query);
	}

	@PostMapping(value = "/return", consumes = {
			org.springframework.http.MediaType.APPLICATION_FORM_URLENCODED_VALUE,
			org.springframework.http.MediaType.ALL_VALUE
	})
	public ResponseEntity<Void> returnPost(@RequestParam MultiValueMap<String, String> form) {
		return redirect(toSingleValueMap(form));
	}

	private ResponseEntity<Void> redirect(Map<String, String> params) {
		String location = returnService.resolveFrontendRedirect(params);
		return ResponseEntity.status(HttpStatus.FOUND)
				.header("Location", location)
				.build();
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
