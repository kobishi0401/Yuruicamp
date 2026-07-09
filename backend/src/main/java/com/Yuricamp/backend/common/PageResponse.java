package com.Yuricamp.backend.common;

import org.springframework.data.domain.Page;

import java.util.List;

/**
 * 統一分頁回應格式，避免直接把 Spring Page 細節暴露給前端。
 */
public record PageResponse<T>(
        List<T> content,
        int page,
        int size,
        long totalElements,
        int totalPages
) {

    /**
     * 將 Spring Data Page 轉成前端需要的簡潔分頁資料。
     */
    public static <T> PageResponse<T> from(Page<T> page) {
        return new PageResponse<>(
                page.getContent(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages()
        );
    }
}
