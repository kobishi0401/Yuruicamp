package com.yuruicamp.backend.booking.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import com.yuruicamp.backend.booking.api.BookingAvailabilityRentalRequest;
import com.yuruicamp.backend.booking.api.BookingAvailabilityRequest;
import com.yuruicamp.backend.booking.api.BookingAvailabilityResponse;
import com.yuruicamp.backend.booking.api.BookingAvailabilityZoneRequest;
import com.yuruicamp.backend.booking.api.BookingPolicyResponse;
import com.yuruicamp.backend.booking.api.BookingRentalAvailabilityResponse;
import com.yuruicamp.backend.booking.api.BookingZoneAvailabilityResponse;
import com.yuruicamp.backend.booking.api.CampgroundClosureResponse;
import com.yuruicamp.backend.booking.api.CampgroundResponse;
import com.yuruicamp.backend.booking.api.RentalEquipmentResponse;
import com.yuruicamp.backend.booking.api.ZoneResponse;
import com.yuruicamp.backend.booking.infrastructure.BookingPublicRepository;
import com.yuruicamp.backend.booking.infrastructure.BookingPublicRepository.CampgroundRow;
import com.yuruicamp.backend.booking.infrastructure.BookingPublicRepository.ClosureRow;
import com.yuruicamp.backend.booking.infrastructure.BookingPublicRepository.PolicyRow;
import com.yuruicamp.backend.booking.infrastructure.BookingPublicRepository.RentalEquipmentRow;
import com.yuruicamp.backend.booking.infrastructure.BookingPublicRepository.ZoneRow;
import com.yuruicamp.backend.booking.infrastructure.BookingPublicRepository.RentalStockRow;
import com.yuruicamp.backend.booking.infrastructure.BookingPublicRepository.ZoneAvailabilityRow;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// Booking 公開用例；處理 E-1 資料讀取與 E-2 跨日可用性。
@Service
public class BookingPublicService {

	private static final String CAMPGROUND_CLOSED = "CAMPGROUND_CLOSED";
	private static final String ZONE_UNAVAILABLE = "ZONE_UNAVAILABLE";
	private static final String RENTAL_UNAVAILABLE = "RENTAL_UNAVAILABLE";

	private final BookingPublicRepository repository;

	public BookingPublicService(BookingPublicRepository repository) {
		this.repository = repository;
	}

	@Transactional(readOnly = true)
	public List<CampgroundResponse> listCampgrounds() {
		return repository.findActiveCampgrounds()
				.stream()
				.map(row -> toCampground(row, null))
				.toList();
	}

	@Transactional(readOnly = true)
	public CampgroundResponse getCampground(String id) {
		CampgroundRow campground = repository.findActiveCampground(id)
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Campground not found: " + id));
		List<ZoneResponse> zones = repository.findActiveZones(id)
				.stream()
				.map(this::toZone)
				.toList();

		return toCampground(campground, zones);
	}

	@Transactional(readOnly = true)
	public List<RentalEquipmentResponse> listEquipment(String campgroundId) {
		return repository.findActiveRentalEquipment(campgroundId)
				.stream()
				.map(this::toRentalEquipment)
				.toList();
	}

	@Transactional(readOnly = true)
	public BookingPolicyResponse getPolicy() {
		PolicyRow policy = repository.findPolicy()
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Booking policy not found"));
		List<String> occupyingStatuses = repository.findOccupyingStatuses();

		return new BookingPolicyResponse(
				policy.bookingWindowDays(),
				policy.advanceDays(),
				policy.maxNights(),
				policy.timezone(),
				policy.dateBoundaryHour(),
				policy.lowAvailabilityThreshold(),
				occupyingStatuses);
	}

	@Transactional(readOnly = true)
	public List<CampgroundClosureResponse> listClosures() {
		return repository.findClosuresForActiveCampgrounds()
				.stream()
				.map(this::toClosure)
				.toList();
	}

	// E-2 只讀取整段住宿期間的可用量，不建立 Booking，也不鎖營位。
	@Transactional(readOnly = true)
	public BookingAvailabilityResponse checkAvailability(BookingAvailabilityRequest request) {
		List<BookingAvailabilityZoneRequest> requestedZones =
				request.zones() == null ? List.of() : request.zones();
		List<BookingAvailabilityRentalRequest> requestedRentals =
				request.rentals() == null ? List.of() : request.rentals();
		if (requestedZones.isEmpty() && requestedRentals.isEmpty()) {
			throw new BusinessException(
					ErrorCode.VALIDATION_ERROR,
					"At least one zone or rental must be requested");
		}

		LocalDate checkIn = parseDate(request.checkIn(), "checkIn");
		LocalDate checkOut = parseDate(request.checkOut(), "checkOut");
		if (!checkOut.isAfter(checkIn)) {
			throw new BusinessException(
					ErrorCode.BOOKING_DATE_INVALID,
					"checkOut must be after checkIn");
		}

		PolicyRow policy = repository.findPolicy()
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Booking policy not found"));
		validateBookingWindow(checkIn, checkOut, policy);

		repository.findActiveCampground(request.campgroundId())
				.orElseThrow(() -> new BusinessException(
						ErrorCode.NOT_FOUND,
						"Campground not found: " + request.campgroundId()));
		Map<String, ZoneRow> activeZones = new LinkedHashMap<>();
		repository.findActiveZones(request.campgroundId())
				.forEach(zone -> activeZones.put(zone.id(), zone));
		if (!requestedZones.isEmpty()) {
			validateRequestedZones(requestedZones, activeZones);
		}
		validateRequestedRentals(requestedRentals);

		Set<String> reasons = new LinkedHashSet<>();
		List<BookingZoneAvailabilityResponse> zones = new ArrayList<>();

		if (!requestedZones.isEmpty()) {
			List<ZoneAvailabilityRow> rows = repository.findZoneAvailability(
					checkIn,
					checkOut.minusDays(1),
					request.campgroundId());
			Map<String, List<ZoneAvailabilityRow>> rowsByZone = rows.stream()
					.collect(Collectors.groupingBy(ZoneAvailabilityRow::zoneId));

			for (BookingAvailabilityZoneRequest requested : requestedZones) {
				List<ZoneAvailabilityRow> zoneRows = rowsByZone.getOrDefault(requested.zoneId(), List.of());
				int availableQuantity = zoneRows.stream()
						.mapToInt(ZoneAvailabilityRow::availableQuantity)
						.min()
						.orElse(0);
				boolean closed = zoneRows.stream()
						.anyMatch(ZoneAvailabilityRow::closed);

				if (closed) {
					reasons.add(CAMPGROUND_CLOSED);
				}
				if (requested.quantity() > availableQuantity) {
					reasons.add(ZONE_UNAVAILABLE);
				}

				zones.add(new BookingZoneAvailabilityResponse(
						requested.zoneId(),
						requested.quantity(),
						availableQuantity));
			}
		}

		List<BookingRentalAvailabilityResponse> rentals = new ArrayList<>();
		for (BookingAvailabilityRentalRequest requested : requestedRentals) {
			int requestedQuantity = requested.quantity() == null ? 1 : requested.quantity();
			RentalStockRow stock = repository.findActiveRentalStock(
							request.campgroundId(),
							requested.rentalListingId())
					.orElseThrow(() -> new BusinessException(
							ErrorCode.NOT_FOUND,
							"Active rental listing not found: " + requested.rentalListingId()));
			int reserved = repository.sumOverlappingActiveRentalReservations(
					stock.locationId(),
					stock.rentalSkuVariantId(),
					checkIn,
					checkOut);
			int availableQuantity = Math.max(0, stock.onHandQuantity() - reserved);
			if (requestedQuantity > availableQuantity) {
				reasons.add(RENTAL_UNAVAILABLE);
			}
			rentals.add(new BookingRentalAvailabilityResponse(
					requested.rentalListingId(),
					requestedQuantity,
					availableQuantity));
		}

		return new BookingAvailabilityResponse(
				reasons.isEmpty(),
				List.copyOf(reasons),
				zones,
				rentals);
	}

	// 日期格式錯誤統一使用 Booking 契約的日期錯誤碼。
	private LocalDate parseDate(String value, String field) {
		if (value == null || value.isBlank()) {
			throw new BusinessException(ErrorCode.BOOKING_DATE_INVALID, field + " is required");
		}

		try {
			return LocalDate.parse(value);
		} catch (DateTimeParseException ex) {
			throw new BusinessException(
					ErrorCode.BOOKING_DATE_INVALID,
					field + " must use YYYY-MM-DD");
		}
	}

	// 預約窗口以政策指定的 Asia/Taipei 日期計算，邊界日期可預約。
	private void validateBookingWindow(LocalDate checkIn, LocalDate checkOut, PolicyRow policy) {
		LocalDate today = LocalDate.now(ZoneId.of(policy.timezone()));
		LocalDate earliestCheckIn = today.plusDays(policy.advanceDays());
		LocalDate latestCheckIn = today.plusDays(policy.bookingWindowDays());
		long nights = ChronoUnit.DAYS.between(checkIn, checkOut);

		if (checkIn.isBefore(earliestCheckIn)
				|| checkIn.isAfter(latestCheckIn)
				|| nights > policy.maxNights()) {
			throw new BusinessException(
					ErrorCode.BOOKING_WINDOW_EXCEEDED,
					"Booking dates exceed the active booking policy");
		}
	}

	// 所有營位都必須有效、屬於指定營區，且同一 zone 不可重複傳入。
	private void validateRequestedZones(
			List<BookingAvailabilityZoneRequest> requestedZones,
			Map<String, ZoneRow> activeZones) {
		Set<String> seen = new LinkedHashSet<>();

		for (BookingAvailabilityZoneRequest requested : requestedZones) {
			if (!seen.add(requested.zoneId())) {
				throw new BusinessException(
						ErrorCode.VALIDATION_ERROR,
						"Duplicate zoneId: " + requested.zoneId());
			}
			if (!activeZones.containsKey(requested.zoneId())) {
				throw new BusinessException(
						ErrorCode.NOT_FOUND,
						"Active zone not found: " + requested.zoneId());
			}
		}
	}

	// 同一 listing 不可重複傳入。
	private void validateRequestedRentals(List<BookingAvailabilityRentalRequest> requestedRentals) {
		Set<String> seen = new LinkedHashSet<>();
		for (BookingAvailabilityRentalRequest requested : requestedRentals) {
			if (!seen.add(requested.rentalListingId())) {
				throw new BusinessException(
						ErrorCode.VALIDATION_ERROR,
						"Duplicate rentalListingId: " + requested.rentalListingId());
			}
		}
	}

	private CampgroundResponse toCampground(CampgroundRow row, List<ZoneResponse> zones) {
		return new CampgroundResponse(
				row.id(),
				row.name(),
				row.region(),
				row.description(),
				row.active(),
				row.environmentTags(),
				row.facilityTags(),
				zones);
	}

	private ZoneResponse toZone(ZoneRow row) {
		return new ZoneResponse(
				row.id(),
				row.type(),
				row.capacityPerSite(),
				money(row.priceWeekday()),
				money(row.priceHoliday()),
				row.totalSites(),
				row.active());
	}

	private RentalEquipmentResponse toRentalEquipment(RentalEquipmentRow row) {
		return new RentalEquipmentResponse(
				row.id(),
				row.rentalSkuVariantId(),
				row.campgroundId(),
				row.name(),
				money(row.pricePerDayWeekday()),
				money(row.pricePerDayHoliday()),
				true);
	}

	private CampgroundClosureResponse toClosure(ClosureRow row) {
		return new CampgroundClosureResponse(
				row.id(),
				row.campgroundId(),
				row.closureType(),
				row.startDate(),
				row.endDate(),
				row.weekday(),
				row.effectiveFrom(),
				row.effectiveTo(),
				row.reason());
	}

	// 所有 Booking 金額以 BigDecimal 固定輸出兩位，避免前端浮點誤差。
	private String money(BigDecimal value) {
		return value.setScale(2, RoundingMode.HALF_UP).toPlainString();
	}
}
