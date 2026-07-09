package com.Yuricamp.backend.cart;

import com.Yuricamp.backend.catalog.Product;
import com.Yuricamp.backend.catalog.ProductService;
import com.Yuricamp.backend.common.BusinessException;
import com.Yuricamp.backend.common.ErrorCode;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 購物車服務層，負責商品狀態檢查、庫存檢查與金額試算。
 */
@Service
public class CartService {

    private final ProductService productService;

    /**
     * 注入商品服務，試算時以資料庫最新商品資料為準。
     */
    public CartService(ProductService productService) {
        this.productService = productService;
    }

    /**
     * 依前端送出的商品項目計算小計與總金額。
     */
    public CartQuoteResponse quote(CartQuoteRequest request) {
        List<CartQuoteResponse.Item> responseItems = new ArrayList<>();
        BigDecimal totalAmount = BigDecimal.ZERO;

        for (CartQuoteRequest.Item requestItem : request.items()) {
            // 商品必須存在、ACTIVE、庫存足夠，才會被接收
            Product product = validateAndGetProduct(requestItem.productId(), requestItem.quantity());
            // 商品單價 * 數量
            BigDecimal subtotal = product.getPrice().multiply(BigDecimal.valueOf(requestItem.quantity()));

            responseItems.add(new CartQuoteResponse.Item(
                    product.getId(),
                    product.getName(),
                    product.getPrice(),
                    requestItem.quantity(),
                    subtotal
            ));
            totalAmount = totalAmount.add(subtotal);
        }

        return new CartQuoteResponse(responseItems, totalAmount);
    }

    /**
     * 檢查商品是否存在、是否可購買，以及庫存是否足夠。
     */
    public Product validateAndGetProduct(Long productId, Integer quantity) {
        Product product = productService.getProductOrThrow(productId);

        if (!product.isPurchasable()) {
            throw new BusinessException(ErrorCode.PRODUCT_INACTIVE);
        }

        if (!product.hasEnoughStock(quantity)) {
            throw new BusinessException(ErrorCode.INSUFFICIENT_STOCK);
        }

        return product;
    }
}
