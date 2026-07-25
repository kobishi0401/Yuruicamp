package com.yuruicamp.backend.inventory.application;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.yuruicamp.backend.common.api.PageMeta;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.inventory.api.AdminInventoryMovementCreateRequest;
import com.yuruicamp.backend.inventory.api.AdminInventoryMovementItemRequest;
import com.yuruicamp.backend.inventory.api.AdminInventoryMovementItemResponse;
import com.yuruicamp.backend.inventory.api.AdminInventoryMovementLookupResponse;
import com.yuruicamp.backend.inventory.api.AdminInventoryMovementResponse;
import com.yuruicamp.backend.inventory.infrastructure.AdminInventoryMovementRepository;
import com.yuruicamp.backend.inventory.infrastructure.AdminInventoryMovementRepository.LocationRecord;
import com.yuruicamp.backend.inventory.infrastructure.AdminInventoryMovementRepository.MovementState;
import com.yuruicamp.backend.inventory.infrastructure.AdminInventoryMovementRepository.VariantSnapshot;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 後台庫存異動用例（ADM-W2-08 + 營地互轉例外）：
 * <ul>
 *   <li>{@code product_stock_update}（store）：post 只定稿、不改 on-hand</li>
 *   <li>{@code transfer}（rental）：post 悲觀鎖後改 {@code rental_sku_variant_stocks}（營地↔營地）</li>
 * </ul>
 * 跨領域 conversion 仍走 AdminInventoryConversionService。
 */
@Service
public class AdminInventoryMovementService {

	private static final Set<String> DOMAINS = Set.of("", "store", "rental");
	private static final Set<String> STATUSES = Set.of("", "draft", "posted", "cancelled");
	/** 列表篩選允許的 type（含歷史與稽核）；新建另限 product_stock_update／rental transfer */
	private static final Set<String> MOVEMENT_TYPES = Set.of(
			"",
			"receipt",
			"write_off",
			"transfer",
			"conversion_out",
			"conversion_in",
			"product_stock_update");
	/** 列級異動性質白名單（方案 B；UI：進貨／移轉／盤點／折損／損耗） */
	private static final Set<String> LINE_NATURES = Set.of(
			"receipt",
			"transfer",
			"stocktake",
			"damage",
			"write_off");
	private static final Set<String> SORT_DIRECTIONS = Set.of("asc", "desc");
	private static final Map<String, String> SORT_COLUMNS = Map.of(
			"occurredAt", "movement.occurred_at",
			"createdAt", "movement.created_at",
			"updatedAt", "movement.updated_at",
			"movementNo", "movement.movement_no");

	private final AdminInventoryMovementRepository repository;

	public AdminInventoryMovementService(AdminInventoryMovementRepository repository) {
		this.repository = repository;
	}

	@Transactional(readOnly = true)
	public PagedMovements list(
			int page,
			int size,
			String query,
			String inventoryDomain,
			String status,
			String movementType,
			String sort) {
		String normalizedDomain = normalize(inventoryDomain);
		String normalizedStatus = normalize(status);
		String normalizedType = normalize(movementType);
		SortSpec sortSpec = validateListParameters(
				page,
				size,
				normalizedDomain,
				normalizedStatus,
				normalizedType,
				sort);
		var idPage = repository.findIds(
				page,
				size,
				normalize(query),
				normalizedDomain,
				normalizedStatus,
				normalizedType,
				sortSpec.column(),
				sortSpec.direction());
		int totalPages = (int) Math.ceil((double) idPage.totalElements() / size);

		return new PagedMovements(
				repository.findByIds(idPage.ids()),
				new PageMeta(page, size, idPage.totalElements(), totalPages));
	}

	@Transactional(readOnly = true)
	public AdminInventoryMovementResponse get(long id) {
		List<AdminInventoryMovementResponse> movements = repository.findByIds(List.of(id));
		if (movements.isEmpty()) {
			throw notFound();
		}

		return movements.getFirst();
	}

	@Transactional(readOnly = true)
	public AdminInventoryMovementLookupResponse getLookups() {
		return repository.findLookups();
	}

	@Transactional
	public AdminInventoryMovementResponse createDraft(
			String actorId,
			AdminInventoryMovementCreateRequest request) {
		String sourceLocationId = normalizeNullable(request.sourceLocationId());
		String destinationLocationId = normalizeNullable(request.destinationLocationId());
		validateCreatePayload(
				request.inventoryDomain(),
				request.movementType(),
				sourceLocationId,
				destinationLocationId);
		Instant now = Instant.now();
		Instant occurredAt = request.occurredAt() == null ? now : request.occurredAt();
		if (occurredAt.isAfter(now.plusSeconds(300))) {
			throw validation("Movement occurredAt cannot be in the future");
		}
		long id = repository.insertMovement(
				generateMovementNo(now),
				request.inventoryDomain(),
				request.movementType(),
				sourceLocationId,
				destinationLocationId,
				actorId,
				request.reason().trim(),
				occurredAt,
				now);

		return get(id);
	}

	@Transactional
	public AdminInventoryMovementResponse addItem(
			long id,
			AdminInventoryMovementItemRequest request) {
		MovementState movement = requireLockedMovement(id);
		requireNotConversion(movement, "Conversion movement items must be managed via /api/admin/inventory-conversions");
		requireDraft(movement, "Only draft movement can add items");

		String variantId = request.variantId().trim();
		VariantSnapshot variant = repository.findVariant(movement.inventoryDomain(), variantId);
		if (variant == null) {
			throw new BusinessException(ErrorCode.NOT_FOUND, "Inventory variant not found");
		}
		if (!"active".equals(variant.status())) {
			throw conflict("Inactive inventory variant cannot be added to a new movement");
		}

		String sourceLocationId;
		String destinationLocationId;
		String lineReason;
		String lineNature;

		if (isProductStockUpdate(movement)) {
			if (!"store".equals(movement.inventoryDomain())) {
				throw validation("product_stock_update items require store inventoryDomain");
			}
			sourceLocationId = normalizeNullable(request.sourceLocationId());
			destinationLocationId = normalizeNullable(request.destinationLocationId());
			validateItemLocations(sourceLocationId, destinationLocationId);
			lineReason = normalizeNullable(request.lineReason());
			lineNature = normalizeLineNature(request.lineNature());
		} else if (isRentalTransfer(movement)) {
			// 營地互轉：庫位在表頭；明細只帶規格＋數量（前端 createDraft→addItem→post）
			if (repository.movementContainsVariant(id, movement.inventoryDomain(), variantId)) {
				throw conflict("Movement already contains this variant");
			}
			sourceLocationId = null;
			destinationLocationId = null;
			lineReason = null;
			lineNature = null;
		} else {
			throw conflict("Only product_stock_update or rental transfer drafts can add items via this API");
		}

		repository.insertItem(
				id,
				movement.inventoryDomain(),
				variant,
				request.quantity(),
				sourceLocationId,
				destinationLocationId,
				lineReason,
				lineNature);

		return get(id);
	}

	/**
	 * 定稿異動單：
	 * <ul>
	 *   <li>product_stock_update：只改 status／postedAt／employeeId，不碰 on-hand（ADM-W2-08）</li>
	 *   <li>rental transfer：悲觀鎖後改 rental_sku_variant_stocks（營地互轉例外）</li>
	 * </ul>
	 */
	@Transactional
	public AdminInventoryMovementResponse post(long id, String actorId) {
		MovementState movement = requireLockedMovement(id);
		requireNotConversion(movement, "Conversion movement must be posted via /api/admin/inventory-conversions");
		if ("posted".equals(movement.status())) {
			return get(id);
		}
		if ("cancelled".equals(movement.status())) {
			throw conflict("Cancelled movement cannot be posted");
		}
		var items = repository.findItems(id);
		if (items.isEmpty()) {
			throw conflict("Movement must contain at least one item before posting");
		}

		Instant now = Instant.now();
		if (isRentalTransfer(movement)) {
			applyRentalTransferStock(movement, items, now);
		} else if (!isProductStockUpdate(movement)) {
			throw conflict("Only product_stock_update or rental transfer can be posted via this API");
		}
		repository.markPosted(id, actorId, now);

		return get(id);
	}

	@Transactional
	public AdminInventoryMovementResponse cancel(long id, String actorId) {
		MovementState movement = requireLockedMovement(id);
		requireNotConversion(movement, "Conversion movement must be cancelled via /api/admin/inventory-conversions");
		if ("cancelled".equals(movement.status())) {
			return get(id);
		}
		if ("posted".equals(movement.status())) {
			throw conflict("Posted movement cannot be cancelled");
		}
		repository.markCancelled(id, actorId, Instant.now());

		return get(id);
	}

	@Transactional
	public AdminInventoryMovementResponse patchReason(long id, String reason) {
		MovementState movement = requireLockedMovement(id);
		requireNotConversion(movement, "Conversion movement reason must be managed via /api/admin/inventory-conversions");
		String trimmed = reason == null ? "" : reason.trim();
		if (trimmed.isBlank()) {
			throw validation("reason is required");
		}
		repository.updateMovementReason(id, trimmed);

		return get(id);
	}

	/**
	 * 改明細備註／異動性質（draft／posted 皆可）。
	 * conversion_out／conversion_in 也允許改註記：不改庫存，供「產生異動紀錄」補填列備註（A1/B2/C2）。
	 */
	@Transactional
	public AdminInventoryMovementResponse patchItemLineReason(
			long id,
			long itemId,
			String lineReason,
			String lineNature) {
		MovementState movement = requireLockedMovement(id);
		boolean found = repository.findItems(id).stream().anyMatch(item -> item.id() == itemId);
		if (!found) {
			throw new BusinessException(ErrorCode.NOT_FOUND, "Inventory movement item not found");
		}
		// null＝該欄不改；空字串＝清成 DB null；有值＝寫入（lineNature 需在白名單）
		boolean updateReason = lineReason != null;
		boolean updateNature = lineNature != null;
		if (!updateReason && !updateNature) {
			throw validation("Provide lineReason and/or lineNature to patch");
		}
		String nextReason = updateReason ? normalizeNullable(lineReason) : null;
		String nextNature = updateNature ? normalizeLineNature(lineNature) : null;
		repository.updateItemAnnotations(id, itemId, nextReason, updateReason, nextNature, updateNature);

		return get(id);
	}

	/**
	 * 營地互轉過帳：依 variantId＋locationId 固定順序鎖庫存 → 驗證來源可扣 → 寫回兩邊 on-hand。
	 * （保留 G-3 規則：扣減後不得 &lt; 0，也不得低於 active 租借保留量）
	 */
	private void applyRentalTransferStock(
			MovementState movement,
			List<AdminInventoryMovementItemResponse> items,
			Instant now) {
		List<StockKey> lockOrder = buildTransferLockOrder(movement, items);
		Map<StockKey, Integer> quantities = new LinkedHashMap<>();
		for (StockKey key : lockOrder) {
			int quantity = repository.ensureAndLockStock(
					"rental",
					key.locationId(),
					key.variantId(),
					now);
			quantities.put(key, quantity);
		}

		for (AdminInventoryMovementItemResponse item : items) {
			StockKey sourceKey = new StockKey(movement.sourceLocationId(), item.variantId());
			int current = quantities.get(sourceKey);
			int reserved = repository.findActiveReservedQuantity(
					"rental",
					sourceKey.locationId(),
					sourceKey.variantId());
			int next = current - item.quantity();
			if (next < 0 || next < reserved) {
				throw conflict("Insufficient unreserved inventory for SKU: " + item.sku());
			}
			quantities.put(sourceKey, next);

			StockKey destinationKey = new StockKey(movement.destinationLocationId(), item.variantId());
			quantities.put(destinationKey, quantities.get(destinationKey) + item.quantity());
		}

		for (Map.Entry<StockKey, Integer> entry : quantities.entrySet()) {
			repository.updateStock(
					"rental",
					entry.getKey().locationId(),
					entry.getKey().variantId(),
					entry.getValue(),
					now);
		}
	}

	private List<StockKey> buildTransferLockOrder(
			MovementState movement,
			List<AdminInventoryMovementItemResponse> items) {
		Set<StockKey> keys = new LinkedHashSet<>();
		for (AdminInventoryMovementItemResponse item : items) {
			keys.add(new StockKey(movement.sourceLocationId(), item.variantId()));
			keys.add(new StockKey(movement.destinationLocationId(), item.variantId()));
		}
		List<StockKey> sorted = new ArrayList<>(keys);
		sorted.sort(Comparator
				.comparing(StockKey::variantId)
				.thenComparing(StockKey::locationId));

		return sorted;
	}

	/** 正規化列級異動性質；空白→null；非法值→400。 */
	private String normalizeLineNature(String lineNature) {
		String normalized = normalizeNullable(lineNature);
		if (normalized == null) {
			return null;
		}
		if (!LINE_NATURES.contains(normalized)) {
			throw validation(
					"lineNature must be one of: receipt, transfer, stocktake, damage, write_off");
		}
		return normalized;
	}

	private void validateCreatePayload(
			String inventoryDomain,
			String movementType,
			String sourceLocationId,
			String destinationLocationId) {
		if ("product_stock_update".equals(movementType)) {
			if (!"store".equals(inventoryDomain)) {
				throw validation("product_stock_update requires inventoryDomain=store");
			}
			if (sourceLocationId != null || destinationLocationId != null) {
				throw validation("product_stock_update header must omit source and destination locations");
			}
			return;
		}
		if ("transfer".equals(movementType)) {
			// 唯一允許「post 改 on-hand」的新建類型：租借營區互轉
			if (!"rental".equals(inventoryDomain)) {
				throw validation("New transfer movements must use inventoryDomain=rental");
			}
			if (sourceLocationId == null
					|| destinationLocationId == null
					|| sourceLocationId.equals(destinationLocationId)) {
				throw validation("Transfer requires different source and destination locations");
			}
			validateRentalLocation(sourceLocationId);
			validateRentalLocation(destinationLocationId);
			return;
		}
		throw validation("New movements must use movementType=product_stock_update or rental transfer");
	}

	private void validateItemLocations(String sourceLocationId, String destinationLocationId) {
		if (sourceLocationId == null && destinationLocationId == null) {
			throw validation("Item requires sourceLocationId and/or destinationLocationId");
		}
		if (sourceLocationId != null
				&& destinationLocationId != null
				&& sourceLocationId.equals(destinationLocationId)) {
			throw validation("Item source and destination locations must differ");
		}
		validateStoreLocation(sourceLocationId);
		validateStoreLocation(destinationLocationId);
	}

	private void validateStoreLocation(String locationId) {
		if (locationId == null) {
			return;
		}
		LocationRecord location = repository.findActiveLocation(locationId);
		if (location == null || !location.active()) {
			throw new BusinessException(ErrorCode.NOT_FOUND, "Active inventory location not found");
		}
		if (!"store".equals(location.inventoryDomain())) {
			throw validation("product_stock_update item locations must be store domain");
		}
	}

	private void validateRentalLocation(String locationId) {
		LocationRecord location = repository.findActiveLocation(locationId);
		if (location == null || !location.active()) {
			throw new BusinessException(ErrorCode.NOT_FOUND, "Active inventory location not found");
		}
		if (!"rental".equals(location.inventoryDomain())) {
			throw validation("Rental transfer locations must be rental domain");
		}
	}

	private boolean isProductStockUpdate(MovementState movement) {
		return "product_stock_update".equals(movement.movementType());
	}

	private boolean isRentalTransfer(MovementState movement) {
		return "rental".equals(movement.inventoryDomain())
				&& "transfer".equals(movement.movementType());
	}

	private SortSpec validateListParameters(
			int page,
			int size,
			String inventoryDomain,
			String status,
			String movementType,
			String sort) {
		if (page < 0
				|| size < 1
				|| size > 100
				|| !DOMAINS.contains(inventoryDomain)
				|| !STATUSES.contains(status)
				|| !MOVEMENT_TYPES.contains(movementType)) {
			throw validation("Invalid inventory movement list parameters");
		}
		String[] parts = sort.split(",", -1);
		if (parts.length != 2
				|| !SORT_COLUMNS.containsKey(parts[0])
				|| !SORT_DIRECTIONS.contains(parts[1].toLowerCase(Locale.ROOT))) {
			throw validation("Invalid inventory movement sort");
		}

		return new SortSpec(
				SORT_COLUMNS.get(parts[0]),
				parts[1].toUpperCase(Locale.ROOT));
	}

	private MovementState requireLockedMovement(long id) {
		MovementState movement = repository.lockMovement(id);
		if (movement == null) {
			throw notFound();
		}

		return movement;
	}

	private void requireDraft(MovementState movement, String message) {
		if (!"draft".equals(movement.status())) {
			throw conflict(message);
		}
	}

	private void requireNotConversion(MovementState movement, String message) {
		if ("conversion_out".equals(movement.movementType()) || "conversion_in".equals(movement.movementType())) {
			throw conflict(message);
		}
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

		return "MOV-" + date + "-" + random;
	}

	private String normalize(String value) {
		return value == null ? "" : value.trim();
	}

	private String normalizeNullable(String value) {
		String normalized = normalize(value);

		return normalized.isBlank() ? null : normalized;
	}

	private BusinessException validation(String message) {
		return new BusinessException(ErrorCode.VALIDATION_ERROR, message);
	}

	private BusinessException conflict(String message) {
		return new BusinessException(ErrorCode.CONFLICT, message);
	}

	private BusinessException notFound() {
		return new BusinessException(ErrorCode.NOT_FOUND, "Inventory movement not found");
	}

	public record PagedMovements(List<AdminInventoryMovementResponse> data, PageMeta meta) {
	}

	private record SortSpec(String column, String direction) {
	}

	/** 鎖庫存／更新用的鍵：同一規格先鎖小 locationId，避免死鎖。 */
	private record StockKey(String locationId, String variantId) {
	}
}
