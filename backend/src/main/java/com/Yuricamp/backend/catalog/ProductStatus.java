package com.Yuricamp.backend.catalog;

/**
 * 商品狀態，用來控制商品是否可被前端顯示與下單。
 * ACTIVE：上架，可購買
 * INACTIVE：下架，不可購買
 * SOLD_OUT：售完，不可購買
 */
public enum ProductStatus {
    ACTIVE,
    INACTIVE,
    SOLD_OUT
}
