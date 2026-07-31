package com.yuruicamp.backend.order.api;

import java.util.Map;

/**
 * Admin 列印託運單：前端以新分頁 Form POST 到綠界 printTradeDocument。
 */
public record AdminLogisticsPrintLaunchResponse(
		String orderId,
		String actionUrl,
		Map<String, String> fields) {
}
