package com.Yuricamp.backend.order;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.math.BigDecimal;

/**
 * 訂單明細 Entity，保存下單當下的商品名稱、單價、數量與小計。
 */
@Entity
@Table(name = "order_items")
public class OrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 所屬訂單，多筆明細對應同一筆訂單主檔。
     * FetchType.LAZY 延遲載入，當資料過大時可以提升效能
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id", nullable = false)
    private CustomerOrder order;

    /**
     * 商品 ID，保留與商品資料的關聯線索。
     */
    @Column(nullable = false)
    private Long productId;

    @Column(nullable = false, length = 120)
    private String productName;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal unitPrice;

    @Column(nullable = false)
    private Integer quantity;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal subtotal;

    /**
     * JPA 需要的無參數建構子。
     */
    protected OrderItem() {
    }

    /**
     * 建立訂單明細，保存當下商品資訊與小計。
     */
    public OrderItem(Long productId, String productName, BigDecimal unitPrice, Integer quantity) {
        this.productId = productId;
        this.productName = productName;
        this.unitPrice = unitPrice;
        this.quantity = quantity;
        this.subtotal = unitPrice.multiply(BigDecimal.valueOf(quantity));
    }

    /**
     * 指派明細所屬訂單，由 CustomerOrder.addItem 統一呼叫。
     */
    void assignOrder(CustomerOrder order) {
        this.order = order;
    }

    public Long getId() {
        return id;
    }

    public Long getProductId() {
        return productId;
    }

    public String getProductName() {
        return productName;
    }

    public BigDecimal getUnitPrice() {
        return unitPrice;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public BigDecimal getSubtotal() {
        return subtotal;
    }
}
