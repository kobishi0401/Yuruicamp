package com.Yuricamp.backend.common;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 全域例外處理器，統一攔截 Controller 拋出的錯誤並轉成固定 JSON 格式。
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * 處理業務規則錯誤，依 ErrorCode 回傳對應 HTTP 狀態。
     * 業務錯誤 : 程式沒有壞掉，但使用者操作不符合系統規則。
     * 錯誤類型 :
     *      商品 ID 找不到
     *      商品已下架或售完，但使用者還想加入試算或下單。
     *      庫存不足，還繼續購買
     *      訂單編號找不到
     *      訂單狀態不能取消，已完成或已取消不能取消
     */
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusinessException(BusinessException exception) {
        ErrorCode errorCode = exception.getErrorCode();
        return ResponseEntity
                .status(errorCode.getHttpStatus())
                .body(ErrorResponse.of(errorCode));
    }

    /**
     * 處理 @Valid 驗證失敗，回傳第一個欄位錯誤給前端顯示。
     * 錯誤原因 : 前端送進來的 JSON 欄位格式或內容不符合 DTO 上的驗證規則。
     *      商品金額 localStorage 被竄改、訂單建立缺少資料
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(MethodArgumentNotValidException exception) {
        String message = exception.getBindingResult()
                .getFieldErrors()
                .stream()
                .findFirst()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .orElse(ErrorCode.VALIDATION_FAILED.getMessage());

        return ResponseEntity
                .status(ErrorCode.VALIDATION_FAILED.getHttpStatus())
                .body(ErrorResponse.of(ErrorCode.VALIDATION_FAILED, message));
    }

    /**
     * 處理未預期錯誤，避免內部細節直接暴露給前端。
     * 偵測到沒有被定義的錯誤直接給前端 500 error
     * 錯誤通常為內部 bug、連線問題、程式本身有問題
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleException(Exception exception) {
        return ResponseEntity
                .status(ErrorCode.INTERNAL_SERVER_ERROR.getHttpStatus())
                .body(ErrorResponse.of(ErrorCode.INTERNAL_SERVER_ERROR));
    }
}
