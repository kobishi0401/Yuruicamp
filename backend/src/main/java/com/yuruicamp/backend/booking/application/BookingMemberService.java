package com.yuruicamp.backend.booking.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

import com.yuruicamp.backend.booking.api.BookingCheckoutSessionResponse;
import com.yuruicamp.backend.booking.api.BookingDetailResponse;
import com.yuruicamp.backend.booking.api.BookingListItemResponse;
import com.yuruicamp.backend.booking.infrastructure.BookingMemberRepository;
import com.yuruicamp.backend.booking.infrastructure.BookingMemberRepository.BookingDetailRow;
import com.yuruicamp.backend.booking.infrastructure.BookingMemberRepository.SelectedRentalRow;
import com.yuruicamp.backend.booking.infrastructure.BookingMemberRepository.SelectedZoneRow;
import com.yuruicamp.backend.common.api.PageMeta;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// E-5 組裝會員自己的預約列表、詳情與 Checkout 讀模型。
@Service
public class BookingMemberService {

	private final BookingMemberRepository repository;

	public BookingMemberService(BookingMemberRepository repository) {
		this.repository = repository;
	}

	@Transactional(readOnly = true)
	public PagedBookings list(String customerId, int page, int size) {
		validateCustomer(customerId);
		if (page < 0 || size < 1 || size > 100) {
			throw new BusinessException(
					ErrorCode.VALIDATION_ERROR,
					"page must be at least 0 and size must be between 1 and 100");
		}

		long total = repository.countByCustomerId(customerId);
		long offset = Math.multiplyExact((long) page, size);
		List<BookingListItemResponse> data = repository.findPageByCustomerId(customerId, size, offset)
				.stream()
				.map(row -> new BookingListItemResponse(
						row.id(),
						row.displayNo(),
						row.status(),
						row.paymentStatus(),
						row.campgroundName(),
						row.region(),
						row.checkIn().toString(),
						row.checkOut().toString(),
						row.guestCount(),
						money(row.finalAmount()),
						row.createdAt().toString()))
				.toList();
		int totalPages = total == 0 ? 0 : Math.toIntExact((total + size - 1) / size);

		return new PagedBookings(data, new PageMeta(page, size, total, totalPages));
	}

	@Transactional(readOnly = true)
	public BookingDetailResponse getBooking(String customerId, String bookingId) {
		BookingDetailRow booking = findOwned(customerId, bookingId);
		Snapshot snapshot = loadSnapshot(booking);

		return new BookingDetailResponse(
				booking.id(),
				booking.displayNo(),
				booking.status(),
				booking.paymentStatus(),
				booking.paymentMethod(),
				instant(booking.paidAt()),
				instant(booking.checkoutExpiresAt()),
				booking.campgroundId(),
				booking.campgroundName(),
				booking.region(),
				booking.checkIn().toString(),
				booking.checkOut().toString(),
				booking.guestCount(),
				booking.weekdayCount(),
				booking.holidayCount(),
				snapshot.pricing(),
				snapshot.zones(),
				snapshot.rentals(),
				booking.createdAt().toString(),
				booking.updatedAt().toString());
	}

	@Transactional(readOnly = true)
	public BookingCheckoutSessionResponse getCheckoutSession(
			String customerId,
			String bookingId) {
		BookingDetailRow booking = findOwned(customerId, bookingId);
		Snapshot snapshot = loadSnapshot(booking);

		return new BookingCheckoutSessionResponse(
				booking.id(),
				booking.displayNo(),
				booking.status(),
				booking.paymentStatus(),
				booking.paymentMethod(),
				instant(booking.checkoutExpiresAt()),
				booking.campgroundId(),
				booking.campgroundName(),
				booking.region(),
				booking.checkIn().toString(),
				booking.checkOut().toString(),
				booking.guestCount(),
				booking.weekdayCount(),
				booking.holidayCount(),
				snapshot.pricing(),
				snapshot.zones(),
				snapshot.rentals(),
				checkoutStep(booking));
	}

	private BookingDetailRow findOwned(String customerId, String bookingId) {
		validateCustomer(customerId);
		if (bookingId == null || bookingId.isBlank()) {
			throw new BusinessException(ErrorCode.NOT_FOUND, "Booking not found");
		}

		return repository.findOwnedBooking(customerId, bookingId.trim())
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Booking not found"));
	}

	private void validateCustomer(String customerId) {
		if (customerId == null || customerId.isBlank()) {
			throw new BusinessException(ErrorCode.UNAUTHORIZED, "Authenticated customer is required");
		}
	}

	// 明細小計由快照價格重新計算，與建立 Checkout 時的規則一致。
	private Snapshot loadSnapshot(BookingDetailRow booking) {
		List<BookingCheckoutSessionResponse.Zone> zones = repository.findSelectedZones(booking.id())
				.stream()
				.map(zone -> toZone(booking, zone))
				.toList();
		List<BookingCheckoutSessionResponse.Rental> rentals = repository.findSelectedRentals(booking.id())
				.stream()
				.map(rental -> toRental(booking, rental))
				.toList();
		var pricing = new BookingCheckoutSessionResponse.Pricing(
				money(booking.zoneTotal()),
				money(booking.rentalTotal()),
				money(booking.discount()),
				money(booking.finalAmount()));

		return new Snapshot(pricing, zones, rentals);
	}

	private BookingCheckoutSessionResponse.Zone toZone(
			BookingDetailRow booking,
			SelectedZoneRow zone) {
		BigDecimal lineTotal = stayPrice(
				zone.priceWeekday(),
				zone.priceHoliday(),
				booking.weekdayCount(),
				booking.holidayCount())
				.multiply(BigDecimal.valueOf(zone.quantity()));

		return new BookingCheckoutSessionResponse.Zone(
				zone.zoneId(),
				zone.type(),
				money(zone.priceWeekday()),
				money(zone.priceHoliday()),
				zone.quantity(),
				money(lineTotal));
	}

	private BookingCheckoutSessionResponse.Rental toRental(
			BookingDetailRow booking,
			SelectedRentalRow rental) {
		BigDecimal lineTotal = stayPrice(
				rental.priceWeekday(),
				rental.priceHoliday(),
				booking.weekdayCount(),
				booking.holidayCount())
				.multiply(BigDecimal.valueOf(rental.quantity()))
				.multiply(BigDecimal.ONE.subtract(rental.discountRate()))
				.setScale(2, RoundingMode.HALF_UP);

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

	private BigDecimal stayPrice(
			BigDecimal weekdayPrice,
			BigDecimal holidayPrice,
			int weekdayCount,
			int holidayCount) {
		return weekdayPrice.multiply(BigDecimal.valueOf(weekdayCount))
				.add(holidayPrice.multiply(BigDecimal.valueOf(holidayCount)));
	}

	private String checkoutStep(BookingDetailRow booking) {
		if ("cancelled".equals(booking.status())) {
			return "closed";
		}
		if ("paid".equals(booking.paymentStatus())) {
			return "completed";
		}

		return "ready_to_pay";
	}

	private String money(BigDecimal value) {
		return value.setScale(2, RoundingMode.HALF_UP).toPlainString();
	}

	private String instant(java.time.Instant value) {
		return value == null ? null : value.toString();
	}

	public record PagedBookings(List<BookingListItemResponse> data, PageMeta meta) {
	}

	private record Snapshot(
			BookingCheckoutSessionResponse.Pricing pricing,
			List<BookingCheckoutSessionResponse.Zone> zones,
			List<BookingCheckoutSessionResponse.Rental> rentals) {
	}
}
