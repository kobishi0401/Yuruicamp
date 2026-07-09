package com.Yuricamp.backend.order;

/**
 * 訂單狀態，控制訂單目前處理階段與是否可取消。
 */
public enum OrderStatus {
    PENDING,
    CONFIRMED,
    CANCELLED,
    COMPLETED
}
