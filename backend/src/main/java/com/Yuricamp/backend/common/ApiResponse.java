package com.Yuricamp.backend.common;

/**
 * 統一 API 成功回應格式，讓前端可以固定接收三個訊息
 * success (是否成功)、data (回傳資料)、message (回傳訊息)
 */
public record ApiResponse<T>(boolean success, T data, String message) {
    /**
     * 建立帶 有資料的成功回應。
     */
    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, data, null);
    }

    /**
     * 建立 帶有提示訊息 的成功回應。
     */
    public static <T> ApiResponse<T> ok(T data, String message) {
        return new ApiResponse<>(true, data, message);
    }
}
