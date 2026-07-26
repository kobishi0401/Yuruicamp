package com.yuruicamp.backend.booking.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

import com.yuruicamp.backend.booking.api.BookingAvailabilityRequest;
import com.yuruicamp.backend.booking.api.BookingAvailabilityZoneRequest;
import com.yuruicamp.backend.booking.api.BookingCheckoutCreateRequest;
import com.yuruicamp.backend.booking.api.BookingCheckoutSessionResponse;
import com.yuruicamp.backend.booking.infrastructure.BookingCheckoutRepository;
import com.yuruicamp.backend.booking.infrastructure.BookingCheckoutRepository.BookingInsert;
import com.yuruicamp.backend.booking.infrastructure.BookingCheckoutRepository.BookingRow;
import com.yuruicamp.backend.booking.infrastructure.BookingCheckoutRepository.CampgroundLockRow;
import com.yuruicamp.backend.booking.infrastructure.BookingCheckoutRepository.LockedRentalRow;
import com.yuruicamp.backend.booking.infrastructure.BookingCheckoutRepository.LockedZoneRow;
import com.yuruicamp.backend.booking.infrastructure.BookingCheckoutRepository.SelectedRentalInsert;
import com.yuruicamp.backend.booking.infrastructure.BookingCheckoutRepository.SelectedRentalRow;
import com.yuruicamp.backend.booking.infrastructure.BookingCheckoutRepository.SelectedZoneInsert;
import com.yuruicamp.backend.booking.infrastructure.BookingCheckoutRepository.SelectedZoneRow;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.commerce.application.DisplayNoService;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// E-3～E-4 在單一交易內鎖定營位與租借庫存，並建立待付款 Booking。
@Service
public class BookingCheckoutService {

	private static final Duration HOLD = Duration.ofMinutes(15);

	private final BookingCheckoutRepository repository;
	private final BookingPublicService bookingPublicService;
	private final DisplayNoService displayNoService;

	public BookingCheckoutService(
			BookingCheckoutRepository repository,
			BookingPublicService bookingPublicService,
			DisplayNoService displayNoService) {
		this.repository = repository;
		this.bookingPublicService = bookingPublicService;
		this.displayNoService = displayNoService;
	}

	// 建立 pending、unpaid 的預約、營位與租借保留；相同冪等請求直接回放原結果。
	@Transactional
	public BookingCheckoutSessionResponse create(
			String customerId,
			BookingCheckoutCreateRequest request) {
		NormalizedRequest normalized = normalize(customerId, request);
		String requestHash = fingerprint(normalized);

		if (!repository.lockActiveCustomer(customerId)) {
			throw new BusinessException(ErrorCode.UNAUTHORIZED, "Active customer not found");
		}
		var replay = repository.findByIdempotencyKey(customerId, normalized.idempotencyKey());
		if (replay.isPresent()) {
			if (!requestHash.equals(replay.get().requestHash())) {
				throw new BusinessException(
						ErrorCode.IDEMPOTENCY_CONFLICT,
						"Idempotency key was already used with a different booking request");
			}

			return toResponse(replay.get());
		}

		CampgroundLockRow campground = repository.lockActiveCampground(normalized.campgroundId())
				.orElseThrow(() -> new BusinessException(
						ErrorCode.NOT_FOUND,
						"Campground not found: " + normalized.campgroundId()));
		Map<String, LockedZoneRow> lockedZones = lockZones(normalized);

		var availability = bookingPublicService.checkAvailability(toAvailabilityRequest(normalized));
		if (!availability.available()) {
			throw new BusinessException(
					ErrorCode.ZONE_UNAVAILABLE,
					"Requested zones are unavailable: " + String.join(",", availability.reasons()));
		}

		long nights = ChronoUnit.DAYS.between(normalized.checkIn(), normalized.checkOut());
		int holidayCount = repository.countHolidayDates(normalized.checkIn(), normalized.checkOut());
		int weekdayCount = Math.toIntExact(nights) - holidayCount;
		List<SelectedZoneInsert> zoneDrafts = buildZoneDrafts(normalized, lockedZones);
		BigDecimal zoneTotal = calculateZoneTotal(zoneDrafts, weekdayCount, holidayCount);
		Map<String, LockedRentalRow> lockedRentals = lockRentals(normalized);
		List<SelectedRentalInsert> rentalDrafts = buildRentalDrafts(normalized, lockedRentals);
		BigDecimal rentalTotal = calculateRentalTotal(rentalDrafts, weekdayCount, holidayCount);
		Instant now = Instant.now();
		String bookingId = newBookingId();

		repository.insertBooking(new BookingInsert(
				bookingId,
				displayNoService.nextBookingDisplayNo(),
				customerId,
				normalized.idempotencyKey(),
				requestHash,
				campground.id(),
				campground.name(),
				campground.region(),
				normalized.checkIn(),
				normalized.checkOut(),
				normalized.guestCount(),
				weekdayCount,
				holidayCount,
				zoneTotal,
				rentalTotal,
				normalized.paymentMethod(),
				now.plus(HOLD),
				now));
		zoneDrafts.forEach(zone -> repository.insertSelectedZone(bookingId, zone));
		for (SelectedRentalInsert rental : rentalDrafts) {
			long selectedRentalId = repository.insertSelectedRental(bookingId, rental);
			repository.insertRentalReservation(
					selectedRentalId,
					rental,
					normalized.checkIn(),
					normalized.checkOut(),
					bookingId + ":rental:" + rental.rentalListingId(),
					now);
		}
		repository.insertPendingHistory(bookingId, now);

		BookingRow saved = repository.findById(bookingId)
				.orElseThrow(() -> new IllegalStateException("Created booking could not be reloaded"));

		return toResponse(saved);
	}

	// 所有請求都依 zoneId 排序後逐筆鎖定，降低多營位交易的死鎖風險。
	private Map<String, LockedZoneRow> lockZones(NormalizedRequest request) {
		Map<String, LockedZoneRow> locked = new TreeMap<>();

		for (Map.Entry<String, Integer> entry : request.zones().entrySet()) {
			LockedZoneRow zone = repository.lockActiveZone(request.campgroundId(), entry.getKey())
					.orElseThrow(() -> new BusinessException(
							ErrorCode.NOT_FOUND,
							"Active zone not found: " + entry.getKey()));
			locked.put(entry.getKey(), zone);
		}

		return locked;
	}

	// 依庫位、variant、listing 固定排序鎖庫存，並在鎖內扣除重疊 active 保留。
	private Map<String, LockedRentalRow> lockRentals(NormalizedRequest request) {
		List<NormalizedRental> lockOrder = request.rentals()
				.values()
				.stream()
				.sorted(Comparator.comparing(NormalizedRental::rentalSkuVariantId)
						.thenComparing(NormalizedRental::rentalListingId))
				.toList();
		Map<String, LockedRentalRow> locked = new LinkedHashMap<>();

		for (NormalizedRental requested : lockOrder) {
			LockedRentalRow rental = repository.lockActiveRental(
					request.campgroundId(),
					requested.rentalListingId(),
					requested.rentalSkuVariantId())
					.orElseThrow(() -> new BusinessException(
							ErrorCode.NOT_FOUND,
							"Active rental listing not found: " + requested.rentalListingId()));
			int reserved = repository.sumOverlappingActiveRentalReservations(
					rental.locationId(),
					rental.rentalSkuVariantId(),
					request.checkIn(),
					request.checkOut());
			int available = rental.onHandQuantity() - reserved;

			if (requested.quantity() > available) {
				throw new BusinessException(
						ErrorCode.RENTAL_STOCK_INSUFFICIENT,
						"Rental stock is insufficient for listing: " + requested.rentalListingId());
			}

			locked.put(requested.rentalListingId(), rental);
		}

		return locked;
	}

	// 使用鎖定後的營位資料建立價格快照，完全忽略前端自算金額。
	private List<SelectedZoneInsert> buildZoneDrafts(
			NormalizedRequest request,
			Map<String, LockedZoneRow> lockedZones) {
		List<SelectedZoneInsert> drafts = new ArrayList<>();

		request.zones().forEach((zoneId, quantity) -> {
			LockedZoneRow zone = lockedZones.get(zoneId);
			drafts.add(new SelectedZoneInsert(
					zone.id(),
					zone.type(),
					zone.priceWeekday(),
					zone.priceHoliday(),
					quantity));
		});

		return drafts;
	}

	// 使用鎖定後的 listing 與主檔資料建立租借成交快照。
	private List<SelectedRentalInsert> buildRentalDrafts(
			NormalizedRequest request,
			Map<String, LockedRentalRow> lockedRentals) {
		List<SelectedRentalInsert> drafts = new ArrayList<>();

		request.rentals().forEach((listingId, requested) -> {
			LockedRentalRow rental = lockedRentals.get(listingId);
			drafts.add(new SelectedRentalInsert(
					rental.rentalListingId(),
					rental.rentalSkuVariantId(),
					rental.locationId(),
					rental.sku(),
					rental.name(),
					rental.specification(),
					rental.priceWeekday(),
					rental.priceHoliday(),
					rental.discountRate(),
					requested.quantity()));
		});

		return drafts;
	}

	private BigDecimal calculateZoneTotal(
			List<SelectedZoneInsert> zones,
			int weekdayCount,
			int holidayCount) {
		BigDecimal total = BigDecimal.ZERO;

		for (SelectedZoneInsert zone : zones) {
			total = total.add(lineTotal(
					zone.priceWeekday(),
					zone.priceHoliday(),
					zone.quantity(),
					weekdayCount,
					holidayCount));
		}

		return total;
	}

	private BigDecimal calculateRentalTotal(
			List<SelectedRentalInsert> rentals,
			int weekdayCount,
			int holidayCount) {
		BigDecimal total = BigDecimal.ZERO;

		for (SelectedRentalInsert rental : rentals) {
			total = total.add(rentalLineTotal(
					rental.priceWeekday(),
					rental.priceHoliday(),
					rental.discountRate(),
					rental.quantity(),
					weekdayCount,
					holidayCount));
		}

		return total;
	}

	// 先正規化會影響建立結果的欄位，讓相同內容可穩定產生相同指紋。
	private NormalizedRequest normalize(String customerId, BookingCheckoutCreateRequest request) {
		if (customerId == null || customerId.isBlank() || request == null) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR, "Customer and request are required");
		}
		if (request.campgroundId() == null || request.campgroundId().isBlank()) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR, "campgroundId is required");
		}
		if (request.idempotencyKey() == null || request.idempotencyKey().isBlank()
				|| request.idempotencyKey().trim().length() > 128) {
			throw new BusinessException(
					ErrorCode.VALIDATION_ERROR,
					"idempotencyKey is required and must not exceed 128 characters");
		}
		if (request.couponClaimId() != null) {
			throw new BusinessException(
					ErrorCode.VALIDATION_ERROR,
					"couponClaimId is not supported until the coupon flow is implemented");
		}
		LocalDate checkIn = parseDate(request.checkIn(), "checkIn");
		LocalDate checkOut = parseDate(request.checkOut(), "checkOut");
		if (!checkOut.isAfter(checkIn)) {
			throw new BusinessException(
					ErrorCode.BOOKING_DATE_INVALID,
					"checkOut must be after checkIn");
		}
		if (request.guestCount() == null || request.guestCount() < 1
				|| request.zones() == null || request.zones().isEmpty()) {
			throw new BusinessException(
					ErrorCode.VALIDATION_ERROR,
					"guestCount and zones are required");
		}

		Map<String, Integer> zones = new TreeMap<>();
		for (BookingCheckoutCreateRequest.Zone zone : request.zones()) {
			if (zone == null || zone.zoneId() == null || zone.zoneId().isBlank()
					|| zone.quantity() == null || zone.quantity() < 1) {
				throw new BusinessException(
						ErrorCode.VALIDATION_ERROR,
						"Each zone requires zoneId and a positive quantity");
			}
			String zoneId = zone.zoneId().trim();
			if (zones.putIfAbsent(zoneId, zone.quantity()) != null) {
				throw new BusinessException(ErrorCode.VALIDATION_ERROR, "Duplicate zoneId: " + zoneId);
			}
		}
		Map<String, NormalizedRental> rentals = normalizeRentals(request.rentals());

		return new NormalizedRequest(
				request.campgroundId().trim(),
				checkIn,
				checkOut,
				request.guestCount(),
				zones,
				rentals,
				normalizePaymentMethod(request.paymentMethod()),
				request.idempotencyKey().trim());
	}

	// 同一 listing 或 variant 不可重複，避免將同一庫存拆成多筆繞過數量檢查。
	private Map<String, NormalizedRental> normalizeRentals(
			List<BookingCheckoutCreateRequest.Rental> requestedRentals) {
		Map<String, NormalizedRental> rentals = new TreeMap<>();
		Set<String> variants = new HashSet<>();

		if (requestedRentals == null) {
			return rentals;
		}

		for (BookingCheckoutCreateRequest.Rental rental : requestedRentals) {
			if (rental == null
					|| rental.rentalListingId() == null
					|| rental.rentalListingId().isBlank()
					|| rental.rentalSkuVariantId() == null
					|| rental.rentalSkuVariantId().isBlank()
					|| rental.quantity() == null
					|| rental.quantity() < 1) {
				throw new BusinessException(
						ErrorCode.VALIDATION_ERROR,
						"Each rental requires listing, variant and a positive quantity");
			}

			String listingId = rental.rentalListingId().trim();
			String variantId = rental.rentalSkuVariantId().trim();
			if (listingId.length() > 64 || variantId.length() > 64) {
				throw new BusinessException(
						ErrorCode.VALIDATION_ERROR,
						"Rental listing and variant ids must not exceed 64 characters");
			}
			if (rentals.containsKey(listingId) || !variants.add(variantId)) {
				throw new BusinessException(
						ErrorCode.VALIDATION_ERROR,
						"Duplicate rental listing or variant: " + listingId);
			}

			rentals.put(listingId, new NormalizedRental(
					listingId,
					variantId,
					rental.quantity()));
		}

		return rentals;
	}

	private BookingAvailabilityRequest toAvailabilityRequest(NormalizedRequest request) {
		List<BookingAvailabilityZoneRequest> zones = request.zones()
				.entrySet()
				.stream()
				.map(entry -> new BookingAvailabilityZoneRequest(entry.getKey(), entry.getValue()))
				.toList();

		return new BookingAvailabilityRequest(
				request.campgroundId(),
				request.checkIn().toString(),
				request.checkOut().toString(),
				zones,
				List.of());
	}

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

	// 預約付款只接受 ECPay 通道，COD 在 Service 與資料庫都會拒絕。
	private String normalizePaymentMethod(String raw) {
		if (raw == null || raw.isBlank()) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR, "paymentMethod is required");
		}

		return switch (raw.trim()) {
			case "ecpay-credit", "ecpay-atm", "ecpay-cvs", "ecpay-other" -> raw.trim();
			case "cod" -> throw new BusinessException(
					ErrorCode.VALIDATION_ERROR,
					"Booking checkout does not support cod");
			default -> throw new BusinessException(
					ErrorCode.VALIDATION_ERROR,
					"Unsupported paymentMethod: " + raw);
		};
	}

	// 指紋包含所有會影響 Booking 建立結果的正規化欄位。
	private String fingerprint(NormalizedRequest request) {
		StringBuilder canonical = new StringBuilder();
		appendCanonical(canonical, request.campgroundId());
		appendCanonical(canonical, request.checkIn().toString());
		appendCanonical(canonical, request.checkOut().toString());
		appendCanonical(canonical, String.valueOf(request.guestCount()));
		appendCanonical(canonical, request.paymentMethod());
		request.zones().forEach((zoneId, quantity) -> {
			appendCanonical(canonical, zoneId);
			appendCanonical(canonical, String.valueOf(quantity));
		});
		request.rentals().forEach((listingId, rental) -> {
			appendCanonical(canonical, listingId);
			appendCanonical(canonical, rental.rentalSkuVariantId());
			appendCanonical(canonical, String.valueOf(rental.quantity()));
		});

		try {
			byte[] digest = MessageDigest.getInstance("SHA-256")
					.digest(canonical.toString().getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(digest);
		} catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException("SHA-256 is not available", ex);
		}
	}

	private void appendCanonical(StringBuilder target, String value) {
		String normalized = value == null ? "" : value.trim();
		target.append(normalized.length())
				.append(':')
				.append(normalized)
				.append('|');
	}

	private BookingCheckoutSessionResponse toResponse(BookingRow booking) {
		List<BookingCheckoutSessionResponse.Zone> zones = repository.findSelectedZones(booking.id())
				.stream()
				.map(zone -> toZoneResponse(booking, zone))
				.toList();
		List<BookingCheckoutSessionResponse.Rental> rentals = repository.findSelectedRentals(booking.id())
				.stream()
				.map(rental -> toRentalResponse(booking, rental))
				.toList();
		var pricing = new BookingCheckoutSessionResponse.Pricing(
				money(booking.zoneTotal()),
				money(booking.rentalTotal()),
				money(booking.discount()),
				money(booking.finalAmount()));

		return new BookingCheckoutSessionResponse(
				booking.id(),
				booking.displayNo(),
				booking.status(),
				booking.paymentStatus(),
				booking.paymentMethod(),
				booking.checkoutExpiresAt().toString(),
				booking.campgroundId(),
				booking.campgroundName(),
				booking.region(),
				booking.checkIn().toString(),
				booking.checkOut().toString(),
				booking.guestCount(),
				booking.weekdayCount(),
				booking.holidayCount(),
				pricing,
				zones,
				rentals,
				"ready_to_pay");
	}

	private BookingCheckoutSessionResponse.Zone toZoneResponse(
			BookingRow booking,
			SelectedZoneRow zone) {
		BigDecimal lineTotal = lineTotal(
				zone.priceWeekday(),
				zone.priceHoliday(),
				zone.quantity(),
				booking.weekdayCount(),
				booking.holidayCount());

		return new BookingCheckoutSessionResponse.Zone(
				zone.zoneId(),
				zone.type(),
				money(zone.priceWeekday()),
				money(zone.priceHoliday()),
				zone.quantity(),
				money(lineTotal));
	}

	private BookingCheckoutSessionResponse.Rental toRentalResponse(
			BookingRow booking,
			SelectedRentalRow rental) {
		BigDecimal lineTotal = rentalLineTotal(
				rental.priceWeekday(),
				rental.priceHoliday(),
				rental.discountRate(),
				rental.quantity(),
				booking.weekdayCount(),
				booking.holidayCount());

		return new BookingCheckoutSessionResponse.Rental(
				rental.rentalListingId(),
				rental.rentalSkuVariantId(),
				rental.sku(),
				rental.name(),
				rental.specification(),
				money(rental.priceWeekday()),
				money(rental.priceHoliday()),
				money(rental.discountRate()),
				rental.quantity(),
				money(lineTotal));
	}

	private BigDecimal lineTotal(
			BigDecimal weekdayPrice,
			BigDecimal holidayPrice,
			int quantity,
			int weekdayCount,
			int holidayCount) {
		BigDecimal nightlyTotal = weekdayPrice.multiply(BigDecimal.valueOf(weekdayCount))
				.add(holidayPrice.multiply(BigDecimal.valueOf(holidayCount)));

		return nightlyTotal.multiply(BigDecimal.valueOf(quantity));
	}

	// listing.discount 依 Schema 為 0.00～0.30 比率，折扣後再四捨五入到兩位。
	private BigDecimal rentalLineTotal(
			BigDecimal weekdayPrice,
			BigDecimal holidayPrice,
			BigDecimal discountRate,
			int quantity,
			int weekdayCount,
			int holidayCount) {
		BigDecimal gross = weekdayPrice.multiply(BigDecimal.valueOf(weekdayCount))
				.add(holidayPrice.multiply(BigDecimal.valueOf(holidayCount)))
				.multiply(BigDecimal.valueOf(quantity));

		return gross.multiply(BigDecimal.ONE.subtract(discountRate))
				.setScale(2, RoundingMode.HALF_UP);
	}

	private String money(BigDecimal value) {
		return value.setScale(2, RoundingMode.HALF_UP).toPlainString();
	}

	private String newBookingId() {
		return "B" + UUID.randomUUID().toString().replace("-", "").substring(0, 31);
	}

	private record NormalizedRequest(
			String campgroundId,
			LocalDate checkIn,
			LocalDate checkOut,
			int guestCount,
			Map<String, Integer> zones,
			Map<String, NormalizedRental> rentals,
			String paymentMethod,
			String idempotencyKey) {
	}

	private record NormalizedRental(
			String rentalListingId,
			String rentalSkuVariantId,
			int quantity) {
	}
}
