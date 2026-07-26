package com.yuruicamp.backend.booking.application;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import com.yuruicamp.backend.booking.api.AdminCampgroundAvailabilityResponse;
import com.yuruicamp.backend.booking.api.AdminCampgroundDayAvailabilityResponse;
import com.yuruicamp.backend.booking.infrastructure.AdminCalendarDateRepository;
import com.yuruicamp.backend.booking.infrastructure.AdminCalendarDateRepository.CalendarDateRow;
import com.yuruicamp.backend.booking.infrastructure.AdminCampgroundAvailabilityRepository;
import com.yuruicamp.backend.booking.infrastructure.AdminCampgroundAvailabilityRepository.ClosureRow;
import com.yuruicamp.backend.booking.infrastructure.AdminCampgroundAvailabilityRepository.ZoneAvailabilityDetailRow;
import com.yuruicamp.backend.booking.infrastructure.AdminCampgroundRepository;
import com.yuruicamp.backend.booking.infrastructure.AdminCampgroundRepository.CampgroundRow;
import com.yuruicamp.backend.booking.infrastructure.AdminCampgroundZoneRepository;
import com.yuruicamp.backend.booking.infrastructure.AdminCampgroundZoneRepository.ZoneRow;
import com.yuruicamp.backend.booking.infrastructure.BookingPublicRepository;
import com.yuruicamp.backend.booking.infrastructure.BookingPublicRepository.PolicyRow;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 用途：後台預約排程月曆可用性（Admin UX ticket 03）。
 * 核心重點（給新手）：
 *   1. 資料來源是 DB 函式 get_zone_availability，跟公開 check-availability 同一套規則。
 *   2. 未傳 zoneId 時，只加總 active 營位的 capacity／remaining。
 *   3. status 依 booking policy 視窗與 lowAvailabilityThreshold 推導，對齊月曆圖例。
 * Admin campground availability for schedule calendar.
 */
@Service
public class AdminCampgroundAvailabilityService {

	static final String ALL_ZONES = "__ALL__";
	private static final int MAX_RANGE_DAYS = 366;

	private final AdminCampgroundRepository campgroundRepository;
	private final AdminCampgroundZoneRepository zoneRepository;
	private final AdminCampgroundAvailabilityRepository availabilityRepository;
	private final AdminCalendarDateRepository calendarDateRepository;
	private final BookingPublicRepository bookingPublicRepository;

	public AdminCampgroundAvailabilityService(
			AdminCampgroundRepository campgroundRepository,
			AdminCampgroundZoneRepository zoneRepository,
			AdminCampgroundAvailabilityRepository availabilityRepository,
			AdminCalendarDateRepository calendarDateRepository,
			BookingPublicRepository bookingPublicRepository) {
		this.campgroundRepository = campgroundRepository;
		this.zoneRepository = zoneRepository;
		this.availabilityRepository = availabilityRepository;
		this.calendarDateRepository = calendarDateRepository;
		this.bookingPublicRepository = bookingPublicRepository;
	}

	@Transactional(readOnly = true)
	public AdminCampgroundAvailabilityResponse getAvailability(
			String campgroundId,
			LocalDate from,
			LocalDate to,
			String zoneId) {
		validateRange(from, to);

		CampgroundRow campground = campgroundRepository.findById(campgroundId);
		if (campground == null) {
			throw notFound("Campground not found: " + campgroundId);
		}

		List<ZoneRow> zones = zoneRepository.findAllByCampgroundId(campgroundId);

		String responseZoneId = ALL_ZONES;
		String queryZoneId = null;
		final Set<String> scopeZoneIds;
		if (zoneId != null && !zoneId.isBlank() && !ALL_ZONES.equals(zoneId)) {
			ZoneRow zone = zoneRepository.findByCampgroundIdAndZoneId(campgroundId, zoneId);
			if (zone == null || !zone.active()) {
				throw notFound("Active zone not found: " + zoneId);
			}
			responseZoneId = zoneId;
			queryZoneId = zoneId;
			scopeZoneIds = Set.of(zoneId);
		} else {
			scopeZoneIds = zones.stream()
					.filter(ZoneRow::active)
					.map(ZoneRow::id)
					.collect(Collectors.toSet());
		}

		PolicyRow policy = bookingPublicRepository.findPolicy()
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Booking policy not found"));
		List<ZoneAvailabilityDetailRow> rows = availabilityRepository.findZoneAvailabilityDetailed(
				from, to, campgroundId, queryZoneId);
		rows = rows.stream()
				.filter(row -> scopeZoneIds.contains(row.zoneId()))
				.toList();

		Map<LocalDate, CalendarDateRow> holidayByDate = calendarDateRepository.findRangeInclusive(from, to)
				.stream()
				.collect(Collectors.toMap(CalendarDateRow::calendarDate, row -> row, (left, right) -> left));
		List<ClosureRow> closures = availabilityRepository.findClosuresByCampgroundId(campgroundId);

		Map<LocalDate, DayAggregate> aggregates = aggregateByDate(rows);
		List<AdminCampgroundDayAvailabilityResponse> days = new ArrayList<>();
		for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
			DayAggregate aggregate = aggregates.getOrDefault(date, DayAggregate.empty());
			CalendarDateRow holiday = holidayByDate.get(date);
			boolean isHoliday = holiday != null && holiday.isHoliday();
			String holidayName = isHoliday ? holiday.holidayName() : null;
			boolean isClosed = aggregate.closed;
			String closureReason = isClosed ? resolveClosureReason(campgroundId, date, closures) : null;
			String status = deriveStatus(date, aggregate, isClosed, policy);

			days.add(new AdminCampgroundDayAvailabilityResponse(
					date,
					isClosed,
					closureReason,
					isHoliday,
					holidayName,
					aggregate.capacity,
					aggregate.remaining,
					aggregate.booked,
					aggregate.blocked,
					status));
		}

		int capacity = zones.stream()
				.filter(zone -> scopeZoneIds.contains(zone.id()))
				.mapToInt(ZoneRow::totalSites)
				.sum();
		return new AdminCampgroundAvailabilityResponse(
				campgroundId,
				responseZoneId,
				from,
				to,
				capacity,
				days);
	}

	private Map<LocalDate, DayAggregate> aggregateByDate(List<ZoneAvailabilityDetailRow> rows) {
		Map<LocalDate, DayAggregate> aggregates = new LinkedHashMap<>();
		for (ZoneAvailabilityDetailRow row : rows) {
			DayAggregate aggregate = aggregates.computeIfAbsent(row.stayDate(), ignored -> new DayAggregate());
			aggregate.capacity += row.totalSites();
			aggregate.remaining += Math.toIntExact(row.availableQuantity());
			aggregate.booked += Math.toIntExact(row.bookedQuantity());
			aggregate.blocked += Math.toIntExact(row.blockedQuantity());
			aggregate.closed = aggregate.closed || row.closed();
		}
		return aggregates;
	}

	private String deriveStatus(LocalDate date, DayAggregate aggregate, boolean isClosed, PolicyRow policy) {
		if (isClosed) {
			return "closed";
		}
		if (!isWithinBookingWindow(date, policy)) {
			return "out_of_window";
		}
		if (aggregate.remaining <= 0) {
			return "full";
		}
		if (aggregate.remaining <= policy.lowAvailabilityThreshold()) {
			return "low";
		}
		return "available";
	}

	private boolean isWithinBookingWindow(LocalDate date, PolicyRow policy) {
		LocalDate today = LocalDate.now(ZoneId.of(policy.timezone()));
		LocalDate earliest = today.plusDays(policy.advanceDays());
		LocalDate latest = today.plusDays(policy.bookingWindowDays());
		return !date.isBefore(earliest) && !date.isAfter(latest);
	}

	private String resolveClosureReason(String campgroundId, LocalDate date, List<ClosureRow> closures) {
		for (ClosureRow closure : closures) {
			if (!campgroundId.equals(closure.campgroundId())) {
				continue;
			}
			if (isClosedOnDate(closure, date)) {
				return closure.reason() == null || closure.reason().isBlank() ? "公休" : closure.reason();
			}
		}
		return "公休";
	}

	private boolean isClosedOnDate(ClosureRow closure, LocalDate date) {
		String type = closure.closureType() == null ? "date_range" : closure.closureType();
		if ("weekly".equals(type)) {
			int javaDow = date.getDayOfWeek().getValue() % 7; // Mon=1..Sun=7 -> Sun=0
			if (closure.weekday() == null || closure.weekday() != javaDow) {
				return false;
			}
			if (closure.effectiveFrom() != null && date.isBefore(closure.effectiveFrom())) {
				return false;
			}
			if (closure.effectiveTo() != null && date.isAfter(closure.effectiveTo())) {
				return false;
			}
			return true;
		}

		LocalDate start = closure.startDate();
		LocalDate end = closure.endDate();
		if (start == null || end == null) {
			return false;
		}
		// date_range：左閉右開 [startDate, endDate)
		return !date.isBefore(start) && date.isBefore(end);
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

	private BusinessException validation(String message) {
		return new BusinessException(ErrorCode.VALIDATION_ERROR, message);
	}

	private BusinessException notFound(String message) {
		return new BusinessException(ErrorCode.NOT_FOUND, message);
	}

	private static final class DayAggregate {
		int capacity;
		int remaining;
		int booked;
		int blocked;
		boolean closed;

		static DayAggregate empty() {
			return new DayAggregate();
		}
	}
}
