package com.yuruicamp.backend.analytics.api;

/**
 * 分析報表類別占比列（商城營收或租借次數）。
 * Analytics category breakdown row — revenue (shop) or rental quantity (booking).
 */
public record AdminAnalyticsCategoryBreakdownRow(String label, String value) {
}
