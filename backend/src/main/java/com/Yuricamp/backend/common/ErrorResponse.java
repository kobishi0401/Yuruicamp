package com.Yuricamp.backend.common;

/**
 * 統一 API 失敗回應格式，讓前端可以依 code 顯示對應錯誤訊息。
 * success (是否成功)、data (回傳資料)、message (回傳訊息)
 */
public record ErrorResponse(
        boolean success,
        String code,
        String message
) {

    /**
     * 建立 標準錯誤 回應
     */
    public static ErrorResponse of(ErrorCode errorCode) {
        return new ErrorResponse(false, errorCode.name(), errorCode.getMessage());
    }

    /**
     * 建立 自訂義錯誤回應，用於驗證錯誤或細節錯誤。
     */
    public static ErrorResponse of(ErrorCode errorCode, String message) {
        return new ErrorResponse(false, errorCode.name(), message);
    }
}
