package com.yuruicamp.backend.inventory.application;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import com.yuruicamp.backend.common.api.PageMeta;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.inventory.api.AdminInventoryConversionCreateRequest;
import com.yuruicamp.backend.inventory.api.AdminInventoryConversionResponse;
import com.yuruicamp.backend.inventory.infrastructure.AdminInventoryConversionRepository;
import com.yuruicamp.backend.inventory.infrastructure.AdminInventoryConversionRepository.ConversionRecord;
import com.yuruicamp.backend.inventory.infrastructure.AdminInventoryMovementRepository;
import com.yuruicamp.backend.inventory.infrastructure.AdminInventoryMovementRepository.LocationRecord;
import com.yuruicamp.backend.inventory.infrastructure.AdminInventoryMovementRepository.MovementState;
import com.yuruicamp.backend.inventory.infrastructure.AdminInventoryMovementRepository.VariantSnapshot;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * ADM-W2-05：商城→租借跨領域庫存轉換用例。
 *
 * <p>設計對齊 G-3（{@link AdminInventoryMovementService}）：draft 不改庫存、
 * post 悲觳鎖定＋固定順序鎖庫存＋原子過帳、cancel 只能作用於 draft、
 * 重送一律回放目前結果（不重複加減）。差異在於轉換一律「成對」處理：
 * 一次 create／post／cancel 永遠同時處理 store {@code conversion_out} 與
 * rental {@code conversion_in} 兩張異動單，不允許只處理其中一邊
 * （單邊假轉換禁止；{@link AdminInventoryMovementService} 也會拒絕對
 * conversion_out／conversion_in 型別的異動單做單邊 items／post／cancel）。</p>
 */
@Service
public class AdminInventoryConversionService {

	private static final Set<String> STATUSES = Set.of("", "draft", "posted", "cancelled");

	private final AdminInventoryConversionRepository conversionRepository;
	private final AdminInventoryMovementRepository movementRepository;

	public AdminInventoryConversionService(
			AdminInventoryConversionRepository conversionRepository,
			AdminInventoryMovementRepository movementRepository) {
		this.conversionRepository = conversionRepository;
		this.movementRepository = movementRepository;
	}

	@Transactional(readOnly = true)
	public PagedConversions list(int page, int size, String status) {
		String normalizedStatus = normalize(status);
		if (page < 0 || size < 1 || size > 100 || !STATUSES.contains(normalizedStatus)) {
			throw validation("Invalid inventory conversion list parameters");
		}
		var idPage = conversionRepository.findIds(page, size, normalizedStatus);
		int totalPages = (int) Math.ceil((double) idPage.totalElements() / size);

		return new PagedConversions(
				conversionRepository.findByIds(idPage.ids()),
				new PageMeta(page, size, idPage.totalElements(), totalPages));
	}

	@Transactional(readOnly = true)
	public AdminInventoryConversionResponse get(long id) {
		List<AdminInventoryConversionResponse> conversions = conversionRepository.findByIds(List.of(id));
		if (conversions.isEmpty()) {
			throw notFound();
		}

		return conversions.getFirst();
	}

	/**
	 * 建立轉換 draft 配對：同一交易內寫入 store conversion_out ＋ rental conversion_in
	 * 兩張異動表頭與各一筆明細，再寫入 {@code inventory_conversions} 配對紀錄。此步驟完全不
	 * 改動 {@code inventory_stocks}／{@code rental_sku_variant_stocks}。
	 *
	 * <p>冪等：同一 idempotencyKey 重送且欄位一致 → 回放既有轉換；欄位不一致 → 409。</p>
	 */
	@Transactional
	public AdminInventoryConversionResponse createDraft(
			String actorId,
			AdminInventoryConversionCreateRequest request) {
		String idempotencyKey = request.idempotencyKey().trim();
		ConversionRecord existing = conversionRepository.findByIdempotencyKey(idempotencyKey);
		if (existing != null) {
			return replayOrConflict(existing, request);
		}

		String sourceLocationId = request.sourceLocationId().trim();
		String destinationLocationId = request.destinationLocationId().trim();
		String sourceVariantId = request.sourceVariantId().trim();
		String destinationRentalVariantId = request.destinationRentalVariantId().trim();

		requireLocationDomain(sourceLocationId, "store");
		requireLocationDomain(destinationLocationId, "rental");
		VariantSnapshot sourceVariant = requireActiveVariant("store", sourceVariantId);
		VariantSnapshot destinationVariant = requireActiveVariant("rental", destinationRentalVariantId);

		Instant now = Instant.now();
		Instant occurredAt = request.occurredAt() == null ? now : request.occurredAt();
		if (occurredAt.isAfter(now.plusSeconds(300))) {
			throw validation("Conversion occurredAt cannot be in the future");
		}
		String reason = request.reason().trim();

		long sourceMovementId = movementRepository.insertMovement(
				generateMovementNo(now),
				"store",
				"conversion_out",
				sourceLocationId,
				null,
				actorId,
				reason,
				occurredAt,
				now);
		movementRepository.insertItem(
				sourceMovementId,
				"store",
				sourceVariant,
				request.quantity(),
				sourceLocationId,
				null,
				null,
				null);

		long destinationMovementId = movementRepository.insertMovement(
				generateMovementNo(now),
				"rental",
				"conversion_in",
				null,
				destinationLocationId,
				actorId,
				reason,
				occurredAt,
				now);
		movementRepository.insertItem(
				destinationMovementId, "rental", destinationVariant, request.quantity(), null, null, null, null);

		long conversionId;
		try {
			conversionId = conversionRepository.insertConversion(
					sourceMovementId,
					destinationMovementId,
					sourceVariantId,
					destinationRentalVariantId,
					sourceLocationId,
					destinationLocationId,
					request.quantity(),
					idempotencyKey,
					now);
		}
		catch (DataIntegrityViolationException raceLoser) {
			// 併發：另一交易搶先用同一 idempotencyKey 建立成功；本交易的兩張草稿異動單會隨
			// rollback 一併撤銷，回放對方寫入的結果即可，不會留下孤兒異動單。
			ConversionRecord winner = conversionRepository.findByIdempotencyKey(idempotencyKey);
			if (winner == null) {
				throw raceLoser;
			}
			return replayOrConflict(winner, request);
		}

		return get(conversionId);
	}

	/**
	 * 過帳：悲觀鎖定轉換配對與兩張異動表頭 → 依固定順序（store 來源先、rental 目的後）
	 * 鎖定並讀取庫存 → 驗證商城來源扣減後不得為負也不得低於 active 保留 → 原子寫回兩邊庫存
	 * → 兩張異動單一起標記 posted。重送已 posted 的轉換會直接回放目前結果。
	 */
	@Transactional
	public AdminInventoryConversionResponse post(long id, String actorId) {
		ConversionRecord conversion = requireLockedConversion(id);
		MovementState sourceMovement = movementRepository.lockMovement(conversion.sourceMovementId());
		MovementState destinationMovement = movementRepository.lockMovement(conversion.destinationMovementId());
		if ("posted".equals(sourceMovement.status())) {
			return get(id);
		}
		if ("cancelled".equals(sourceMovement.status()) || "cancelled".equals(destinationMovement.status())) {
			throw conflict("Cancelled conversion cannot be posted");
		}

		Instant now = Instant.now();
		VariantSnapshot sourceVariant = movementRepository.findVariant("store", conversion.sourceVariantId());
		String sku = sourceVariant == null ? conversion.sourceVariantId() : sourceVariant.sku();

		// 固定順序鎖庫存：先鎖商城來源，再鎖租借目的，避免與其他轉換交錯造成死鎖。
		int sourceCurrent = movementRepository.ensureAndLockStock(
				"store", conversion.sourceLocationId(), conversion.sourceVariantId(), now);
		int reserved = movementRepository.findActiveReservedQuantity(
				"store", conversion.sourceLocationId(), conversion.sourceVariantId());
		int nextSource = sourceCurrent - conversion.quantity();
		if (nextSource < 0 || nextSource < reserved) {
			throw conflict("Insufficient unreserved inventory for SKU: " + sku);
		}
		int destinationCurrent = movementRepository.ensureAndLockStock(
				"rental", conversion.destinationLocationId(), conversion.destinationRentalVariantId(), now);
		int nextDestination = destinationCurrent + conversion.quantity();

		movementRepository.updateStock(
				"store", conversion.sourceLocationId(), conversion.sourceVariantId(), nextSource, now);
		movementRepository.updateStock(
				"rental", conversion.destinationLocationId(), conversion.destinationRentalVariantId(),
				nextDestination, now);
		movementRepository.markPosted(conversion.sourceMovementId(), actorId, now);
		movementRepository.markPosted(conversion.destinationMovementId(), actorId, now);

		return get(id);
	}

	/** 作廢 draft 轉換：兩張異動單一起作廢；已 posted 不可作廢；已 cancelled 重送回放。 */
	@Transactional
	public AdminInventoryConversionResponse cancel(long id, String actorId) {
		ConversionRecord conversion = requireLockedConversion(id);
		MovementState sourceMovement = movementRepository.lockMovement(conversion.sourceMovementId());
		MovementState destinationMovement = movementRepository.lockMovement(conversion.destinationMovementId());
		if ("cancelled".equals(sourceMovement.status())) {
			return get(id);
		}
		if ("posted".equals(sourceMovement.status()) || "posted".equals(destinationMovement.status())) {
			throw conflict("Posted conversion cannot be cancelled");
		}

		Instant now = Instant.now();
		movementRepository.markCancelled(conversion.sourceMovementId(), actorId, now);
		movementRepository.markCancelled(conversion.destinationMovementId(), actorId, now);

		return get(id);
	}

	private AdminInventoryConversionResponse replayOrConflict(
			ConversionRecord existing,
			AdminInventoryConversionCreateRequest request) {
		boolean matches = existing.sourceLocationId().equals(request.sourceLocationId().trim())
				&& existing.destinationLocationId().equals(request.destinationLocationId().trim())
				&& existing.sourceVariantId().equals(request.sourceVariantId().trim())
				&& existing.destinationRentalVariantId().equals(request.destinationRentalVariantId().trim())
				&& existing.quantity() == request.quantity();
		if (!matches) {
			throw new BusinessException(
					ErrorCode.IDEMPOTENCY_CONFLICT,
					"Idempotency key was already used with a different inventory conversion request");
		}

		return get(existing.id());
	}

	private void requireLocationDomain(String locationId, String expectedDomain) {
		LocationRecord location = movementRepository.findActiveLocation(locationId);
		if (location == null || !location.active()) {
			throw new BusinessException(ErrorCode.NOT_FOUND, "Active inventory location not found");
		}
		if (!expectedDomain.equals(location.inventoryDomain())) {
			throw validation("Conversion "
					+ ("store".equals(expectedDomain) ? "sourceLocationId" : "destinationLocationId")
					+ " must be a " + expectedDomain + " location");
		}
	}

	private VariantSnapshot requireActiveVariant(String inventoryDomain, String variantId) {
		VariantSnapshot variant = movementRepository.findVariant(inventoryDomain, variantId);
		if (variant == null) {
			throw new BusinessException(ErrorCode.NOT_FOUND, "Inventory variant not found");
		}
		if (!"active".equals(variant.status())) {
			throw conflict("Inactive inventory variant cannot be used in a new conversion");
		}

		return variant;
	}

	private ConversionRecord requireLockedConversion(long id) {
		ConversionRecord conversion = conversionRepository.lockConversion(id);
		if (conversion == null) {
			throw notFound();
		}

		return conversion;
	}

	private String generateMovementNo(Instant now) {
		String date = java.time.format.DateTimeFormatter.BASIC_ISO_DATE
				.withZone(java.time.ZoneId.of("Asia/Taipei"))
				.format(now);
		String random = UUID.randomUUID()
				.toString()
				.replace("-", "")
				.substring(0, 10)
				.toUpperCase(Locale.ROOT);

		return "CVT-" + date + "-" + random;
	}

	private String normalize(String value) {
		return value == null ? "" : value.trim();
	}

	private BusinessException validation(String message) {
		return new BusinessException(ErrorCode.VALIDATION_ERROR, message);
	}

	private BusinessException conflict(String message) {
		return new BusinessException(ErrorCode.CONFLICT, message);
	}

	private BusinessException notFound() {
		return new BusinessException(ErrorCode.NOT_FOUND, "Inventory conversion not found");
	}

	public record PagedConversions(List<AdminInventoryConversionResponse> data, PageMeta meta) {
	}
}
