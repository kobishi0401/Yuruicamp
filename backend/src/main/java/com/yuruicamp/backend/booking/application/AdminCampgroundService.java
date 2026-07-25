package com.yuruicamp.backend.booking.application;

import java.time.Instant;
import java.util.List;

import com.yuruicamp.backend.booking.api.AdminCampgroundCreateRequest;
import com.yuruicamp.backend.booking.api.AdminCampgroundResponse;
import com.yuruicamp.backend.booking.api.AdminCampgroundUpdateRequest;
import com.yuruicamp.backend.booking.infrastructure.AdminCampgroundRepository;
import com.yuruicamp.backend.booking.infrastructure.AdminCampgroundRepository.CampgroundRow;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 用途：營區主檔 CRUD 與安全刪除（ADM-W4-01）。
 * 核心重點（給新手）：
 *   1. 「啟停」不是獨立按鈕，而是 PATCH body 傳 `active: true/false`。
 *   2. 硬刪前先數引用：zones／bookings／closures／rental_listings／campground_rental_locations。
 *      任一 > 0 → 409，引導改用 `active=false`（軟停用），不真的刪資料。
 *   3. 公開 `GET /api/booking/campgrounds` 只回 active=true；後台永遠看得到全部。
 * Admin campground CRUD; hard-delete is blocked (409) when referenced.
 */
@Service
public class AdminCampgroundService {

	private final AdminCampgroundRepository repository;

	public AdminCampgroundService(AdminCampgroundRepository repository) {
		this.repository = repository;
	}

	@Transactional(readOnly = true)
	public List<AdminCampgroundResponse> list() {
		return repository.findAll().stream().map(this::toResponse).toList();
	}

	@Transactional(readOnly = true)
	public AdminCampgroundResponse get(String id) {
		CampgroundRow row = repository.findById(id);
		if (row == null) {
			throw notFound();
		}
		return toResponse(row);
	}

	@Transactional
	public AdminCampgroundResponse create(AdminCampgroundCreateRequest request) {
		String id = normalizeRequired(request.id(), "Campground id");
		String name = normalizeRequired(request.name(), "Campground name");
		String region = normalizeRequired(request.region(), "Campground region");
		String description = normalizeOptional(request.description());
		boolean active = request.active() == null || request.active();

		if (repository.findById(id) != null) {
			throw conflict("Campground id already exists");
		}
		try {
			repository.insert(id, name, region, description, active, Instant.now());
			return get(id);
		}
		catch (DataIntegrityViolationException ex) {
			throw conflict("Campground id already exists");
		}
	}

	@Transactional
	public AdminCampgroundResponse update(String id, AdminCampgroundUpdateRequest request) {
		CampgroundRow existing = repository.lockById(id);
		if (existing == null) {
			throw notFound();
		}

		String name = request.name() == null
				? existing.name()
				: normalizeRequired(request.name(), "Campground name");
		String region = request.region() == null
				? existing.region()
				: normalizeRequired(request.region(), "Campground region");
		// description：省略（null）時保留原值；跟門市 mapQuery 同一套「null＝不改」慣例。
		// description: null means keep existing (same omit-means-keep convention as branches).
		String description = request.description() == null
				? existing.description()
				: normalizeOptional(request.description());
		boolean active = request.active() == null ? existing.active() : request.active();

		try {
			repository.update(id, name, region, description, active, Instant.now());
			return get(id);
		}
		catch (DataIntegrityViolationException ex) {
			throw conflict("Campground update violates a database constraint");
		}
	}

	@Transactional
	public void delete(String id) {
		CampgroundRow existing = repository.lockById(id);
		if (existing == null) {
			throw notFound();
		}
		if (hasReferences(id)) {
			throw conflict(
					"Campground is referenced by zones, bookings, closures, listings, or rental locations; "
							+ "set active=false instead");
		}
		repository.delete(id);
	}

	private boolean hasReferences(String id) {
		return repository.countZoneReferences(id) > 0
				|| repository.countBookingReferences(id) > 0
				|| repository.countClosureReferences(id) > 0
				|| repository.countRentalListingReferences(id) > 0
				|| repository.countRentalLocationReferences(id) > 0;
	}

	private String normalizeRequired(String value, String label) {
		String trimmed = value == null ? "" : value.trim();
		if (trimmed.isBlank()) {
			throw validation(label + " must not be blank");
		}
		return trimmed;
	}

	private String normalizeOptional(String value) {
		if (value == null) {
			return null;
		}
		String trimmed = value.trim();
		return trimmed.isEmpty() ? null : trimmed;
	}

	private AdminCampgroundResponse toResponse(CampgroundRow row) {
		return new AdminCampgroundResponse(
				row.id(),
				row.name(),
				row.region(),
				row.description(),
				row.active(),
				row.createdAt(),
				row.updatedAt());
	}

	private BusinessException notFound() {
		return new BusinessException(ErrorCode.NOT_FOUND, "Campground not found");
	}

	private BusinessException conflict(String message) {
		return new BusinessException(ErrorCode.CONFLICT, message);
	}

	private BusinessException validation(String message) {
		return new BusinessException(ErrorCode.VALIDATION_ERROR, message);
	}
}
