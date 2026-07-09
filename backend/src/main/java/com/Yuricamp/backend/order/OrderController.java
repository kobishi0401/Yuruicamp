package com.Yuricamp.backend.order;

import com.Yuricamp.backend.common.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 訂單 Controller，提供建立訂單、查詢訂單與取消訂單 API。
 */
@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {

    private final OrderService orderService;

    /**
     * 注入訂單服務層，Controller 負責 HTTP 請求與回應包裝。
     */
    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    /**
     * 建立訂單，前端送出顧客資料與商品項目。
     * RequestBody 前端 JSON 轉成 CreateOrderRequest
     */
    @PostMapping
    public ApiResponse<OrderResponse> createOrder(@Valid @RequestBody CreateOrderRequest request) {
        return ApiResponse.ok(orderService.createOrder(request), "Order created");
    }

    /**
     * 依訂單編號查詢訂單詳情。
     * GET /api/v1/orders/ORD-20260709-A1B2C3D4
     */
    @GetMapping("/{orderNo}")
    public ApiResponse<OrderResponse> findOrder(@PathVariable String orderNo) {
        return ApiResponse.ok(orderService.findOrder(orderNo));
    }

    /**
     * 取消指定訂單，僅允許可取消狀態的訂單。
     */
    @PatchMapping("/{orderNo}/cancel")
    public ApiResponse<OrderResponse> cancelOrder(@PathVariable String orderNo) {
        return ApiResponse.ok(orderService.cancelOrder(orderNo), "Order cancelled");
    }
}
