package com.yuruicamp.backend.booking.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.yuruicamp.backend.booking.api.AdminBookingDetailResponse;
import com.yuruicamp.backend.booking.api.AdminBookingListResponse;
import com.yuruicamp.backend.booking.infrastructure.AdminBookingCommandRepository;
import com.yuruicamp.backend.booking.infrastructure.AdminBookingReadRepository;
import com.yuruicamp.backend.common.admin.AdminStatusLabels;
import com.yuruicamp.backend.common.api.PageMeta;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.payment.application.PaymentRefundService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 後台預約管理用例，不允許管理員直接改寫付款結果。
@Service
public class AdminBookingService {

	private static final ZoneId TAIPEI = ZoneId.of("Asia/Taipei");
	private static final Set<String> STATUSES = Set.of("pending", "confirmed", "completed", "cancelled");
	private static final Set<String> PAYMENT_STATUSES = Set.of("unpaid", "paid", "refunded");
	private static final Set<String> SORT_FIELDS = Set.of("createdAt", "checkIn", "checkOut", "finalAmount", "updatedAt");
	private static final Set<String> SORT_DIRECTIONS = Set.of("asc", "desc");

	private final AdminBookingReadRepository readRepository;
	private final AdminBookingCommandRepository commandRepository;
	private final PaymentRefundService paymentRefundService;
	private final Clock clock;

	public AdminBookingService(
			AdminBookingReadRepository readRepository,
			AdminBookingCommandRepository commandRepository,
			PaymentRefundService paymentRefundService,
			Clock clock) {
		this.readRepository = readRepository;
		this.commandRepository = commandRepository;
		this.paymentRefundService = paymentRefundService;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public PagedBookings list(
			int page, int size, String query, List<String> statuses, List<String> paymentStatuses,
			List<String> campgroundIds, List<String> regions, Boolean hasRental,
			LocalDate checkInFrom, LocalDate checkInTo, LocalDate createdFrom, LocalDate createdTo,
			String sort) {
		SortSpec sortSpec = validate(page, size, statuses, paymentStatuses, checkInFrom, checkInTo,
				createdFrom, createdTo, sort);
		var idPage = readRepository.findIds(page, size, normalize(query), statuses, paymentStatuses,
				campgroundIds, regions, hasRental, checkInFrom, checkInTo, createdFrom, createdTo,
				sortSpec.field(), sortSpec.direction());
		Map<String, AdminBookingListResponse> byId = new HashMap<>();
		readRepository.findRows(idPage.ids()).forEach(row -> byId.put(row.id(), row));
		List<AdminBookingListResponse> data = new ArrayList<>();
		idPage.ids().forEach(id -> data.add(byId.get(id)));
		int totalPages = (int) Math.ceil((double) idPage.totalElements() / size);

		return new PagedBookings(data, new PageMeta(page, size, idPage.totalElements(), totalPages));
	}

	@Transactional(readOnly = true)
	public AdminBookingDetailResponse get(String id) {
		var row = readRepository.findDetail(id)
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Booking not found"));

		return toDetail(row);
	}

	@Transactional
	public AdminBookingDetailResponse confirm(String id, String actorId, String note) {
		var booking = lock(id);
		if ("confirmed".equals(booking.status())) {
			return get(id);
		}
		if (!"pending".equals(booking.status())) {
			throw conflict("Only pending booking can be confirmed");
		}
		if (!"paid".equals(booking.paymentStatus())) {
			throw conflict("Booking must be paid by verified payment flow before confirmation");
		}
		Instant now = clock.instant();
		commandRepository.updateStatus(id, "confirmed", now);
		commandRepository.addHistory(id, "confirmed", now, actorId, cleanNote(note, "Booking confirmed by admin"));

		return get(id);
	}

	@Transactional
	public AdminBookingDetailResponse complete(String id, String actorId, String note) {
		var booking = lock(id);
		if ("completed".equals(booking.status())) {
			return get(id);
		}
		if (!"confirmed".equals(booking.status()) || !"paid".equals(booking.paymentStatus())) {
			throw conflict("Only paid and confirmed booking can be completed");
		}
		LocalDate today = LocalDate.now(clock.withZone(TAIPEI));
		if (booking.checkOut().isAfter(today)) {
			throw conflict("Booking cannot be completed before checkout date");
		}
		Instant now = clock.instant();
		commandRepository.updateStatus(id, "completed", now);
		commandRepository.fulfillRentalReservations(id, now);
		commandRepository.addHistory(id, "completed", now, actorId, cleanNote(note, "Booking completed by admin"));

		return get(id);
	}

	/**
	 * W3-03：已付款預約取消（pending／confirmed）；先退款再釋放資源。
	 * Paid booking cancel — refund first, then release rentals / cancel status.
	 */
	@Transactional
	public AdminBookingDetailResponse cancel(String id, String actorId, String note) {
		var booking = lock(id);
		if ("cancelled".equals(booking.status())) {
			return get(id);
		}
		if ("completed".equals(booking.status())) {
			throw conflict("Completed booking cannot be cancelled");
		}
		if (!"paid".equals(booking.paymentStatus())) {
			throw conflict("Only paid booking can be cancelled here; unpaid uses member checkout cancel");
		}
		if (!"pending".equals(booking.status()) && !"confirmed".equals(booking.status())) {
			throw conflict("Booking status does not allow cancel");
		}

		Instant now = clock.instant();
		paymentRefundService.refundBookingFully(id, booking.finalAmount());
		commandRepository.cancelPaidAndRefunded(id, now);
		commandRepository.releaseActiveRentalReservations(id, now);
		commandRepository.addHistory(id, "cancelled", now, actorId, cleanNote(note, "Booking cancelled by admin"));

		return get(id);
	}

	/**
	 * 覆寫預約內部備註；不變更履約或付款狀態。
	 * Overwrite booking internal note without changing fulfillment/payment state.
	 */
	@Transactional
	public AdminBookingDetailResponse updateInternalNote(String id, String internalNote) {
		lock(id);
		Instant now = clock.instant();
		commandRepository.updateInternalNote(id, normalizeInternalNote(internalNote), now);

		return get(id);
	}

	private SortSpec validate(
			int page, int size, List<String> statuses, List<String> paymentStatuses,
			LocalDate checkInFrom, LocalDate checkInTo, LocalDate createdFrom, LocalDate createdTo,
			String sort) {
		if (page < 0 || size < 1 || size > 100) {
			throw validation("Invalid page or size");
		}
		validateValues(statuses, STATUSES, "status");
		validateValues(paymentStatuses, PAYMENT_STATUSES, "paymentStatus");
		validateRange(checkInFrom, checkInTo, "checkIn");
		validateRange(createdFrom, createdTo, "created");
		String[] parts = sort.split(",", -1);
		if (parts.length != 2 || !SORT_FIELDS.contains(parts[0]) || !SORT_DIRECTIONS.contains(parts[1])) {
			throw validation("Invalid booking sort");
		}

		return new SortSpec(parts[0], parts[1]);
	}

	private AdminBookingDetailResponse toDetail(AdminBookingReadRepository.DetailRow row) {
		List<AdminBookingDetailResponse.ZoneSummary> zones = readRepository.findZoneLines(row.id())
				.stream()
				.map(zone -> toZoneSummary(zone, row.weekdayCount(), row.holidayCount()))
				.toList();
		List<AdminBookingDetailResponse.RentalSummary> rentals = readRepository.findRentalLines(row.id())
				.stream()
				.map(rental -> toRentalSummary(rental, row.weekdayCount(), row.holidayCount()))
				.toList();
		List<AdminBookingDetailResponse.HistorySummary> history = readRepository.findHistoryEntries(row.id())
				.stream()
				.map(entry -> new AdminBookingDetailResponse.HistorySummary(
						entry.status(),
						entry.occurredAt(),
						entry.actorId(),
						entry.actorName(),
						entry.note(),
						AdminStatusLabels.bookingHistoryLabel(entry.status(), entry.note())))
				.toList();

		return new AdminBookingDetailResponse(
				row.id(),
				row.displayNo(),
				new AdminBookingDetailResponse.CustomerSummary(
						row.customerId(), row.customerName(), row.customerStatus()),
				toContactSummary(row.contactName(), row.contactPhone(), row.contactEmail()),
				row.campgroundId(), row.campgroundName(), row.region(), row.checkIn(), row.checkOut(),
				row.guestCount(), row.weekdayCount(), row.holidayCount(), row.paymentMethod(),
				row.paymentStatus(), row.paidAt(), row.status(), row.internalNote(),
				new AdminBookingDetailResponse.PricingSummary(
						money(row.zoneTotal()), money(row.rentalTotal()), money(row.discount()),
						money(row.finalAmount())),
				row.createdAt(), row.updatedAt(), zones, rentals, history);
	}

	private AdminBookingDetailResponse.ContactSummary toContactSummary(
			String name,
			String phone,
			String email) {
		if (name == null && phone == null && email == null) {
			return null;
		}

		return new AdminBookingDetailResponse.ContactSummary(name, phone, email);
	}

	private AdminBookingDetailResponse.ZoneSummary toZoneSummary(
			AdminBookingReadRepository.ZoneLineRow zone,
			int weekdayCount,
			int holidayCount) {
		BigDecimal lineTotal = stayPrice(zone.priceWeekday(), zone.priceHoliday(), weekdayCount, holidayCount)
				.multiply(BigDecimal.valueOf(zone.quantity()));

		return new AdminBookingDetailResponse.ZoneSummary(
				zone.zoneId(),
				zone.type(),
				money(zone.priceWeekday()),
				money(zone.priceHoliday()),
				zone.quantity(),
				money(lineTotal));
	}

	private AdminBookingDetailResponse.RentalSummary toRentalSummary(
			AdminBookingReadRepository.RentalLineRow rental,
			int weekdayCount,
			int holidayCount) {
		BigDecimal lineTotal = stayPrice(rental.priceWeekday(), rental.priceHoliday(), weekdayCount, holidayCount)
				.multiply(BigDecimal.valueOf(rental.quantity()))
				.multiply(BigDecimal.ONE.subtract(rental.discountRate()))
				.setScale(2, RoundingMode.HALF_UP);

		return new AdminBookingDetailResponse.RentalSummary(
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

	private BigDecimal stayPrice(
			BigDecimal weekdayPrice,
			BigDecimal holidayPrice,
			int weekdayCount,
			int holidayCount) {
		return weekdayPrice.multiply(BigDecimal.valueOf(weekdayCount))
				.add(holidayPrice.multiply(BigDecimal.valueOf(holidayCount)));
	}

	private AdminBookingCommandRepository.BookingState lock(String id) {
		return commandRepository.lockById(id)
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Booking not found"));
	}

	private static void validateValues(List<String> values, Set<String> allowed, String field) {
		if (!allowed.containsAll(values)) {
			throw validation("Invalid " + field);
		}
	}

	private static void validateRange(LocalDate from, LocalDate to, String field) {
		if (from != null && to != null && from.isAfter(to)) {
			throw validation(field + "From cannot be after " + field + "To");
		}
	}

	private static String normalize(String value) {
		return value == null ? "" : value.trim();
	}

	private static String cleanNote(String note, String fallback) {
		return note == null || note.isBlank() ? fallback : note.trim();
	}

	/** 空白字串清成 null，與契約一致。 / Blank strings become null per contract. */
	private static String normalizeInternalNote(String note) {
		if (note == null || note.isBlank()) {
			return null;
		}

		return note.trim();
	}

	private static String money(BigDecimal value) {
		return value.setScale(2, RoundingMode.HALF_UP).toPlainString();
	}

	private static BusinessException validation(String message) {
		return new BusinessException(ErrorCode.VALIDATION_ERROR, message);
	}

	private static BusinessException conflict(String message) {
		return new BusinessException(ErrorCode.CONFLICT, message);
	}

	public record PagedBookings(List<AdminBookingListResponse> data, PageMeta meta) {
	}

	private record SortSpec(String field, String direction) {
	}
}
