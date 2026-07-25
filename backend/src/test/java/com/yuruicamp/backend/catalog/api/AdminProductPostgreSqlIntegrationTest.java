package com.yuruicamp.backend.catalog.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_BACKEND_IT", matches = "true")
// 使用真正 PostgreSQL 驗證商品四表交易、RBAC、可選 stockLocations 寫庫存與公開上下架結果。
class AdminProductPostgreSqlIntegrationTest {

	private static final String TOKEN =
			"Bearer dev:uid-g2c-admin:g2c-admin@example.test:google:G2C Admin";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private ObjectMapper objectMapper;

	@BeforeEach
	void setUp() {
		cleanup();
		jdbc.update("INSERT INTO admin_permissions (code, section, action) VALUES ('products.view', 'products', 'view'), ('products.edit', 'products', 'edit') ON CONFLICT DO NOTHING");
		jdbc.update("INSERT INTO admin_role_permissions (role, permission_code) VALUES ('admin', 'products.view'), ('admin', 'products.edit') ON CONFLICT DO NOTHING");
		jdbc.update("""
				INSERT INTO admin_users (id, name, email, role, active, firebase_uid)
				VALUES ('G2C-ADMIN', 'G2C Admin', 'g2c-admin@example.test', 'admin', true, 'uid-g2c-admin')
				""");
		jdbc.update("""
				INSERT INTO product_categories (id, code, name, sort_order)
				VALUES (99002, 'g2c-test', 'G2C 測試分類', 99002)
				""");
		jdbc.update("""
				INSERT INTO brands (id, name, sort_order)
				VALUES ('g2c-brand', 'G2C 測試品牌', 99002)
				""");
	}

	@AfterEach
	void tearDown() {
		cleanup();
	}

	@Test
	void createUpdateAndDeactivateUseNormalizedTables() throws Exception {
		String createBody = """
				{
				  "name": "G2C 測試帳篷",
				  "description": "<p>測試商品</p>",
				  "categoryId": 99002,
				  "brandId": "g2c-brand",
				  "status": "active",
				  "images": [{"url":"/assets/images/products/g2c.jpg","altText":"G2C 測試帳篷"}],
				  "variants": [
				    {
				      "sku":"G2C-SKU-001",
				      "color":"綠色",
				      "size":null,
				      "specification":"綠色",
				      "price":"3200.00",
				      "status":"active"
				    },
				    {
				      "sku":"G2C-SKU-002",
				      "color":"沙色",
				      "size":null,
				      "specification":"沙色",
				      "price":"3300.00",
				      "status":"active"
				    }
				  ]
				}
				""";
		String responseBody = mockMvc.perform(post("/api/admin/products")
					.header("Authorization", TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content(createBody))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.itemId").isNotEmpty())
				.andExpect(jsonPath("$.data.variants.length()").value(2))
				.andExpect(jsonPath("$.data.variants[0].onHandQuantity").value(0))
				.andReturn()
				.getResponse()
				.getContentAsString();
		JsonNode created = objectMapper.readTree(responseBody).path("data");
		String productId = created.path("id").asText();
		String itemId = created.path("itemId").asText();
		String variantId = findVariantId(created, "G2C-SKU-001");
		String omittedVariantId = findVariantId(created, "G2C-SKU-002");

		String conflictUpdateBody = """
				{
				  "name": "G2C 更新帳篷",
				  "description": null,
				  "categoryId": 99002,
				  "brandId": "g2c-brand",
				  "status": "active",
				  "images": [
				    {"url":"/assets/images/products/g2c-updated.jpg","altText":"G2C 更新帳篷"},
				    {"url":"https://example.com/g2c-detail.jpg","altText":"G2C 細節圖"}
				  ],
				  "variants": [{
				    "id":"%s",
				    "sku":"G2C-SKU-001",
				    "color":"沙色",
				    "size":null,
				    "specification":"沙色",
				    "price":"3300.00",
				    "status":"active"
				  }]
				}
				""".formatted(variantId);
		mockMvc.perform(put("/api/admin/products/{id}", productId)
					.header("Authorization", TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content(conflictUpdateBody))
				.andExpect(status().isConflict());

		String updateBody = conflictUpdateBody
				.replace("\"color\":\"沙色\"", "\"color\":\"深橄欖綠\"")
				.replace("\"specification\":\"沙色\"", "\"specification\":\"深橄欖綠\"");
		mockMvc.perform(put("/api/admin/products/{id}", productId)
					.header("Authorization", TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content(updateBody))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.name").value("G2C 更新帳篷"))
				.andExpect(jsonPath("$.data.price").value("3300.00"))
				.andExpect(jsonPath("$.data.images[0].sortOrder").value(0))
				.andExpect(jsonPath("$.data.images[1].sortOrder").value(1));

		mockMvc.perform(post("/api/admin/products/{id}/deactivate", productId)
					.header("Authorization", TOKEN))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("inactive"));
		mockMvc.perform(get("/api/products/{id}", productId))
				.andExpect(status().isNotFound());

		org.junit.jupiter.api.Assertions.assertEquals(
				2,
				jdbc.queryForObject(
						"SELECT count(*) FROM equipment_images WHERE item_id = ?",
						Integer.class,
						itemId));
		org.junit.jupiter.api.Assertions.assertEquals(
				"inactive",
				jdbc.queryForObject(
						"SELECT status FROM product_variants WHERE id = ?",
						String.class,
						omittedVariantId));
		org.junit.jupiter.api.Assertions.assertEquals(
				1,
				jdbc.queryForObject(
						"SELECT count(*) FROM equipment_items WHERE id = ?",
						Integer.class,
						itemId));
		org.junit.jupiter.api.Assertions.assertEquals(
				1,
				jdbc.queryForObject(
						"SELECT count(*) FROM products WHERE id = ? AND item_id = ?",
						Integer.class,
						productId,
						itemId));
		org.junit.jupiter.api.Assertions.assertEquals(
				0,
				jdbc.queryForObject(
						"SELECT count(*) FROM inventory_stocks WHERE variant_id = ?",
						Integer.class,
						variantId));
	}

	@Test
	void createWithStockLocationsWritesInventoryStocks() throws Exception {
		jdbc.update("""
				INSERT INTO inventory_locations (id, code, inventory_domain, type, name, active)
				VALUES ('main', 'main', 'store', 'main', '主倉', true)
				ON CONFLICT (id) DO UPDATE SET active = true, inventory_domain = 'store'
				""");
		String createBody = """
				{
				  "name": "G2C 有庫存商品",
				  "categoryId": 99002,
				  "brandId": "g2c-brand",
				  "status": "active",
				  "images": [],
				  "variants": [{
				    "sku":"G2C-SKU-STOCK",
				    "specification":"標準",
				    "price":"100.00",
				    "status":"active",
				    "stockLocations":[{"locationId":"main","onHandQuantity":7}]
				  }]
				}
				""";
		String responseBody = mockMvc.perform(post("/api/admin/products")
					.header("Authorization", TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content(createBody))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.variants[0].onHandQuantity").value(7))
				.andReturn()
				.getResponse()
				.getContentAsString();
		String variantId = objectMapper.readTree(responseBody)
				.path("data")
				.path("variants")
				.get(0)
				.path("id")
				.asText();
		org.junit.jupiter.api.Assertions.assertEquals(
				7,
				jdbc.queryForObject(
						"SELECT on_hand_quantity FROM inventory_stocks WHERE variant_id = ? AND location_id = 'main'",
						Integer.class,
						variantId));
	}

	@Test
	void viewerWithoutEditPermissionCannotCreate() throws Exception {
		jdbc.update("UPDATE admin_users SET role = 'operator' WHERE id = 'G2C-ADMIN'");
		jdbc.update("""
				INSERT INTO admin_user_permissions (admin_user_id, permission_code, allowed)
				VALUES ('G2C-ADMIN', 'products.edit', false)
				ON CONFLICT (admin_user_id, permission_code) DO UPDATE SET allowed = false
				""");

		mockMvc.perform(post("/api/admin/products")
					.header("Authorization", TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{
							  "name":"無權限商品",
							  "categoryId":99002,
							  "brandId":"g2c-brand",
							  "status":"active",
							  "images":[],
							  "variants":[{
							    "sku":"G2C-DENIED",
							    "specification":"標準規格",
							    "price":"100.00",
							    "status":"active"
							  }]
							}
							"""))
				.andExpect(status().isForbidden());
	}

	private void cleanup() {
		jdbc.update("DELETE FROM inventory_stocks WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE item_id IN (SELECT id FROM equipment_items WHERE category_id = 99002)))");
		jdbc.update("DELETE FROM equipment_images WHERE item_id IN (SELECT item_id FROM products WHERE id LIKE 'P%') AND item_id IN (SELECT id FROM equipment_items WHERE category_id = 99002)");
		jdbc.update("DELETE FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE item_id IN (SELECT id FROM equipment_items WHERE category_id = 99002))");
		jdbc.update("DELETE FROM products WHERE item_id IN (SELECT id FROM equipment_items WHERE category_id = 99002)");
		jdbc.update("DELETE FROM equipment_items WHERE category_id = 99002");
		jdbc.update("DELETE FROM brands WHERE id = 'g2c-brand'");
		jdbc.update("DELETE FROM product_categories WHERE id = 99002");
		jdbc.update("DELETE FROM admin_users WHERE id = 'G2C-ADMIN'");
	}

	// 回應規格依後端 ID 排序，測試以 SKU 找出要保留或停用的規格。
	private String findVariantId(JsonNode product, String sku) {
		for (JsonNode variant : product.path("variants")) {
			if (sku.equals(variant.path("sku").asText())) {
				return variant.path("id").asText();
			}
		}

		throw new IllegalStateException("Variant not found: " + sku);
	}
}
