package com.yuruicamp.backend.logistics.api;

import java.util.LinkedHashMap;
import java.util.Map;

import com.yuruicamp.backend.logistics.application.EcpayLogisticsMapService;
import com.yuruicamp.backend.logistics.application.EcpayLogisticsNotifyService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 綠界物流 callback（無 Bearer；靠 CheckMacValue MD5 驗真）。
 */
@RestController
@RequestMapping("/api/logistics/ecpay")
public class EcpayLogisticsCallbackController {

	private final EcpayLogisticsMapService mapService;
	private final EcpayLogisticsNotifyService notifyService;

	public EcpayLogisticsCallbackController(
			EcpayLogisticsMapService mapService,
			EcpayLogisticsNotifyService notifyService) {
		this.mapService = mapService;
		this.notifyService = notifyService;
	}

	/** 電子地圖選店結果；導回 checkout 頁。 */
	@PostMapping(value = "/map-result", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
	public ResponseEntity<Void> mapResult(@RequestParam MultiValueMap<String, String> form) {
		String redirect = mapService.applyMapResult(toSingleValueMap(form));
		return ResponseEntity.status(HttpStatus.FOUND).header("Location", redirect).build();
	}

	/** 物流狀態通知；必須回純文字 1|OK。 */
	@PostMapping(value = "/notify", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
	public ResponseEntity<String> notify(@RequestParam MultiValueMap<String, String> form) {
		Map<String, String> params = toSingleValueMap(form);
		if (!notifyService.verify(params)) {
			return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Invalid CheckMacValue");
		}
		notifyService.handle(params);
		return ResponseEntity.ok().contentType(MediaType.TEXT_PLAIN).body("1|OK");
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
