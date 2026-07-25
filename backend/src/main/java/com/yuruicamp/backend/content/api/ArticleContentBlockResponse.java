package com.yuruicamp.backend.content.api;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * 文章內容區塊（對齊 article_dto_view.content 元素）。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ArticleContentBlockResponse(
		String type,
		String value,
		String productId) {
}
