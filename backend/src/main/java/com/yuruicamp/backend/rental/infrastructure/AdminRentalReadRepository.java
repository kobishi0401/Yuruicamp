package com.yuruicamp.backend.rental.infrastructure;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.yuruicamp.backend.rental.api.AdminRentalResponse;
import com.yuruicamp.backend.rental.api.AdminRentalStockLocationResponse;
import com.yuruicamp.backend.rental.api.AdminRentalVariantResponse;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * 後台租借 SKU 讀模型：先分頁出 {@code rental_skus.id}，再批次組回規格＋唯讀庫存。
 * Admin rental SKU read model：paginate ids first, then batch-assemble variants and stocks.
 *
 * <p>庫存讀法對齊 {@code AdminProductReadRepository#findStocks}：
 * {@code rental_sku_variant_stocks} ＋ active {@code rental_stock_reservations}。</p>
 */
@Repository
public class AdminRentalReadRepository {

	private static final Map<String, String> SORT_COLUMNS = Map.of(
			"id", "sku.id",
			"name", "item.name",
			"createdAt", "sku.created_at",
			"updatedAt", "sku.updated_at");

	private final NamedParameterJdbcTemplate jdbc;

	public AdminRentalReadRepository(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public static String resolveSortColumn(String sortField) {
		return SORT_COLUMNS.get(sortField);
	}

	public IdPage findIds(
			int page,
			int size,
			String query,
			String status,
			Long categoryId,
			String brandId,
			String sortField,
			String sortDirection) {
		MapSqlParameterSource parameters = new MapSqlParameterSource()
				.addValue("query", "%" + query.toLowerCase(Locale.ROOT) + "%")
				.addValue("limit", size)
				.addValue("offset", page * size);
		String where = buildWhere(parameters, status, categoryId, brandId);
		String from = " FROM rental_skus sku JOIN equipment_items item ON item.id = sku.item_id ";
		long totalElements = jdbc.queryForObject(
				"SELECT count(*) " + from + where,
				parameters,
				Long.class);
		String orderBy = SORT_COLUMNS.get(sortField) + " " + sortDirection + ", sku.id ASC";
		List<String> ids = jdbc.queryForList(
				"SELECT sku.id " + from + where + " ORDER BY " + orderBy
						+ " LIMIT :limit OFFSET :offset",
				parameters,
				String.class);

		return new IdPage(ids, totalElements);
	}

	public List<AdminRentalResponse> findRentals(List<String> ids) {
		if (ids.isEmpty()) {
			return List.of();
		}
		MapSqlParameterSource parameters = new MapSqlParameterSource("ids", ids);
		List<RentalHeader> headers = jdbc.query("""
				SELECT sku.id, sku.item_id, sku.status,
				       item.name, item.description, item.category_id,
				       category.name AS category_name,
				       item.brand_id, brand.name AS brand_name,
				       sku.created_at, sku.updated_at
				FROM rental_skus sku
				JOIN equipment_items item ON item.id = sku.item_id
				JOIN product_categories category ON category.id = item.category_id
				LEFT JOIN brands brand ON brand.id = item.brand_id
				WHERE sku.id IN (:ids)
				""", parameters, (row, rowNumber) -> new RentalHeader(
				row.getString("id"),
				row.getString("item_id"),
				row.getString("status"),
				row.getString("name"),
				row.getString("description"),
				row.getLong("category_id"),
				row.getString("category_name"),
				row.getString("brand_id"),
				row.getString("brand_name"),
				row.getObject("created_at", OffsetDateTime.class),
				row.getObject("updated_at", OffsetDateTime.class)));

		Map<String, List<VariantRow>> variantsBySku = findVariantRows(parameters);
		Map<String, List<AdminRentalStockLocationResponse>> stocksByVariant = findStocks(parameters);
		Map<String, RentalHeader> headersById = new HashMap<>();
		headers.forEach(header -> headersById.put(header.id(), header));

		List<AdminRentalResponse> result = new ArrayList<>();
		for (String id : ids) {
			RentalHeader header = headersById.get(id);
			if (header == null) {
				continue;
			}
			List<AdminRentalVariantResponse> variants = toVariants(
					variantsBySku.getOrDefault(id, List.of()),
					stocksByVariant);
			result.add(toResponse(header, variants));
		}

		return result;
	}

	private Map<String, List<VariantRow>> findVariantRows(MapSqlParameterSource parameters) {
		Map<String, List<VariantRow>> result = new LinkedHashMap<>();
		jdbc.query("""
				SELECT rental_sku_id, id, sku, color, size, specification, status, created_at, updated_at
				FROM rental_sku_variants
				WHERE rental_sku_id IN (:ids)
				ORDER BY rental_sku_id, id
				""", parameters, row -> {
			VariantRow variant = new VariantRow(
					row.getString("id"),
					row.getString("sku"),
					row.getString("color"),
					row.getString("size"),
					row.getString("specification"),
					row.getString("status"),
					row.getObject("created_at", OffsetDateTime.class),
					row.getObject("updated_at", OffsetDateTime.class));
			result.computeIfAbsent(row.getString("rental_sku_id"), ignored -> new ArrayList<>())
					.add(variant);
		});

		return result;
	}

	/**
	 * 批次讀取租借規格在各庫位的 on_hand 與 active 保留量。
	 * Batch-load rental on-hand + active reservations per location.
	 */
	private Map<String, List<AdminRentalStockLocationResponse>> findStocks(
			MapSqlParameterSource parameters) {
		Map<String, List<AdminRentalStockLocationResponse>> result = new HashMap<>();
		jdbc.query("""
				WITH stock_keys AS (
				    SELECT stock.rental_sku_variant_id AS variant_id, stock.location_id
				    FROM rental_sku_variant_stocks stock
				    UNION
				    SELECT reservation.rental_sku_variant_id, reservation.location_id
				    FROM rental_stock_reservations reservation
				    WHERE reservation.status = 'active'
				), reservations AS (
				    SELECT rental_sku_variant_id AS variant_id, location_id, sum(quantity) AS quantity
				    FROM rental_stock_reservations
				    WHERE status = 'active'
				    GROUP BY rental_sku_variant_id, location_id
				)
				SELECT variant.id AS variant_id,
				       location.id AS location_id, location.code AS location_code,
				       location.type AS location_type, location.name,
				       COALESCE(stock.on_hand_quantity, 0) AS on_hand_quantity,
				       COALESCE(reservation.quantity, 0) AS reserved_quantity
				FROM rental_sku_variants variant
				JOIN stock_keys key ON key.variant_id = variant.id
				JOIN inventory_locations location ON location.id = key.location_id
				LEFT JOIN rental_sku_variant_stocks stock
				       ON stock.rental_sku_variant_id = key.variant_id
				      AND stock.location_id = key.location_id
				LEFT JOIN reservations reservation
				       ON reservation.variant_id = key.variant_id
				      AND reservation.location_id = key.location_id
				WHERE variant.rental_sku_id IN (:ids)
				  AND location.inventory_domain = 'rental'
				ORDER BY variant.id, location.type, location.id
				""", parameters, row -> {
			int onHand = row.getInt("on_hand_quantity");
			int reserved = row.getInt("reserved_quantity");
			AdminRentalStockLocationResponse stock = new AdminRentalStockLocationResponse(
					row.getString("location_id"),
					row.getString("location_code"),
					row.getString("location_type"),
					row.getString("name"),
					onHand,
					reserved,
					Math.max(onHand - reserved, 0));
			result.computeIfAbsent(row.getString("variant_id"), ignored -> new ArrayList<>())
					.add(stock);
		});

		return result;
	}

	private List<AdminRentalVariantResponse> toVariants(
			List<VariantRow> rows,
			Map<String, List<AdminRentalStockLocationResponse>> stocksByVariant) {
		List<AdminRentalVariantResponse> result = new ArrayList<>();
		for (VariantRow row : rows) {
			List<AdminRentalStockLocationResponse> locations = stocksByVariant
					.getOrDefault(row.id(), List.of());
			int onHand = locations.stream()
					.mapToInt(AdminRentalStockLocationResponse::onHandQuantity)
					.sum();
			int reserved = locations.stream()
					.mapToInt(AdminRentalStockLocationResponse::reservedQuantity)
					.sum();
			result.add(new AdminRentalVariantResponse(
					row.id(),
					row.sku(),
					row.color(),
					row.size(),
					row.specification(),
					row.status(),
					onHand,
					reserved,
					Math.max(onHand - reserved, 0),
					locations,
					row.createdAt().toInstant(),
					row.updatedAt().toInstant()));
		}

		return result;
	}

	private String buildWhere(
			MapSqlParameterSource parameters,
			String status,
			Long categoryId,
			String brandId) {
		StringBuilder where = new StringBuilder("""
				 WHERE (lower(sku.id) LIKE :query
				    OR lower(item.name) LIKE :query
				    OR EXISTS (
				        SELECT 1 FROM rental_sku_variants variant
				        WHERE variant.rental_sku_id = sku.id AND lower(variant.sku) LIKE :query))
				""");
		if (!status.isBlank()) {
			where.append(" AND sku.status = :status");
			parameters.addValue("status", status);
		}
		if (categoryId != null) {
			where.append(" AND item.category_id = :categoryId");
			parameters.addValue("categoryId", categoryId);
		}
		if (!brandId.isBlank()) {
			where.append(" AND item.brand_id = :brandId");
			parameters.addValue("brandId", brandId);
		}

		return where.toString();
	}

	private AdminRentalResponse toResponse(RentalHeader header, List<AdminRentalVariantResponse> variants) {
		return new AdminRentalResponse(
				header.id(), header.itemId(), header.status(), header.name(),
				header.categoryId(), header.category(), header.brandId(), header.brand(),
				header.description(), variants,
				header.createdAt().toInstant(), header.updatedAt().toInstant());
	}

	public record IdPage(List<String> ids, long totalElements) {
	}

	private record RentalHeader(
			String id,
			String itemId,
			String status,
			String name,
			String description,
			Long categoryId,
			String category,
			String brandId,
			String brand,
			OffsetDateTime createdAt,
			OffsetDateTime updatedAt) {
	}

	private record VariantRow(
			String id,
			String sku,
			String color,
			String size,
			String specification,
			String status,
			OffsetDateTime createdAt,
			OffsetDateTime updatedAt) {
	}
}
