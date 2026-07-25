package com.yuruicamp.backend.analytics.api;

import java.time.LocalDate;

public record AdminAnalyticsPeriodResponse(LocalDate from, LocalDate to) {
}
