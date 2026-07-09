package com.Yuricamp.backend.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * 商品資料表 Entity，保存前端列表、詳情與訂單所需的商品資訊。
 */
@Entity
@Table(name = "products")
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, length = 1000)
    private String description;

    // 商品分類，讓前端可以用分類篩選商品。
    @Column(nullable = false, length = 80)
    private String category;

    // 商品單價，金額使用 BigDecimal 避免浮點誤差。
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal price;

    /**
     * 商品庫存數量，建立訂單與試算時都會檢查。
     */
    @Column(nullable = false)
    private Integer stockQuantity;

    @Column(nullable = false, length = 500)
    private String imageUrl;

    /**
     * 商品狀態，只有 ACTIVE 商品可以下單。
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ProductStatus status;

    /**
     * 建立時間，新增商品時自動寫入。
     */
    @Column(nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    /**
     * 更新時間，每次修改商品時自動更新。
     */
    @Column(nullable = false)
    private OffsetDateTime updatedAt;

    /**
     * JPA 需要的無參數建構子。
     */
    protected Product() {
    }

    /**
     * 建立商品 seed data 或日後後台新增商品時使用。
     */
    public Product(String name, String description, String category, BigDecimal price, Integer stockQuantity, String imageUrl, ProductStatus status) {
        this.name = name;
        this.description = description;
        this.category = category;
        this.price = price;
        this.stockQuantity = stockQuantity;
        this.imageUrl = imageUrl;
        this.status = status;
    }

    /**
     * 新增資料前自動補上建立與更新時間。
     */
    @PrePersist
    void prePersist() {
        OffsetDateTime now = OffsetDateTime.now();
        createdAt = now;
        updatedAt = now;
    }

    /**
     * 更新資料前自動刷新更新時間。
     */
    @PreUpdate
    void preUpdate() {
        updatedAt = OffsetDateTime.now();
    }

    /**
     * 檢查商品目前是否可被購買。
     */
    public boolean isPurchasable() {
        return status == ProductStatus.ACTIVE;
    }

    /**
     * 檢查指定購買數量是否仍有足夠庫存。
     */
    public boolean hasEnoughStock(int quantity) {
        return stockQuantity >= quantity;
    }

    /**
     * 建立訂單成功後扣除商品庫存，避免後續訂單重複使用同一份庫存。
     */
    public void decreaseStock(int quantity) {
        this.stockQuantity -= quantity;
        if (this.stockQuantity == 0) {
            this.status = ProductStatus.SOLD_OUT;
        }
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public String getCategory() {
        return category;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public Integer getStockQuantity() {
        return stockQuantity;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public ProductStatus getStatus() {
        return status;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
