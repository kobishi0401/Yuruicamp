package com.yuruicamp.backend.booking.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import com.yuruicamp.backend.booking.api.AdminCampgroundZoneCreateRequest;
import com.yuruicamp.backend.booking.api.AdminCampgroundZoneResponse;
import com.yuruicamp.backend.booking.api.AdminCampgroundZoneUpdateRequest;
import com.yuruicamp.backend.booking.infrastructure.AdminCampgroundZoneRepository;
import com.yuruicamp.backend.booking.infrastructure.AdminCampgroundZoneRepository.ZoneRow;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 用途：營位主檔 CRUD、容量驗證與安全刪除（ADM-W4-02）。
 * 核心重點（給新手）：
 *   1. 營位掛在營區底下；URL 的 campgroundId 必須跟 DB 列一致。
 *   2. 調降 totalSites 時，用 DB 函式 get_zone_availability 算「占用峰值」；
 *      若新容量 < 峰值 → 409，避免 pending/confirmed 預約變成超訂。
 *   3. 公開 check-availability 讀的是 active 營位 + 當下 totalSites，所以改完立刻生效。
 * Admin zone CRUD; lowering totalSites below peak occupancy returns 409.
 */
@Service
public class AdminCampgroundZoneService {

	private static final ZoneId TAIPEI = ZoneId.of("Asia/Taipei");
	private static final int DEFAULT_BOOKING_WINDOW_DAYS = 365;

	private final AdminCampgroundZoneRepository repository;
	private final Clock clock;

	public AdminCampgroundZoneService(AdminCampgroundZoneRepository repository, Clock clock) {
		this.repository = repository;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public List<AdminCampgroundZoneResponse> list(String campgroundId) {
		ensureCampgroundExists(campgroundId);
		return repository.findAllByCampgroundId(campgroundId).stream().map(this::toResponse).toList();
	}

	@Transactional(readOnly = true)
	public AdminCampgroundZoneResponse get(String campgroundId, String zoneId) {
		ZoneRow row = requireZone(campgroundId, zoneId);
		return toResponse(row);
	}

	@Transactional
	public AdminCampgroundZoneResponse create(String campgroundId, AdminCampgroundZoneCreateRequest request) {
		ensureCampgroundExists(campgroundId);

		String id = normalizeRequired(request.id(), "Zone id");
		String type = normalizeRequired(request.type(), "Zone type");
		int capacityPerSite = request.capacityPerSite() == null ? 1 : request.capacityPerSite();
		BigDecimal priceWeekday = normalizeMoney(request.priceWeekday(), "priceWeekday");
		BigDecimal priceHoliday = normalizeMoney(request.priceHoliday(), "priceHoliday");
		int totalSites = request.totalSites();
		boolean active = request.active() == null || request.active();

		if (repository.findByCampgroundIdAndZoneId(campgroundId, id) != null) {
			throw conflict("Zone id already exists in this campground");
		}
		try {
			repository.insert(id, campgroundId, type, capacityPerSite,
					priceWeekday, priceHoliday, totalSites, active, Instant.now(clock));
			return get(campgroundId, id);
		}
		catch (DataIntegrityViolationException ex) {
			throw conflict("Zone id already exists or campground is invalid");
		}
	}

	@Transactional
	public AdminCampgroundZoneResponse update(
			String campgroundId,
			String zoneId,
			AdminCampgroundZoneUpdateRequest request) {
		ZoneRow existing = requireZoneForUpdate(campgroundId, zoneId);

		String type = request.type() == null ? existing.type() : normalizeRequired(request.type(), "Zone type");
		int capacityPerSite = request.capacityPerSite() == null
				? existing.capacityPerSite()
				: request.capacityPerSite();
		BigDecimal priceWeekday = request.priceWeekday() == null
				? existing.priceWeekday()
				: normalizeMoney(request.priceWeekday(), "priceWeekday");
		BigDecimal priceHoliday = request.priceHoliday() == null
				? existing.priceHoliday()
				: normalizeMoney(request.priceHoliday(), "priceHoliday");
		int totalSites = request.totalSites() == null ? existing.totalSites() : request.totalSites();
		boolean active = request.active() == null ? existing.active() : request.active();

		if (totalSites < existing.totalSites()) {
			validateTotalSitesNotBelowPeak(campgroundId, zoneId, totalSites);
		}

		try {
			repository.update(campgroundId, zoneId, type, capacityPerSite,
					priceWeekday, priceHoliday, totalSites, active, Instant.now(clock));
			return get(campgroundId, zoneId);
		}
		catch (DataIntegrityViolationException ex) {
			throw conflict("Zone update violates a database constraint");
		}
	}

	@Transactional
	public void delete(String campgroundId, String zoneId) {
		ZoneRow existing = requireZoneForUpdate(campgroundId, zoneId);
		if (hasReferences(existing.id())) {
			throw conflict("Zone is referenced by bookings or zone blocks; set active=false instead");
		}
		repository.delete(campgroundId, zoneId);
	}

	private void validateTotalSitesNotBelowPeak(String campgroundId, String zoneId, int proposedTotalSites) {
		LocalDate from = LocalDate.now(clock.withZone(TAIPEI));
		LocalDate to = from.plusDays(bookingWindowDays());
		long peakUsage = repository.findPeakUsageFrom(campgroundId, zoneId, from, to);
		if (proposedTotalSites < peakUsage) {
			throw conflict(
					"totalSites " + proposedTotalSites + " is below peak occupancy " + peakUsage
							+ "; cancel or move bookings first, or set active=false");
		}
	}

	private int bookingWindowDays() {
		return repository.findBookingWindowDays().orElse(DEFAULT_BOOKING_WINDOW_DAYS);
	}

	private boolean hasReferences(String zoneId) {
		return repository.countBookingSelectedZoneReferences(zoneId) > 0
				|| repository.countZoneBlockReferences(zoneId) > 0;
	}

	private void ensureCampgroundExists(String campgroundId) {
		if (!repository.campgroundExists(campgroundId)) {
			throw notFound("Campground not found");
		}
	}

	private ZoneRow requireZone(String campgroundId, String zoneId) {
		ZoneRow row = repository.findByCampgroundIdAndZoneId(campgroundId, zoneId);
		if (row == null) {
			throw notFound("Zone not found");
		}
		return row;
	}

	private ZoneRow requireZoneForUpdate(String campgroundId, String zoneId) {
		ZoneRow row = repository.lockByCampgroundIdAndZoneId(campgroundId, zoneId);
		if (row == null) {
			throw notFound("Zone not found");
		}
		return row;
	}

	private String normalizeRequired(String value, String label) {
		String trimmed = value == null ? "" : value.trim();
		if (trimmed.isBlank()) {
			throw validation(label + " must not be blank");
		}
		return trimmed;
	}

	private BigDecimal normalizeMoney(BigDecimal value, String label) {
		if (value == null) {
			throw validation(label + " must not be null");
		}
		if (value.compareTo(BigDecimal.ZERO) < 0) {
			throw validation(label + " must be >= 0");
		}
		return value.setScale(2, RoundingMode.HALF_UP);
	}

	private AdminCampgroundZoneResponse toResponse(ZoneRow row) {
		return new AdminCampgroundZoneResponse(
				row.id(),
				row.campgroundId(),
				row.type(),
				row.capacityPerSite(),
				money(row.priceWeekday()),
				money(row.priceHoliday()),
				row.totalSites(),
				row.active(),
				row.createdAt(),
				row.updatedAt());
	}

	private String money(BigDecimal value) {
		return value.setScale(2, RoundingMode.HALF_UP).toPlainString();
	}

	private BusinessException notFound(String message) {
		return new BusinessException(ErrorCode.NOT_FOUND, message);
	}

	private BusinessException conflict(String message) {
		return new BusinessException(ErrorCode.CONFLICT, message);
	}

	private BusinessException validation(String message) {
		return new BusinessException(ErrorCode.VALIDATION_ERROR, message);
	}
}
