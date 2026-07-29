package com.yuruicamp.backend.logistics.infrastructure;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** 電子地圖 MerchantTradeNo → orderId 對照（綠界 callback 不帶 Bearer）。 */
@Repository
public class EcpayLogisticsMapSessionRepository {

	private final JdbcTemplate jdbc;

	public EcpayLogisticsMapSessionRepository(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public void save(String merchantTradeNo, String orderId, Instant now) {
		jdbc.update("""
				insert into ecpay_logistics_map_sessions (merchant_trade_no, order_id, created_at)
				values (?, ?, ?)
				on conflict (merchant_trade_no) do update set order_id = excluded.order_id, created_at = excluded.created_at
				""", merchantTradeNo, orderId, OffsetDateTime.ofInstant(now, ZoneOffset.UTC));
	}

	public Optional<String> findOrderId(String merchantTradeNo) {
		return jdbc.query("""
				select order_id from ecpay_logistics_map_sessions where merchant_trade_no = ?
				""", (rs, rowNum) -> rs.getString("order_id"), merchantTradeNo)
				.stream()
				.findFirst();
	}
}
