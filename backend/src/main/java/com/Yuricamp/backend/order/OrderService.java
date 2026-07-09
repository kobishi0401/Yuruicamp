package com.Yuricamp.backend.order;

import com.Yuricamp.backend.cart.CartService;
import com.Yuricamp.backend.catalog.Product;
import com.Yuricamp.backend.common.BusinessException;
import com.Yuricamp.backend.common.ErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

/**
 * 訂單服務層，集中處理建立訂單、查詢訂單與取消訂單。
 */
@Service
public class OrderService {

    private static final DateTimeFormatter ORDER_DATE_FORMATTER = DateTimeFormatter.BASIC_ISO_DATE;

    private final OrderRepository orderRepository;
    private final CartService cartService;

    /**
     * 注入訂單 Repository 與購物車服務，建立訂單時重用商品檢查邏輯。
     */
    public OrderService(OrderRepository orderRepository, CartService cartService) {
        this.orderRepository = orderRepository;
        this.cartService = cartService;
    }

    /**
     * 建立訂單，交易內重新檢查商品狀態、庫存並扣除庫存。
     * Transactional 代表整個建立訂單流程在同一個資料庫交易裡。
     */
    @Transactional
    public OrderResponse createOrder(CreateOrderRequest request) {
        CustomerOrder order = new CustomerOrder(
                generateOrderNo(),
                request.customerName(),
                request.customerEmail(),
                request.customerPhone()
        );

        for (CreateOrderRequest.Item requestItem : request.items()) {
            // 驗證商品存在、可購買狀態、足夠
            Product product = cartService.validateAndGetProduct(requestItem.productId(), requestItem.quantity());
            order.addItem(new OrderItem(product.getId(), product.getName(), product.getPrice(), requestItem.quantity()));
            product.decreaseStock(requestItem.quantity());
        }

        return OrderResponse.from(orderRepository.save(order));
    }

    /**
     * 依訂單編號查詢訂單詳情。
     */
    @Transactional(readOnly = true)
    public OrderResponse findOrder(String orderNo) {
        return OrderResponse.from(getOrderOrThrow(orderNo));
    }

    /**
     * 取消訂單，只有 PENDING 或 CONFIRMED 狀態允許取消。
     */
    @Transactional
    public OrderResponse cancelOrder(String orderNo) {
        CustomerOrder order = getOrderOrThrow(orderNo);

        if (!order.isCancelable()) {
            throw new BusinessException(ErrorCode.ORDER_STATUS_NOT_CANCELABLE);
        }

        order.cancel();
        return OrderResponse.from(order);
    }

    /**
     * 統一處理訂單不存在時的錯誤。
     */
    private CustomerOrder getOrderOrThrow(String orderNo) {
        return orderRepository.findByOrderNo(orderNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORDER_NOT_FOUND));
    }

    /**
     * 產生對外訂單編號，格式為 ORD-日期-短 UUID。 UUID 生成8碼
     */
    private String generateOrderNo() {
        String date = LocalDate.now().format(ORDER_DATE_FORMATTER);
        String suffix = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        return "ORD-" + date + "-" + suffix;
    }
}
