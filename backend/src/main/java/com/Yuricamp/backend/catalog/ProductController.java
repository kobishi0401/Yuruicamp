package com.Yuricamp.backend.catalog;

import com.Yuricamp.backend.common.ApiResponse;
import com.Yuricamp.backend.common.PageResponse;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;

/**
 * 商品 Controller，提供前端商品列表與商品詳情 API。
 */
@RestController
@RequestMapping("/api/v1/products")
public class ProductController {

    private final ProductService productService;

    /**
     * 注入商品服務層，Controller 僅負責接收 HTTP 請求與回傳結果。
     */
    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    /**
     * 查詢商品列表(全部)，支援 keyword、category、minPrice、maxPrice 與分頁排序。
     * GET /api/v1/products?keyword=露營&category=FOOD&minPrice=500&maxPrice=3000&page=0&size=12
     */
    @GetMapping
    public ApiResponse<PageResponse<ProductResponse>> findProducts(
            // RequestParam 代表可傳可不傳。
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            // 預設每個分頁 12 筆
            @PageableDefault(size = 12) Pageable pageable
    ) {
        return ApiResponse.ok(PageResponse.from(productService.findProducts(keyword, category, minPrice, maxPrice, pageable)));
    }

    /**
     * 查詢單一商品詳情，供商品詳情頁使用。
     * GET /api/v1/products/1
     */
    @GetMapping("/{productId}")
    public ApiResponse<ProductResponse> findProduct(@PathVariable Long productId) {
        return ApiResponse.ok(productService.findProduct(productId));
    }
}
