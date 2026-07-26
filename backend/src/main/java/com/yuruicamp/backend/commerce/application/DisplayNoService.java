package com.yuruicamp.backend.commerce.application;

import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 分配人類可讀顯示編號（ORD-0001、BK-0042）；與內部 UUID 主鍵分離。
 * Allocates human-readable display numbers separate from internal UUID ids.
 */
@Service
public class DisplayNoService {

	private final JdbcTemplate jdbcTemplate;

	public DisplayNoService(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	public String nextOrderDisplayNo() {
		long seq = requireSequence("select nextval('order_display_no_seq')");
		return format("ORD", seq);
	}

	public String nextBookingDisplayNo() {
		long seq = requireSequence("select nextval('booking_display_no_seq')");
		return format("BK", seq);
	}

	private long requireSequence(String sql) {
		Long value = jdbcTemplate.queryForObject(sql, Long.class);
		if (value == null) {
			throw new IllegalStateException("Display number sequence returned null");
		}

		return value;
	}

	private static String format(String prefix, long sequence) {
		return prefix + "-" + String.format("%04d", sequence);
	}

	/** 依內部 id 查顯示編號（ECPay 導回 URL 用） / Lookup display no by internal id for return redirect */
	public Optional<String> findOrderDisplayNo(String orderId) {
		return findDisplayNo("select display_no from orders where id = ?", orderId);
	}

	public Optional<String> findBookingDisplayNo(String bookingId) {
		return findDisplayNo("select display_no from bookings where id = ?", bookingId);
	}

	private Optional<String> findDisplayNo(String sql, String id) {
		if (id == null || id.isBlank()) {
			return Optional.empty();
		}
		try {
			return Optional.ofNullable(jdbcTemplate.queryForObject(sql, String.class, id.trim()));
		} catch (org.springframework.dao.EmptyResultDataAccessException ex) {
			return Optional.empty();
		}
	}
}
