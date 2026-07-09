package com.Yuricamp.backend.cart;

import com.Yuricamp.backend.common.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 購物車 Controller，提供前端結帳前的 價格試算 API。
 */
@RestController
@RequestMapping("/api/v1/cart")
public class CartController {

    private final CartService cartService;

    /**
     * 注入購物車服務層，Controller 負責接收試算請求與回傳結果。
     */
    public CartController(CartService cartService) {
        this.cartService = cartService;
    }

    /**
     * 試算購物車，回傳最新商品單價、小計與總金額。
     */
    @PostMapping("/quote")
    public ApiResponse<CartQuoteResponse> quote(@Valid @RequestBody CartQuoteRequest request) {
        return ApiResponse.ok(cartService.quote(request));
    }
}
