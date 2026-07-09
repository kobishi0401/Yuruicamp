package com.Yuricamp.backend.catalog;

import com.Yuricamp.backend.common.BusinessException;
import com.Yuricamp.backend.common.ErrorCode;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;

/**
 * 商品服務層，集中處理商品查詢與下單前商品檢查。
 */
@Service
public class ProductService {

    private final ProductRepository productRepository;

    /**
     * 注入商品 Repository，供服務層查詢商品資料。
     */
    public ProductService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    /**
     * 查詢商品列表，支援關鍵字、分類與價格區間篩選。
     * keyword：關鍵字
     * category：分類
     * minPrice：最低價
     * maxPrice：最高價
     * pageable：分頁與排序
     */
    public Page<ProductResponse> findProducts(String keyword, String category, BigDecimal minPrice, BigDecimal maxPrice, Pageable pageable) {
        Specification<Product> specification = Specification.allOf(
                nameOrDescriptionContains(keyword),
                categoryEquals(category),
                priceGreaterThanOrEqualTo(minPrice),
                priceLessThanOrEqualTo(maxPrice)
        );

        return productRepository.findAll(specification, pageable)
                .map(ProductResponse::from);
    }

    /**
     * 查詢商品詳情，商品不存在時拋出標準業務錯誤。
     */
    public ProductResponse findProduct(Long productId) {
        return ProductResponse.from(getProductOrThrow(productId));
    }

    /**
     * cart 和 order 可以訪問這裡取得資料表資訊，統一處理 商品不存在 的錯誤。
     */
    public Product getProductOrThrow(Long productId) {
        return productRepository.findById(productId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PRODUCT_NOT_FOUND));
    }

    /**
     * 模糊查詢條件。
     */
    private Specification<Product> nameOrDescriptionContains(String keyword) {
        return (root, query, criteriaBuilder) -> {
            if (!StringUtils.hasText(keyword)) {
                return criteriaBuilder.conjunction();
            }

            String likeKeyword = "%" + keyword.toLowerCase() + "%";
            return criteriaBuilder.or(
                    criteriaBuilder.like(criteriaBuilder.lower(root.get("name")), likeKeyword),
                    criteriaBuilder.like(criteriaBuilder.lower(root.get("description")), likeKeyword)
            );
        };
    }

    /**
     * 分類查詢
     */
    private Specification<Product> categoryEquals(String category) {
        return (root, query, criteriaBuilder) -> {
            if (!StringUtils.hasText(category)) {
                return criteriaBuilder.conjunction();
            }

            return criteriaBuilder.equal(root.get("category"), category);
        };
    }

    /**
     * 建立最低價格查詢條件。
     */
    private Specification<Product> priceGreaterThanOrEqualTo(BigDecimal minPrice) {
        return (root, query, criteriaBuilder) -> {
            if (minPrice == null) {
                return criteriaBuilder.conjunction();
            }

            return criteriaBuilder.greaterThanOrEqualTo(root.get("price"), minPrice);
        };
    }

    /**
     * 建立最高價格查詢條件。
     */
    private Specification<Product> priceLessThanOrEqualTo(BigDecimal maxPrice) {
        return (root, query, criteriaBuilder) -> {
            if (maxPrice == null) {
                return criteriaBuilder.conjunction();
            }

            return criteriaBuilder.lessThanOrEqualTo(root.get("price"), maxPrice);
        };
    }
}
