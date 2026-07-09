package com.Yuricamp.backend.order;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 訂單主檔 Entity，保存顧客資料、訂單狀態與總金額。
 */
@Entity
@Table(name = "customer_orders")
public class CustomerOrder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 對外查詢用訂單編號，避免直接暴露資料庫流水號。
     */
    @Column(nullable = false, unique = true, length = 40)
    private String orderNo;

    @Column(nullable = false, length = 80)
    private String customerName;

    @Column(nullable = false, length = 160)
    private String customerEmail;

    @Column(nullable = false, length = 40)
    private String customerPhone;

    /**
     * 訂單狀態，建立時預設為 PENDING。
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private OrderStatus status;

    /**
     * 訂單總金額，由訂單明細小計加總產生。
     */
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal totalAmount;

    /**
     * 訂單建立時間，新增時自動寫入。
     */
    @Column(nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    /**
     * 訂單更新時間，每次修改狀態時自動更新。
     */
    @Column(nullable = false)
    private OffsetDateTime updatedAt;

    /**
     * 訂單明細，一筆訂單可包含多個商品項目。
     */
    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OrderItem> items = new ArrayList<>();

    /**
     * JPA 需要的無參數建構子。
     */
    protected CustomerOrder() {
    }

    /**
     * 建立新訂單主檔，總金額先從零開始，明細加入後再累加。
     */
    public CustomerOrder(String orderNo, String customerName, String customerEmail, String customerPhone) {
        this.orderNo = orderNo;
        this.customerName = customerName;
        this.customerEmail = customerEmail;
        this.customerPhone = customerPhone;
        this.status = OrderStatus.PENDING;
        this.totalAmount = BigDecimal.ZERO;
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
     * 將明細加入訂單，並同步累加訂單總金額。
     */
    public void addItem(OrderItem item) {
        items.add(item);
        item.assignOrder(this);
        totalAmount = totalAmount.add(item.getSubtotal());
    }

    /**
     * 判斷訂單目前狀態是否允許取消。
     */
    public boolean isCancelable() {
        return status == OrderStatus.PENDING || status == OrderStatus.CONFIRMED;
    }

    /**
     * 將訂單狀態改成取消。
     */
    public void cancel() {
        this.status = OrderStatus.CANCELLED;
    }

    public Long getId() {
        return id;
    }

    public String getOrderNo() {
        return orderNo;
    }

    public String getCustomerName() {
        return customerName;
    }

    public String getCustomerEmail() {
        return customerEmail;
    }

    public String getCustomerPhone() {
        return customerPhone;
    }

    public OrderStatus getStatus() {
        return status;
    }

    public BigDecimal getTotalAmount() {
        return totalAmount;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public List<OrderItem> getItems() {
        return items;
    }
}
