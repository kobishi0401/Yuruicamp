package com.yuruicamp.backend.inventory.infrastructure;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.yuruicamp.backend.inventory.api.AdminInventoryMovementItemResponse;
import com.yuruicamp.backend.inventory.api.AdminInventoryMovementLookupResponse;
import com.yuruicamp.backend.inventory.api.AdminInventoryMovementResponse;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * G-3 庫存異動資料存取，動態表名只由固定的 store／rental 分支決定。
 */
@Repository
public class AdminInventoryMovementRepository {

	private final NamedParameterJdbcTemplate jdbc;

	public AdminInventoryMovementRepository(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public IdPage findIds(
			int page,
			int size,
			String query,
			String inventoryDomain,
			String status,
			String movementType,
			String sortColumn,
			String sortDirection) {
		MapSqlParameterSource parameters = new MapSqlParameterSource()
				.addValue("query", "%" + query.toLowerCase(java.util.Locale.ROOT) + "%")
				.addValue("limit", size)
				.addValue("offset", page * size);
		// M1：列表不列出 conversion_in（與 conversion_out 合併成一列 CVT-xxx）
		StringBuilder where = new StringBuilder("""
				 WHERE movement.movement_type <> 'conversion_in'
				   AND (lower(movement.movement_no) LIKE :query
				    OR lower(movement.reason) LIKE :query
				    OR lower(movement.employee_id) LIKE :query)
				""");
		appendFilter(where, parameters, "inventoryDomain", inventoryDomain, "movement.inventory_domain");
		appendFilter(where, parameters, "status", status, "movement.status");
		appendFilter(where, parameters, "movementType", movementType, "movement.movement_type");

		long totalElements = jdbc.queryForObject(
				"SELECT count(*) FROM inventory_movements movement" + where,
				parameters,
				Long.class);
		List<Long> ids = jdbc.queryForList(
				"SELECT movement.id FROM inventory_movements movement" + where
						+ " ORDER BY " + sortColumn + " " + sortDirection + ", movement.id DESC"
						+ " LIMIT :limit OFFSET :offset",
				parameters,
				Long.class);

		return new IdPage(ids, totalElements);
	}

	public List<AdminInventoryMovementResponse> findByIds(List<Long> ids) {
		if (ids.isEmpty()) {
			return List.of();
		}
		MapSqlParameterSource parameters = new MapSqlParameterSource("ids", ids);
		List<MovementHeader> headers = jdbc.query("""
				SELECT movement.id, movement.movement_no, movement.inventory_domain,
				       movement.movement_type, movement.status,
				       movement.source_location_id, source.name AS source_location_name,
				       movement.destination_location_id, destination.name AS destination_location_name,
				       movement.employee_id, employee.name AS employee_name, movement.reason,
				       movement.occurred_at, movement.posted_at,
				       movement.created_at, movement.updated_at,
				       COALESCE(conv_src.id, conv_dst.id) AS conversion_id,
				       CASE
				         WHEN conv_src.id IS NOT NULL THEN conv_src.destination_movement_id
				         WHEN conv_dst.id IS NOT NULL THEN conv_dst.source_movement_id
				         ELSE NULL
				       END AS paired_movement_id
				FROM inventory_movements movement
				LEFT JOIN inventory_locations source ON source.id = movement.source_location_id
				LEFT JOIN inventory_locations destination ON destination.id = movement.destination_location_id
				LEFT JOIN inventory_conversions conv_src
				       ON conv_src.source_movement_id = movement.id
				LEFT JOIN inventory_conversions conv_dst
				       ON conv_dst.destination_movement_id = movement.id
				JOIN admin_users employee ON employee.id = movement.employee_id
				WHERE movement.id IN (:ids)
				""", parameters, this::mapHeader);
		Map<Long, List<AdminInventoryMovementItemResponse>> itemsByMovement = findItems(parameters);
		Map<Long, MovementHeader> headerById = new HashMap<>();
		headers.forEach(header -> headerById.put(header.id(), header));
		List<AdminInventoryMovementResponse> result = new ArrayList<>();
		for (Long id : ids) {
			MovementHeader header = headerById.get(id);
			if (header != null) {
				result.add(toResponse(header, itemsByMovement.getOrDefault(id, List.of())));
			}
		}

		return result;
	}

	public MovementState lockMovement(long id) {
		List<MovementState> rows = jdbc.query("""
				SELECT id, inventory_domain, movement_type, status,
				       source_location_id, destination_location_id
				FROM inventory_movements
				WHERE id = :id
				FOR UPDATE
				""", new MapSqlParameterSource("id", id), (row, rowNumber) -> new MovementState(
				row.getLong("id"),
				row.getString("inventory_domain"),
				row.getString("movement_type"),
				row.getString("status"),
				row.getString("source_location_id"),
				row.getString("destination_location_id")));

		return rows.isEmpty() ? null : rows.getFirst();
	}

	public long insertMovement(
			String movementNo,
			String inventoryDomain,
			String movementType,
			String sourceLocationId,
			String destinationLocationId,
			String employeeId,
			String reason,
			Instant occurredAt,
			Instant now) {
		MapSqlParameterSource parameters = new MapSqlParameterSource()
				.addValue("movementNo", movementNo)
				.addValue("inventoryDomain", inventoryDomain)
				.addValue("movementType", movementType)
				.addValue("sourceLocationId", sourceLocationId)
				.addValue("destinationLocationId", destinationLocationId)
				.addValue("employeeId", employeeId)
				.addValue("reason", reason)
				.addValue("occurredAt", databaseTime(occurredAt))
				.addValue("now", databaseTime(now));

		return jdbc.queryForObject("""
				INSERT INTO inventory_movements (
				    movement_no, inventory_domain, movement_type, status,
				    source_location_id, destination_location_id,
				    employee_id, reason, occurred_at, created_at, updated_at)
				VALUES (
				    :movementNo, :inventoryDomain, :movementType, 'draft',
				    :sourceLocationId, :destinationLocationId,
				    :employeeId, :reason, :occurredAt, :now, :now)
				RETURNING id
				""", parameters, Long.class);
	}

	public LocationRecord findActiveLocation(String id) {
		List<LocationRecord> rows = jdbc.query("""
				SELECT id, inventory_domain, active
				FROM inventory_locations
				WHERE id = :id
				""", new MapSqlParameterSource("id", id), (row, rowNumber) -> new LocationRecord(
				row.getString("id"),
				row.getString("inventory_domain"),
				row.getBoolean("active")));

		return rows.isEmpty() ? null : rows.getFirst();
	}

	public VariantSnapshot findVariant(String inventoryDomain, String variantId) {
		String sql = "store".equals(inventoryDomain) ? """
				SELECT variant.id, variant.sku, item.name, variant.status
				FROM product_variants variant
				JOIN products product ON product.id = variant.product_id
				JOIN equipment_items item ON item.id = product.item_id
				WHERE variant.id = :variantId
				""" : """
				SELECT variant.id, variant.sku, item.name, variant.status
				FROM rental_sku_variants variant
				JOIN rental_skus sku ON sku.id = variant.rental_sku_id
				JOIN equipment_items item ON item.id = sku.item_id
				WHERE variant.id = :variantId
				""";
		List<VariantSnapshot> rows = jdbc.query(
				sql,
				new MapSqlParameterSource("variantId", variantId),
				(row, rowNumber) -> new VariantSnapshot(
						row.getString("id"),
						row.getString("sku"),
						row.getString("name"),
						row.getString("status")));

		return rows.isEmpty() ? null : rows.getFirst();
	}

	public boolean movementContainsVariant(long movementId, String inventoryDomain, String variantId) {
		String table = "store".equals(inventoryDomain)
				? "store_inventory_movement_items"
				: "rental_inventory_movement_items";
		String column = "store".equals(inventoryDomain) ? "variant_id" : "rental_sku_variant_id";
		Integer count = jdbc.queryForObject(
				"SELECT count(*) FROM " + table + " WHERE movement_id = :movementId AND " + column + " = :variantId",
				new MapSqlParameterSource()
						.addValue("movementId", movementId)
						.addValue("variantId", variantId),
				Integer.class);

		return count != null && count > 0;
	}

	public void insertItem(
			long movementId,
			String inventoryDomain,
			VariantSnapshot variant,
			int quantity,
			String sourceLocationId,
			String destinationLocationId,
			String lineReason,
			String lineNature) {
		MapSqlParameterSource parameters = new MapSqlParameterSource()
				.addValue("movementId", movementId)
				.addValue("variantId", variant.id())
				.addValue("sku", variant.sku())
				.addValue("productName", variant.productName())
				.addValue("quantity", quantity)
				.addValue("sourceLocationId", sourceLocationId)
				.addValue("destinationLocationId", destinationLocationId)
				.addValue("lineReason", lineReason)
				.addValue("lineNature", lineNature);
		if ("store".equals(inventoryDomain)) {
			jdbc.update("""
					INSERT INTO store_inventory_movement_items (
					    movement_id, inventory_domain, variant_id,
					    sku_snapshot, item_name_snapshot, quantity,
					    source_location_id, destination_location_id, line_reason, line_nature)
					VALUES (
					    :movementId, 'store', :variantId, :sku, :productName, :quantity,
					    :sourceLocationId, :destinationLocationId, :lineReason, :lineNature)
					""", parameters);
		} else {
			jdbc.update("""
					INSERT INTO rental_inventory_movement_items (
					    movement_id, inventory_domain, rental_sku_variant_id,
					    sku_snapshot, item_name_snapshot, quantity)
					VALUES (:movementId, 'rental', :variantId, :sku, :productName, :quantity)
					""", parameters);
		}
	}

	public void updateMovementReason(long movementId, String reason) {
		int updated = jdbc.update("""
				UPDATE inventory_movements
				SET reason = :reason, updated_at = :now
				WHERE id = :id
				""", new MapSqlParameterSource()
				.addValue("id", movementId)
				.addValue("reason", reason)
				.addValue("now", databaseTime(Instant.now())));
		if (updated == 0) {
			throw new IllegalStateException("Inventory movement not found: " + movementId);
		}
	}

	/** 更新明細備註與／或異動性質（null 參數＝該欄不改）。 */
	public void updateItemAnnotations(
			long movementId,
			long itemId,
			String lineReason,
			boolean updateLineReason,
			String lineNature,
			boolean updateLineNature) {
		if (!updateLineReason && !updateLineNature) {
			return;
		}
		StringBuilder sql = new StringBuilder("UPDATE store_inventory_movement_items SET ");
		MapSqlParameterSource parameters = new MapSqlParameterSource()
				.addValue("itemId", itemId)
				.addValue("movementId", movementId);
		if (updateLineReason) {
			sql.append("line_reason = :lineReason");
			parameters.addValue("lineReason", lineReason);
		}
		if (updateLineNature) {
			if (updateLineReason) {
				sql.append(", ");
			}
			sql.append("line_nature = :lineNature");
			parameters.addValue("lineNature", lineNature);
		}
		sql.append(" WHERE id = :itemId AND movement_id = :movementId");
		int updated = jdbc.update(sql.toString(), parameters);
		if (updated == 0) {
			throw new IllegalStateException("Inventory movement item not found: " + itemId);
		}
	}

	@Deprecated
	public void updateItemLineReason(long movementId, long itemId, String lineReason) {
		updateItemAnnotations(movementId, itemId, lineReason, true, null, false);
	}

	public List<AdminInventoryMovementItemResponse> findItems(long movementId) {
		Map<Long, List<AdminInventoryMovementItemResponse>> items = findItems(
				new MapSqlParameterSource("ids", List.of(movementId)));

		return items.getOrDefault(movementId, List.of());
	}

	public int ensureAndLockStock(String inventoryDomain, String locationId, String variantId, Instant now) {
		MapSqlParameterSource parameters = stockParameters(locationId, variantId, now);
		if ("store".equals(inventoryDomain)) {
			jdbc.update("""
					INSERT INTO inventory_stocks (
					    location_id, variant_id, on_hand_quantity, inventory_domain, updated_at)
					VALUES (:locationId, :variantId, 0, 'store', :now)
					ON CONFLICT (location_id, variant_id) DO NOTHING
					""", parameters);

			return jdbc.queryForObject("""
					SELECT on_hand_quantity
					FROM inventory_stocks
					WHERE location_id = :locationId AND variant_id = :variantId
					FOR UPDATE
					""", parameters, Integer.class);
		}
		jdbc.update("""
				INSERT INTO rental_sku_variant_stocks (
				    location_id, rental_sku_variant_id, on_hand_quantity, updated_at)
				VALUES (:locationId, :variantId, 0, :now)
				ON CONFLICT (location_id, rental_sku_variant_id) DO NOTHING
				""", parameters);

		return jdbc.queryForObject("""
				SELECT on_hand_quantity
				FROM rental_sku_variant_stocks
				WHERE location_id = :locationId AND rental_sku_variant_id = :variantId
				FOR UPDATE
				""", parameters, Integer.class);
	}

	public int findActiveReservedQuantity(String inventoryDomain, String locationId, String variantId) {
		MapSqlParameterSource parameters = stockParameters(locationId, variantId, Instant.now());
		String sql = "store".equals(inventoryDomain) ? """
				SELECT COALESCE(sum(quantity), 0)
				FROM product_stock_reservations
				WHERE status = 'active' AND location_id = :locationId AND variant_id = :variantId
				""" : """
				SELECT COALESCE(sum(quantity), 0)
				FROM rental_stock_reservations
				WHERE status = 'active' AND location_id = :locationId
				  AND rental_sku_variant_id = :variantId
				""";

		return jdbc.queryForObject(sql, parameters, Integer.class);
	}

	public void updateStock(
			String inventoryDomain,
			String locationId,
			String variantId,
			int quantity,
			Instant now) {
		MapSqlParameterSource parameters = stockParameters(locationId, variantId, now)
				.addValue("quantity", quantity);
		if ("store".equals(inventoryDomain)) {
			jdbc.update("""
					UPDATE inventory_stocks
					SET on_hand_quantity = :quantity, updated_at = :now
					WHERE location_id = :locationId AND variant_id = :variantId
					""", parameters);
		} else {
			jdbc.update("""
					UPDATE rental_sku_variant_stocks
					SET on_hand_quantity = :quantity, updated_at = :now
					WHERE location_id = :locationId AND rental_sku_variant_id = :variantId
					""", parameters);
		}
	}

	public void markPosted(long id, String employeeId, Instant now) {
		jdbc.update("""
				UPDATE inventory_movements
				SET status = 'posted', employee_id = :employeeId,
				    posted_at = :now, updated_at = :now
				WHERE id = :id
				""", new MapSqlParameterSource()
				.addValue("id", id)
				.addValue("employeeId", employeeId)
				.addValue("now", databaseTime(now)));
	}

	public void markCancelled(long id, String employeeId, Instant now) {
		jdbc.update("""
				UPDATE inventory_movements
				SET status = 'cancelled', employee_id = :employeeId, updated_at = :now
				WHERE id = :id
				""", new MapSqlParameterSource()
				.addValue("id", id)
				.addValue("employeeId", employeeId)
				.addValue("now", databaseTime(now)));
	}

	public AdminInventoryMovementLookupResponse findLookups() {
		List<AdminInventoryMovementLookupResponse.LocationOption> locations = jdbc.query("""
				SELECT id, code, inventory_domain, type, name
				FROM inventory_locations
				WHERE active = true
				ORDER BY inventory_domain, type, name, id
				""", (row, rowNumber) -> new AdminInventoryMovementLookupResponse.LocationOption(
				row.getString("id"),
				row.getString("code"),
				row.getString("inventory_domain"),
				row.getString("type"),
				row.getString("name")));
		List<AdminInventoryMovementLookupResponse.VariantOption> variants = new ArrayList<>();
		variants.addAll(jdbc.query("""
				SELECT 'store' AS inventory_domain, variant.id, variant.sku,
				       item.name, variant.specification
				FROM product_variants variant
				JOIN products product ON product.id = variant.product_id
				JOIN equipment_items item ON item.id = product.item_id
				WHERE variant.status = 'active'
				ORDER BY item.name, variant.sku
				""", this::mapVariantOption));
		variants.addAll(jdbc.query("""
				SELECT 'rental' AS inventory_domain, variant.id, variant.sku,
				       item.name, variant.specification
				FROM rental_sku_variants variant
				JOIN rental_skus sku ON sku.id = variant.rental_sku_id
				JOIN equipment_items item ON item.id = sku.item_id
				WHERE variant.status = 'active'
				ORDER BY item.name, variant.sku
				""", this::mapVariantOption));

		return new AdminInventoryMovementLookupResponse(locations, variants);
	}

	private Map<Long, List<AdminInventoryMovementItemResponse>> findItems(
			MapSqlParameterSource parameters) {
		Map<Long, List<AdminInventoryMovementItemResponse>> result = new HashMap<>();
		jdbc.query("""
				SELECT id, movement_id, inventory_domain, variant_id,
				       sku_snapshot, item_name_snapshot, quantity,
				       source_location_id, destination_location_id, line_reason, line_nature
				FROM inventory_movement_items_view
				WHERE movement_id IN (:ids)
				ORDER BY movement_id, id
				""", parameters, (org.springframework.jdbc.core.RowCallbackHandler) row -> {
			result.computeIfAbsent(row.getLong("movement_id"), ignored -> new ArrayList<>())
					.add(new AdminInventoryMovementItemResponse(
							row.getLong("id"),
							row.getString("inventory_domain"),
							row.getString("variant_id"),
							row.getString("sku_snapshot"),
							row.getString("item_name_snapshot"),
							row.getInt("quantity"),
							row.getString("source_location_id"),
							row.getString("destination_location_id"),
							row.getString("line_reason"),
							row.getString("line_nature")));
		});

		return result;
	}

	private void appendFilter(
			StringBuilder where,
			MapSqlParameterSource parameters,
			String parameterName,
			String value,
			String column) {
		if (!value.isBlank()) {
			where.append(" AND ").append(column).append(" = :").append(parameterName);
			parameters.addValue(parameterName, value);
		}
	}

	private MapSqlParameterSource stockParameters(
			String locationId,
			String variantId,
			Instant now) {
		return new MapSqlParameterSource()
				.addValue("locationId", locationId)
				.addValue("variantId", variantId)
				.addValue("now", databaseTime(now));
	}

	private OffsetDateTime databaseTime(Instant value) {
		return OffsetDateTime.ofInstant(value, java.time.ZoneOffset.UTC);
	}

	private MovementHeader mapHeader(ResultSet row, int rowNumber) throws SQLException {
		Number conversionId = (Number) row.getObject("conversion_id");
		Number pairedMovementId = (Number) row.getObject("paired_movement_id");
		return new MovementHeader(
				row.getLong("id"),
				row.getString("movement_no"),
				row.getString("inventory_domain"),
				row.getString("movement_type"),
				row.getString("status"),
				row.getString("source_location_id"),
				row.getString("source_location_name"),
				row.getString("destination_location_id"),
				row.getString("destination_location_name"),
				row.getString("employee_id"),
				row.getString("employee_name"),
				row.getString("reason"),
				toInstant(row, "occurred_at"),
				toInstant(row, "posted_at"),
				toInstant(row, "created_at"),
				toInstant(row, "updated_at"),
				conversionId == null ? null : conversionId.longValue(),
				pairedMovementId == null ? null : pairedMovementId.longValue());
	}

	private AdminInventoryMovementLookupResponse.VariantOption mapVariantOption(
			ResultSet row,
			int rowNumber) throws SQLException {
		return new AdminInventoryMovementLookupResponse.VariantOption(
				row.getString("inventory_domain"),
				row.getString("id"),
				row.getString("sku"),
				row.getString("name"),
				row.getString("specification"));
	}

	private Instant toInstant(ResultSet row, String column) throws SQLException {
		OffsetDateTime value = row.getObject(column, OffsetDateTime.class);

		return value == null ? null : value.toInstant();
	}

	private AdminInventoryMovementResponse toResponse(
			MovementHeader header,
			List<AdminInventoryMovementItemResponse> items) {
		return new AdminInventoryMovementResponse(
				header.id(),
				header.movementNo(),
				header.inventoryDomain(),
				header.movementType(),
				header.status(),
				header.sourceLocationId(),
				header.sourceLocationName(),
				header.destinationLocationId(),
				header.destinationLocationName(),
				header.employeeId(),
				header.employeeName(),
				header.reason(),
				header.occurredAt(),
				header.postedAt(),
				header.createdAt(),
				header.updatedAt(),
				header.conversionId(),
				header.pairedMovementId(),
				items);
	}

	public record IdPage(List<Long> ids, long totalElements) {
	}

	public record MovementState(
			long id,
			String inventoryDomain,
			String movementType,
			String status,
			String sourceLocationId,
			String destinationLocationId) {
	}

	public record LocationRecord(String id, String inventoryDomain, boolean active) {
	}

	public record VariantSnapshot(String id, String sku, String productName, String status) {
	}

	private record MovementHeader(
			long id,
			String movementNo,
			String inventoryDomain,
			String movementType,
			String status,
			String sourceLocationId,
			String sourceLocationName,
			String destinationLocationId,
			String destinationLocationName,
			String employeeId,
			String employeeName,
			String reason,
			Instant occurredAt,
			Instant postedAt,
			Instant createdAt,
			Instant updatedAt,
			Long conversionId,
			Long pairedMovementId) {
	}
}
