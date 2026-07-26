package com.yuruicamp.backend.order.infrastructure;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.yuruicamp.backend.order.api.AdminOrderDetailResponse;
import com.yuruicamp.backend.order.api.AdminOrderListResponse;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

// 後台訂單專用讀模型，避免商品明細與歷程 JOIN 放大分頁結果。
@Repository
public class AdminOrderReadRepository {

	private static final ZoneId TAIPEI = ZoneId.of("Asia/Taipei");
	private static final Map<String, String> SORT_COLUMNS = Map.of(
			"placedAt", "o.placed_at",
			"total", "o.total",
			"updatedAt", "o.updated_at");

	private final NamedParameterJdbcTemplate jdbc;

	public AdminOrderReadRepository(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public IdPage findIds(
			int page,
			int size,
			String query,
			List<String> statuses,
			List<String> paymentStatuses,
			List<String> paymentMethods,
			LocalDate placedFrom,
			LocalDate placedTo,
			String sortField,
			String direction) {
		StringBuilder where = new StringBuilder(" where 1=1 ");
		MapSqlParameterSource parameters = new MapSqlParameterSource();
		if (!query.isBlank()) {
			where.append(" and (lower(o.id) like :query or lower(o.display_no) like :query or lower(o.customer_id) like :query or lower(o.buyer_name_snapshot) like :query or lower(o.recipient_name_snapshot) like :query or lower(o.buyer_email_snapshot) like :query or lower(o.shipping_phone_snapshot) like :query) ");
			parameters.addValue("query", "%" + query.toLowerCase() + "%");
		}
		appendList(where, parameters, "o.status::text", "statuses", statuses);
		appendList(where, parameters, "o.payment_status::text", "paymentStatuses", paymentStatuses);
		appendList(where, parameters, "o.payment_method::text", "paymentMethods", paymentMethods);
		if (placedFrom != null) {
			where.append(" and o.placed_at >= :placedFrom ");
			parameters.addValue("placedFrom", placedFrom.atStartOfDay(TAIPEI).toInstant());
		}
		if (placedTo != null) {
			where.append(" and o.placed_at < :placedTo ");
			parameters.addValue("placedTo", placedTo.plusDays(1).atStartOfDay(TAIPEI).toInstant());
		}
		Long total = jdbc.queryForObject("select count(*) from orders o" + where, parameters, Long.class);
		String sortColumn = SORT_COLUMNS.get(sortField);
		parameters.addValue("limit", size).addValue("offset", (long) page * size);
		List<String> ids = jdbc.queryForList(
				"select o.id from orders o" + where + " order by " + sortColumn + " " + direction + ", o.id desc limit :limit offset :offset",
				parameters,
				String.class);

		return new IdPage(ids, total == null ? 0 : total);
	}

	public List<AdminOrderListResponse> findRows(List<String> ids) {
		if (ids.isEmpty()) {
			return List.of();
		}

		return jdbc.query("""
				select o.id, o.display_no, o.customer_id, c.name customer_name, o.recipient_name_snapshot,
				       o.total, o.payment_method::text, o.payment_status::text,
				       o.refund_status::text, o.status::text, o.placed_at, o.paid_at,
				       o.updated_at, count(i.id) item_count
				from orders o
				join customers c on c.id = o.customer_id
				left join order_items i on i.order_id = o.id
				where o.id in (:ids)
				group by o.id, c.name
				""", new MapSqlParameterSource("ids", ids), (rs, rowNum) -> new AdminOrderListResponse(
				rs.getString("id"), rs.getString("display_no"), rs.getString("customer_id"),
				rs.getString("customer_name"),
				rs.getString("recipient_name_snapshot"), money(rs.getBigDecimal("total")),
				rs.getString("payment_method"), rs.getString("payment_status"),
				rs.getString("refund_status"), rs.getString("status"), rs.getLong("item_count"),
				instant(rs, "placed_at"), nullableInstant(rs, "paid_at"), instant(rs, "updated_at")));
	}

	public Optional<DetailRow> findDetail(String id) {
		return jdbc.query("""
				select o.*, c.name customer_name, c.status::text customer_status
				from orders o join customers c on c.id = o.customer_id where o.id = :id
				""", new MapSqlParameterSource("id", id), (rs, rowNum) -> new DetailRow(
				rs.getString("id"), rs.getString("display_no"), rs.getString("customer_id"),
				rs.getString("customer_name"),
				rs.getString("customer_status"), rs.getString("buyer_name_snapshot"),
				rs.getString("buyer_email_snapshot"), rs.getString("recipient_name_snapshot"),
				rs.getString("shipping_phone_snapshot"), rs.getString("shipping_address_snapshot"),
				rs.getBigDecimal("subtotal"), rs.getBigDecimal("shipping_fee"),
				rs.getBigDecimal("discount"), rs.getBigDecimal("total"),
				rs.getString("payment_method"), rs.getString("payment_status"),
				rs.getString("refund_status"), rs.getString("status"),
				rs.getString("internal_note"),
				instant(rs, "placed_at"), nullableInstant(rs, "paid_at"), instant(rs, "updated_at")))
				.stream()
				.findFirst();
	}

	public List<AdminOrderDetailResponse.ItemSummary> findItems(String id) {
		return jdbc.query("""
				select *, unit_price_snapshot * quantity line_total from order_items
				where order_id = :id order by id
				""", new MapSqlParameterSource("id", id), (rs, rowNum) -> new AdminOrderDetailResponse.ItemSummary(
				rs.getLong("id"), rs.getString("product_id"), rs.getString("variant_id"),
				rs.getString("sku_snapshot"), rs.getString("product_name_snapshot"),
				rs.getString("specification_snapshot"), rs.getString("brand_name_snapshot"),
				rs.getString("image_url_snapshot"), money(rs.getBigDecimal("unit_price_snapshot")),
				rs.getInt("quantity"), money(rs.getBigDecimal("line_total"))));
	}

	public List<HistoryEntry> findHistoryEntries(String id) {
		return jdbc.query("""
				select h.status::text, h.occurred_at, h.actor_id, a.name actor_name, h.note
				from order_status_history h left join admin_users a on a.id = h.actor_id
				where h.order_id = :id order by h.occurred_at, h.id
				""", new MapSqlParameterSource("id", id), (rs, rowNum) -> new HistoryEntry(
				rs.getString("status"), instant(rs, "occurred_at"), rs.getString("actor_id"),
				rs.getString("actor_name"), rs.getString("note")));
	}

	private static void appendList(
			StringBuilder where,
			MapSqlParameterSource parameters,
			String column,
			String name,
			List<String> values) {
		if (!values.isEmpty()) {
			where.append(" and ").append(column).append(" in (:").append(name).append(") ");
			parameters.addValue(name, values);
		}
	}

	private static String money(BigDecimal value) {
		return value.setScale(2).toPlainString();
	}

	private static Instant instant(ResultSet rs, String column) throws SQLException {
		return rs.getObject(column, OffsetDateTime.class).toInstant();
	}

	private static Instant nullableInstant(ResultSet rs, String column) throws SQLException {
		OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
		return value == null ? null : value.toInstant();
	}

	public record IdPage(List<String> ids, long totalElements) {
	}

	public record DetailRow(
			String id, String displayNo, String customerId, String customerName, String customerStatus,
			String buyerName, String buyerEmail, String recipientName, String shippingPhone,
			String shippingAddress, BigDecimal subtotal, BigDecimal shippingFee,
			BigDecimal discount, BigDecimal total, String paymentMethod, String paymentStatus,
			String refundStatus, String status, String internalNote,
			Instant placedAt, Instant paidAt, Instant updatedAt) {
	}

	public record HistoryEntry(
			String status, Instant occurredAt, String actorId, String actorName, String note) {
	}
}
