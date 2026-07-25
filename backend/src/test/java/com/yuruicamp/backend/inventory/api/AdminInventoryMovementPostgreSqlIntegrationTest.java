package com.yuruicamp.backend.inventory.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
// ADM-W2-08：product_stock_update 稽核單；post 不定 on-hand。
// 例外：rental + transfer 過帳會改 rental_sku_variant_stocks（營地互轉）。
class AdminInventoryMovementPostgreSqlIntegrationTest {

	private static final String TOKEN =
			"Bearer dev:uid-g3-admin:g3-admin@example.test:google:G3 Admin";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private ObjectMapper objectMapper;

	@BeforeEach
	void setUp() {
		cleanup();
		jdbc.update("INSERT INTO admin_permissions (code, section, action) VALUES ('movement.view', 'movement', 'view'), ('movement.edit', 'movement', 'edit') ON CONFLICT DO NOTHING");
		jdbc.update("INSERT INTO admin_role_permissions (role, permission_code) VALUES ('admin', 'movement.view'), ('admin', 'movement.edit') ON CONFLICT DO NOTHING");
		jdbc.update("""
				INSERT INTO admin_users (id, name, email, role, active, firebase_uid)
				VALUES ('G3-ADMIN', 'G3 Admin', 'g3-admin@example.test', 'admin', true, 'uid-g3-admin')
				""");
		jdbc.update("""
				INSERT INTO product_categories (id, code, name, sort_order)
				VALUES (99003, 'g3-test', 'G3 測試分類', 99003)
				""");
		jdbc.update("""
				INSERT INTO equipment_items (id, category_id, name, active)
				VALUES ('G3-STORE-ITEM', 99003, 'G3 商城商品', true)
				""");
		jdbc.update("INSERT INTO products (id, item_id, status) VALUES ('G3-PRODUCT', 'G3-STORE-ITEM', 'active')");
		jdbc.update("""
				INSERT INTO product_variants (
				    id, product_id, sku, price, specification, status)
				VALUES ('G3-STORE-VARIANT', 'G3-PRODUCT', 'G3-STORE-SKU', 100, '標準', 'active')
				""");
		jdbc.update("""
				INSERT INTO inventory_locations (id, code, inventory_domain, type, name, active)
				VALUES ('G3-STORE-SOURCE', 'G3-STORE-SOURCE', 'store', 'main', 'G3 商城來源', true),
				       ('G3-STORE-DEST', 'G3-STORE-DEST', 'store', 'inspection', 'G3 商城目的', true)
				""");
		jdbc.update("""
				INSERT INTO inventory_stocks (
				    location_id, variant_id, on_hand_quantity, inventory_domain)
				VALUES ('G3-STORE-SOURCE', 'G3-STORE-VARIANT', 10, 'store'),
				       ('G3-STORE-DEST', 'G3-STORE-VARIANT', 2, 'store')
				""");
		// 營地互轉 fixture：兩個租借庫位 + 一筆規格庫存
		jdbc.update("""
				INSERT INTO equipment_items (id, category_id, name, active)
				VALUES ('G3-RENTAL-ITEM', 99003, 'G3 租借商品', true)
				""");
		jdbc.update("INSERT INTO rental_skus (id, item_id, status) VALUES ('G3-RENTAL-SKU', 'G3-RENTAL-ITEM', 'active')");
		jdbc.update("""
				INSERT INTO rental_sku_variants (
				    id, rental_sku_id, sku, specification, status)
				VALUES ('G3-RENTAL-VARIANT', 'G3-RENTAL-SKU', 'G3-RENTAL-SKU-V1', '標準', 'active')
				""");
		jdbc.update("""
				INSERT INTO inventory_locations (id, code, inventory_domain, type, name, active)
				VALUES ('G3-RENTAL-C001', 'G3-RENTAL-C001', 'rental', 'main', 'G3 租借營區1', true),
				       ('G3-RENTAL-C002', 'G3-RENTAL-C002', 'rental', 'main', 'G3 租借營區2', true)
				""");
		jdbc.update("""
				INSERT INTO rental_sku_variant_stocks (
				    location_id, rental_sku_variant_id, on_hand_quantity)
				VALUES ('G3-RENTAL-C001', 'G3-RENTAL-VARIANT', 5),
				       ('G3-RENTAL-C002', 'G3-RENTAL-VARIANT', 1)
				""");
	}

	@AfterEach
	void tearDown() {
		cleanup();
	}

	@Test
	void productStockUpdatePostDoesNotChangeOnHandAndIsIdempotent() throws Exception {
		long movementId = createDraft("""
				{
				  "inventoryDomain":"store",
				  "movementType":"product_stock_update",
				  "reason":"G3 盤點稽核"
				}
				""");
		addItem(movementId, """
				{
				  "variantId":"G3-STORE-VARIANT",
				  "quantity":3,
				  "sourceLocationId":"G3-STORE-SOURCE",
				  "destinationLocationId":"G3-STORE-DEST",
				  "lineReason":"門市調撥感",
				  "lineNature":"transfer"
				}
				""");
		postMovement(movementId).andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("posted"))
				.andExpect(jsonPath("$.data.employeeId").value("G3-ADMIN"))
				.andExpect(jsonPath("$.data.items[0].sourceLocationId").value("G3-STORE-SOURCE"))
				.andExpect(jsonPath("$.data.items[0].destinationLocationId").value("G3-STORE-DEST"))
				.andExpect(jsonPath("$.data.items[0].lineNature").value("transfer"));
		postMovement(movementId).andExpect(status().isOk());

		// post 不定庫存：仍維持 setUp 寫入的 10／2
		assertEquals(10, stock("G3-STORE-SOURCE", "G3-STORE-VARIANT"));
		assertEquals(2, stock("G3-STORE-DEST", "G3-STORE-VARIANT"));

		mockMvc.perform(post("/api/admin/inventory-movements/{id}/items", movementId)
					.header("Authorization", TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{
							  "variantId":"G3-STORE-VARIANT",
							  "quantity":1,
							  "destinationLocationId":"G3-STORE-DEST"
							}
							"""))
				.andExpect(status().isConflict());
		mockMvc.perform(post("/api/admin/inventory-movements/{id}/cancel", movementId)
					.header("Authorization", TOKEN))
				.andExpect(status().isConflict());
	}

	@Test
	void patchReasonDoesNotChangeEmployeeId() throws Exception {
		long movementId = createDraft("""
				{
				  "inventoryDomain":"store",
				  "movementType":"product_stock_update",
				  "reason":"G3 原始原因"
				}
				""");
		String addResponse = mockMvc.perform(post("/api/admin/inventory-movements/{id}/items", movementId)
					.header("Authorization", TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{
							  "variantId":"G3-STORE-VARIANT",
							  "quantity":1,
							  "destinationLocationId":"G3-STORE-DEST",
							  "lineReason":"列原因"
							}
							"""))
				.andExpect(status().isOk())
				.andReturn()
				.getResponse()
				.getContentAsString();
		long itemId = objectMapper.readTree(addResponse).path("data").path("items").get(0).path("id").asLong();
		postMovement(movementId).andExpect(status().isOk());

		mockMvc.perform(patch("/api/admin/inventory-movements/{id}", movementId)
					.header("Authorization", TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"reason\":\"G3 修改後原因\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.reason").value("G3 修改後原因"))
				.andExpect(jsonPath("$.data.employeeId").value("G3-ADMIN"));

		mockMvc.perform(patch("/api/admin/inventory-movements/{id}/items/{itemId}", movementId, itemId)
					.header("Authorization", TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"lineReason\":\"G3 列原因已改\",\"lineNature\":\"stocktake\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.items[0].lineReason").value("G3 列原因已改"))
				.andExpect(jsonPath("$.data.items[0].lineNature").value("stocktake"));
	}

	@Test
	void rentalTransferPostMovesOnHandAndRejectsInsufficientStock() throws Exception {
		long movementId = createDraft("""
				{
				  "inventoryDomain":"rental",
				  "movementType":"transfer",
				  "sourceLocationId":"G3-RENTAL-C001",
				  "destinationLocationId":"G3-RENTAL-C002",
				  "reason":"G3 營地互轉"
				}
				""");
		addItem(movementId, """
				{
				  "variantId":"G3-RENTAL-VARIANT",
				  "quantity":3
				}
				""");
		postMovement(movementId).andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("posted"));
		postMovement(movementId).andExpect(status().isOk());

		assertEquals(2, rentalStock("G3-RENTAL-C001", "G3-RENTAL-VARIANT"));
		assertEquals(4, rentalStock("G3-RENTAL-C002", "G3-RENTAL-VARIANT"));

		// 來源只剩 2：再轉 3 應 409，且庫存不變
		long failId = createDraft("""
				{
				  "inventoryDomain":"rental",
				  "movementType":"transfer",
				  "sourceLocationId":"G3-RENTAL-C001",
				  "destinationLocationId":"G3-RENTAL-C002",
				  "reason":"G3 營地互轉不足"
				}
				""");
		addItem(failId, """
				{
				  "variantId":"G3-RENTAL-VARIANT",
				  "quantity":3
				}
				""");
		postMovement(failId).andExpect(status().isConflict());
		assertEquals(2, rentalStock("G3-RENTAL-C001", "G3-RENTAL-VARIANT"));
		assertEquals(4, rentalStock("G3-RENTAL-C002", "G3-RENTAL-VARIANT"));
	}

	@Test
	void viewerWithoutEditPermissionCannotCreate() throws Exception {
		jdbc.update("UPDATE admin_users SET role = 'operator' WHERE id = 'G3-ADMIN'");
		jdbc.update("""
				INSERT INTO admin_user_permissions (admin_user_id, permission_code, allowed)
				VALUES ('G3-ADMIN', 'movement.view', true),
				       ('G3-ADMIN', 'movement.edit', false)
				ON CONFLICT (admin_user_id, permission_code) DO UPDATE SET allowed = EXCLUDED.allowed
				""");

		mockMvc.perform(get("/api/admin/inventory-movements/lookups")
					.header("Authorization", TOKEN))
				.andExpect(status().isOk());
		mockMvc.perform(post("/api/admin/inventory-movements")
					.header("Authorization", TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{
							  "inventoryDomain":"store",
							  "movementType":"product_stock_update",
							  "reason":"不應建立"
							}
							"""))
				.andExpect(status().isForbidden());
	}

	private long createDraft(String body) throws Exception {
		String response = mockMvc.perform(post("/api/admin/inventory-movements")
					.header("Authorization", TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content(body))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("draft"))
				.andReturn()
				.getResponse()
				.getContentAsString();
		JsonNode data = objectMapper.readTree(response).path("data");

		return data.path("id").asLong();
	}

	private void addItem(long movementId, String body) throws Exception {
		mockMvc.perform(post("/api/admin/inventory-movements/{id}/items", movementId)
					.header("Authorization", TOKEN)
					.contentType(MediaType.APPLICATION_JSON)
					.content(body))
				.andExpect(status().isOk());
	}

	private org.springframework.test.web.servlet.ResultActions postMovement(long movementId) throws Exception {
		return mockMvc.perform(post("/api/admin/inventory-movements/{id}/post", movementId)
				.header("Authorization", TOKEN));
	}

	private int stock(String locationId, String variantId) {
		return jdbc.queryForObject("""
				SELECT on_hand_quantity
				FROM inventory_stocks
				WHERE location_id = ? AND variant_id = ?
				""", Integer.class, locationId, variantId);
	}

	private int rentalStock(String locationId, String variantId) {
		return jdbc.queryForObject("""
				SELECT on_hand_quantity
				FROM rental_sku_variant_stocks
				WHERE location_id = ? AND rental_sku_variant_id = ?
				""", Integer.class, locationId, variantId);
	}

	private void cleanup() {
		jdbc.update("DELETE FROM store_inventory_movement_items WHERE movement_id IN (SELECT id FROM inventory_movements WHERE reason LIKE 'G3%')");
		jdbc.update("DELETE FROM rental_inventory_movement_items WHERE movement_id IN (SELECT id FROM inventory_movements WHERE reason LIKE 'G3%')");
		jdbc.update("DELETE FROM inventory_movements WHERE reason LIKE 'G3%'");
		jdbc.update("DELETE FROM inventory_stocks WHERE variant_id = 'G3-STORE-VARIANT'");
		jdbc.update("DELETE FROM rental_sku_variant_stocks WHERE rental_sku_variant_id = 'G3-RENTAL-VARIANT'");
		jdbc.update("DELETE FROM product_variants WHERE id = 'G3-STORE-VARIANT'");
		jdbc.update("DELETE FROM products WHERE id = 'G3-PRODUCT'");
		jdbc.update("DELETE FROM rental_sku_variants WHERE id = 'G3-RENTAL-VARIANT'");
		jdbc.update("DELETE FROM rental_skus WHERE id = 'G3-RENTAL-SKU'");
		jdbc.update("DELETE FROM equipment_items WHERE id IN ('G3-STORE-ITEM', 'G3-RENTAL-ITEM')");
		jdbc.update("DELETE FROM inventory_locations WHERE id LIKE 'G3-%'");
		jdbc.update("DELETE FROM product_categories WHERE id = 99003");
		jdbc.update("DELETE FROM admin_users WHERE id = 'G3-ADMIN'");
	}
}
