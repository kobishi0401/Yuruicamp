package com.yuruicamp.backend.catalog.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * 用途：以實際 PostgreSQL 與 HTTP Controller 驗收商品分頁、排序及錯誤 Envelope。
 * 核心重點：測試直接比較資料庫 ORDER BY 結果，避免只驗證 Java 記憶體排序。
 */
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_BACKEND_IT", matches = "true")
class ProductPaginationIntegrationTest {

	private static final String SELLABLE_FROM_SQL = """
			from products p
			join equipment_items i on i.id = p.item_id
			where p.status = 'active'
			  and i.active = true
			  and exists (
			      select 1 from product_variants v
			      where v.product_id = p.id and v.status = 'active'
			  )
			""";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private ObjectMapper objectMapper;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Test
	void nonEmptyPagesDoNotOverlapOrLoseRows() throws Exception {
		JsonNode firstPage = getProducts(0, 5, "id,asc");
		JsonNode secondPage = getProducts(1, 5, "id,asc");
		JsonNode allProducts = getProducts(0, 100, "id,asc");

		List<String> firstIds = values(firstPage.path("data"), "id");
		List<String> secondIds = values(secondPage.path("data"), "id");
		List<String> combined = new ArrayList<>(firstIds);
		combined.addAll(secondIds);
		Set<String> overlap = new HashSet<>(firstIds);
		overlap.retainAll(secondIds);

		assertFalse(firstIds.isEmpty(), "第一頁必須有實際商品資料");
		assertFalse(secondIds.isEmpty(), "第二頁必須有實際商品資料");
		assertTrue(overlap.isEmpty(), "page=0 與 page=1 不得出現重複商品");
		assertEquals(values(allProducts.path("data"), "id").subList(0, combined.size()), combined,
				"前兩頁合併後必須與完整排序的前段資料一致");
		assertEquals(allProducts.path("meta").path("totalElements").asLong(),
				firstPage.path("meta").path("totalElements").asLong());
	}

	@Test
	void idAscendingAndDescendingMatchPostgreSqlOrder() throws Exception {
		assertApiOrderMatchesDatabase("id,asc", "order by p.id asc", "id", "id");
		assertApiOrderMatchesDatabase("id,desc", "order by p.id desc", "id", "id");
	}

	@Test
	void nameAscendingAndDescendingMatchPostgreSqlOrder() throws Exception {
		assertApiOrderMatchesDatabase("name,asc", "order by i.name asc", "name", "name");
		assertApiOrderMatchesDatabase("name,desc", "order by i.name desc", "name", "name");
	}

	@Test
	void createdAtDescendingMatchesProductListingTime() throws Exception {
		List<String> expected = jdbcTemplate.queryForList(
				"select p.id " + SELLABLE_FROM_SQL + "order by p.created_at desc, p.id desc",
				String.class);
		JsonNode response = getProducts(0, 100, "createdAt,desc");
		List<String> actual = values(response.path("data"), "id");

		assertFalse(expected.isEmpty(), "PostgreSQL 必須有可供驗收的商品資料");
		assertEquals(expected, actual, "最新商品必須依 products.created_at 降序排列");
	}

	@Test
	void productTagsAndVariantsDoNotContainJoinDuplicates() throws Exception {
		JsonNode products = getProducts(0, 100, "id,asc").path("data");

		products.forEach(product -> {
			List<String> tags = values(product.path("tags"), null);
			List<String> variantIds = values(product.path("variants"), "id");
			assertEquals(new HashSet<>(tags).size(), tags.size(), "商品標籤不得重複");
			assertEquals(new HashSet<>(variantIds).size(), variantIds.size(), "商品規格不得因 JOIN FETCH 重複");
		});
	}

	@Test
	void bestsellersMatchValidOrderQuantities() throws Exception {
		List<String> expected = jdbcTemplate.queryForList("""
				select p.id
				from products p
				join equipment_items i on i.id = p.item_id
				left join order_items order_item on order_item.product_id = p.id
				left join orders order_header
				  on order_header.id = order_item.order_id
				 and order_header.status not in ('cancelled', 'returned')
				where p.status = 'active'
				  and i.active = true
				  and exists (
				      select 1
				      from equipment_tags badge
				      where badge.item_id = p.item_id
				        and badge.tag = '熱銷'
				  )
				  and exists (
				      select 1 from product_variants variant
				      where variant.product_id = p.id and variant.status = 'active'
				)
				group by p.id
				having coalesce(sum(
				    case when order_header.id is not null then order_item.quantity else 0 end
				), 0) > 0
				order by coalesce(sum(
				    case when order_header.id is not null then order_item.quantity else 0 end
				), 0) desc,
				p.id asc
				limit 6
				""", String.class);

		MvcResult result = mockMvc.perform(get("/api/products/bestsellers").param("limit", "6"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.success").value(true))
				.andExpect(jsonPath("$.data").isArray())
				.andReturn();
		List<String> actual = values(
				objectMapper.readTree(result.getResponse().getContentAsByteArray()).path("data"),
				"id");

		assertFalse(expected.isEmpty(), "PostgreSQL 必須有可供驗收的商品資料");
		assertEquals(expected, actual, "熱銷商品必須依有效訂單商品數量排序");
	}

	@Test
	void bestsellerLimitOutsideRangeReturnsValidationEnvelope() throws Exception {
		assertValidationError("limit", "0", "/api/products/bestsellers");
		assertValidationError("limit", "101", "/api/products/bestsellers");
	}

	@Test
	void invalidPageAndSizeReturnValidationEnvelope() throws Exception {
		assertValidationError("page", "-1");
		assertValidationError("size", "0");
		assertValidationError("size", "101");
	}

	@Test
	void invalidSortFormatsReturnValidationEnvelope() throws Exception {
		assertSortValidationError("id");
		assertSortValidationError("id,xxx");
		assertSortValidationError("price,asc");
	}

	@Test
	void pageBeyondLastReturnsEmptyDataAndCorrectMeta() throws Exception {
		JsonNode firstPage = getProducts(0, 5, "id,asc");
		long totalElements = firstPage.path("meta").path("totalElements").asLong();
		int totalPages = firstPage.path("meta").path("totalPages").asInt();
		JsonNode beyond = getProducts(totalPages + 10, 5, "id,asc");

		assertTrue(beyond.path("data").isArray());
		assertEquals(0, beyond.path("data").size());
		assertEquals(totalPages + 10, beyond.path("meta").path("page").asInt());
		assertEquals(5, beyond.path("meta").path("size").asInt());
		assertEquals(totalElements, beyond.path("meta").path("totalElements").asLong());
		assertEquals(totalPages, beyond.path("meta").path("totalPages").asInt());
	}

	private void assertApiOrderMatchesDatabase(
			String apiSort,
			String sqlOrder,
			String databaseColumn,
			String apiField) throws Exception {
		String sqlColumn = "name".equals(databaseColumn) ? "i.name" : "p.id";
		List<String> expected = jdbcTemplate.queryForList(
				"select " + sqlColumn + " " + SELLABLE_FROM_SQL + sqlOrder,
				String.class);
		JsonNode response = getProducts(0, 100, apiSort);
		List<String> actual = values(response.path("data"), apiField);
		assertFalse(expected.isEmpty(), "PostgreSQL 必須有可供驗收的商品資料");
		assertEquals(expected, actual, apiSort + " 必須保持 PostgreSQL 的排序結果");
	}

	private void assertValidationError(String parameter, String value) throws Exception {
		assertValidationError(parameter, value, "/api/products");
	}

	private void assertValidationError(String parameter, String value, String path) throws Exception {
		mockMvc.perform(get(path).param(parameter, value))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.success").value(false))
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.error.message").isNotEmpty())
				.andExpect(jsonPath("$.error.details").isArray());
	}

	private void assertSortValidationError(String sort) throws Exception {
		mockMvc.perform(get("/api/products").param("sort", sort))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.success").value(false))
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.error.message").value(org.hamcrest.Matchers.containsString("Invalid sort")));
	}

	private JsonNode getProducts(int page, int size, String sort) throws Exception {
		MvcResult result = mockMvc.perform(get("/api/products")
						.param("page", Integer.toString(page))
						.param("size", Integer.toString(size))
						.param("sort", sort))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.success").value(true))
				.andExpect(jsonPath("$.data").isArray())
				.andExpect(jsonPath("$.meta.page").value(page))
				.andExpect(jsonPath("$.meta.size").value(size))
				.andReturn();
		return objectMapper.readTree(result.getResponse().getContentAsByteArray());
	}

	private static List<String> values(JsonNode array, String field) {
		List<String> values = new ArrayList<>();
		array.forEach(node -> values.add(field == null ? node.asText() : node.path(field).asText()));
		return values;
	}
}
