package com.yuruicamp.backend.inventory.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

// 記錄商品庫存在結帳期間的保留狀態。
@Entity
@Table(name = "product_stock_reservations")
public class ProductStockReservation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_item_id", nullable = false)
    private Long orderItemId;

    @Column(name = "variant_id", nullable = false)
    private String variantId;

    @Column(name = "location_id", nullable = false)
    private String locationId;

    @Column(nullable = false)
    private int quantity;

    @Column(nullable = false)
    private String status;

    @Column(name = "idempotency_key", nullable = false, unique = true)
    private String idempotencyKey;

    @Column(name = "reserved_at", nullable = false)
    private Instant reservedAt;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "released_at")
    private Instant releasedAt;

    @Column(name = "fulfilled_at")
    private Instant fulfilledAt;

    @Column(name = "inventory_domain", nullable = false)
    private String inventoryDomain;

    // 建立仍在有效期限內的商品庫存保留帳。
    public static ProductStockReservation active(
            Long orderItemId,
            String variantId,
            String locationId,
            int quantity,
            String idempotencyKey,
            Instant now,
            Instant expiresAt) {
        ProductStockReservation reservation = new ProductStockReservation();
        reservation.orderItemId = orderItemId;
        reservation.variantId = variantId;
        reservation.locationId = locationId;
        reservation.quantity = quantity;
        reservation.status = "active";
        reservation.idempotencyKey = idempotencyKey;
        reservation.reservedAt = now;
        reservation.expiresAt = expiresAt;
        reservation.inventoryDomain = "store";

        return reservation;
    }

    // 會員取消結帳時，將仍有效的保留帳標記為已釋放。
    public boolean release(Instant now) {
        return finish("released", now);
    }

    // 結帳逾時時，將仍有效的保留帳標記為已過期。
    public boolean expire(Instant now) {
        return finish("expired", now);
    }

    // 貨到付款成立後保留庫存，不再套用 Checkout 到期時間。
    public void confirmWithoutExpiry() {
        if ("active".equals(status)) {
            expiresAt = null;
        }
    }

    /**
     * 線上付款成功：active → fulfilled（扣留轉成已履約保留）。
     * Schema 要求 fulfilled 必須有 fulfilled_at，且 released_at 必須為 null。
     */
    public boolean fulfill(Instant now) {
        if (!"active".equals(status)) {
            return false;
        }

        status = "fulfilled";
        fulfilledAt = now;
        releasedAt = null;
        expiresAt = null;

        return true;
    }

    // 保留帳只能由 active 進入 released／expired。
    private boolean finish(String nextStatus, Instant now) {
        if (!"active".equals(status)) {
            return false;
        }

        status = nextStatus;
        releasedAt = now;

        return true;
    }

    public String getStatus() {
        return status;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getReleasedAt() {
        return releasedAt;
    }

    public String getVariantId() {
        return variantId;
    }

    public String getLocationId() {
        return locationId;
    }

    public int getQuantity() {
        return quantity;
    }
}
