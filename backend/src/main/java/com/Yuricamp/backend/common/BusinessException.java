package com.Yuricamp.backend.common;

/**
 * 業務規則錯誤例外，例如商品不存在、庫存不足、訂單不可取消。
 */
public class BusinessException extends RuntimeException {

    private final ErrorCode errorCode;

    /**
     * 使用錯誤碼建立業務例外。
     */
    public BusinessException(ErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }

    /**
     * 回傳業務例外對應的錯誤碼。
     */
    public ErrorCode getErrorCode() {
        return errorCode;
    }
}
