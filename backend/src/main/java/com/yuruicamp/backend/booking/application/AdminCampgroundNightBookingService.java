package com.yuruicamp.backend.booking.application;

import java.time.LocalDate;
import java.util.List;

import com.yuruicamp.backend.booking.api.AdminCampgroundNightBookingRowResponse;
import com.yuruicamp.backend.booking.api.AdminCampgroundNightBookingsResponse;
import com.yuruicamp.backend.booking.infrastructure.AdminCampgroundNightBookingRepository;
import com.yuruicamp.backend.booking.infrastructure.AdminCampgroundNightBookingRepository.NightBookingRow;
import com.yuruicamp.backend.booking.infrastructure.AdminCampgroundRepository;
import com.yuruicamp.backend.booking.infrastructure.AdminCampgroundRepository.CampgroundRow;
import com.yuruicamp.backend.booking.infrastructure.AdminCampgroundZoneRepository;
import com.yuruicamp.backend.booking.infrastructure.AdminCampgroundZoneRepository.ZoneRow;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 用途：後台預約排程「單晚占用列表」（Admin UX follow-up ticket 02）。
 * Admin calendar day detail — occupying bookings for one night.
 */
@Service
public class AdminCampgroundNightBookingService {

	static final String ALL_ZONES = "__ALL__";

	private final AdminCampgroundRepository campgroundRepository;
	private final AdminCampgroundZoneRepository zoneRepository;
	private final AdminCampgroundNightBookingRepository nightBookingRepository;

	public AdminCampgroundNightBookingService(
			AdminCampgroundRepository campgroundRepository,
			AdminCampgroundZoneRepository zoneRepository,
			AdminCampgroundNightBookingRepository nightBookingRepository) {
		this.campgroundRepository = campgroundRepository;
		this.zoneRepository = zoneRepository;
		this.nightBookingRepository = nightBookingRepository;
	}

	@Transactional(readOnly = true)
	public AdminCampgroundNightBookingsResponse getBookingsForNight(
			String campgroundId,
			LocalDate date,
			String zoneId) {
		if (date == null) {
			throw validation("date is required");
		}

		CampgroundRow campground = campgroundRepository.findById(campgroundId);
		if (campground == null) {
			throw notFound("Campground not found: " + campgroundId);
		}

		String responseZoneId = ALL_ZONES;
		String queryZoneId = null;
		if (zoneId != null && !zoneId.isBlank() && !ALL_ZONES.equals(zoneId)) {
			ZoneRow zone = zoneRepository.findByCampgroundIdAndZoneId(campgroundId, zoneId);
			if (zone == null || !zone.active()) {
				throw notFound("Active zone not found: " + zoneId);
			}
			responseZoneId = zoneId;
			queryZoneId = zoneId;
		}

		List<AdminCampgroundNightBookingRowResponse> rows = nightBookingRepository
				.findOccupyingForNight(campgroundId, date, queryZoneId)
				.stream()
				.map(this::toResponse)
				.toList();

		return new AdminCampgroundNightBookingsResponse(
				campgroundId,
				date,
				responseZoneId,
				rows);
	}

	private AdminCampgroundNightBookingRowResponse toResponse(NightBookingRow row) {
		return new AdminCampgroundNightBookingRowResponse(
				row.bookingId(),
				row.displayNo(),
				row.customerId(),
				row.customerName(),
				row.zoneId(),
				row.zoneType(),
				row.quantity(),
				row.status(),
				row.checkIn(),
				row.checkOut());
	}

	private BusinessException validation(String message) {
		return new BusinessException(ErrorCode.VALIDATION_ERROR, message);
	}

	private BusinessException notFound(String message) {
		return new BusinessException(ErrorCode.NOT_FOUND, message);
	}
}
