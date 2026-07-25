package com.yuruicamp.backend.booking.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

import com.yuruicamp.backend.booking.api.AdminCalendarDateResponse;
import com.yuruicamp.backend.booking.api.AdminCalendarDateUpsertRequest;
import com.yuruicamp.backend.booking.infrastructure.AdminCalendarDateRepository;
import com.yuruicamp.backend.booking.infrastructure.AdminCalendarDateRepository.CalendarDateRow;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 用途：假日曆（特殊節日標記）查詢與 upsert（ADM-W4-03）。
 * 核心重點（給新手）：
 *   1. 這不是「週六日自動假日」——只有 is_holiday=true 的日期走特殊節日價。
 *   2. isHoliday=false → 刪除 DB 列，該日恢復一般日（跟從未標記一樣）。
 *   3. Booking 結帳已讀同一張表，Admin 改完立刻影響 holidayCount。
 * Admin calendar_dates; isHoliday=false deletes row (revert to general day).
 */
@Service
public class AdminCalendarDateService {

	private static final int MAX_RANGE_DAYS = 366;

	private final AdminCalendarDateRepository repository;
	private final Clock clock;

	public AdminCalendarDateService(AdminCalendarDateRepository repository, Clock clock) {
		this.repository = repository;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public List<AdminCalendarDateResponse> listRange(LocalDate from, LocalDate to) {
		validateRange(from, to);
		return repository.findRangeInclusive(from, to).stream().map(this::toResponse).toList();
	}

	@Transactional
	public AdminCalendarDateResponse upsert(LocalDate date, AdminCalendarDateUpsertRequest request) {
		if (request.isHoliday()) {
			String holidayName = normalizeHolidayName(request.holidayName());
			repository.upsertHoliday(date, holidayName, Instant.now(clock));
			return repository.findByDate(date)
					.map(this::toResponse)
					.orElseThrow(() -> new BusinessException(ErrorCode.INTERNAL_ERROR, "Calendar upsert failed"));
		}

		repository.deleteByDate(date);
		return new AdminCalendarDateResponse(date, false, null, null, null, null);
	}

	@Transactional
	public void delete(LocalDate date) {
		repository.deleteByDate(date);
	}

	private void validateRange(LocalDate from, LocalDate to) {
		if (from == null || to == null) {
			throw validation("from and to are required");
		}
		if (to.isBefore(from)) {
			throw validation("to must be on or after from");
		}
		long days = ChronoUnit.DAYS.between(from, to) + 1;
		if (days > MAX_RANGE_DAYS) {
			throw validation("date range must not exceed " + MAX_RANGE_DAYS + " days");
		}
	}

	private String normalizeHolidayName(String value) {
		if (value == null) {
			return null;
		}
		String trimmed = value.trim();
		return trimmed.isEmpty() ? null : trimmed;
	}

	private AdminCalendarDateResponse toResponse(CalendarDateRow row) {
		return new AdminCalendarDateResponse(
				row.calendarDate(),
				row.isHoliday(),
				row.holidayName(),
				row.sourceVersion(),
				row.effectiveAt(),
				row.updatedAt());
	}

	private BusinessException validation(String message) {
		return new BusinessException(ErrorCode.VALIDATION_ERROR, message);
	}
}
