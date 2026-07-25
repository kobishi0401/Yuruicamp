package com.yuruicamp.backend.order.domain;

/**
 * 對齊 DB {@code refund_status} ENUM（含 processing／failed）。
 * Matches schema refund_status including processing and failed.
 */
public enum RefundStatus {
	none,
	requested,
	approved,
	processing,
	refunded,
	rejected,
	failed
}
