package com.yuruicamp.backend.catalog.application;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.yuruicamp.backend.catalog.api.AdminProductImageRequest;
import com.yuruicamp.backend.catalog.api.AdminProductLookupResponse;
import com.yuruicamp.backend.catalog.api.AdminProductResponse;
import com.yuruicamp.backend.catalog.api.AdminProductStockLocationRequest;
import com.yuruicamp.backend.catalog.api.AdminProductUpsertRequest;
import com.yuruicamp.backend.catalog.api.AdminProductVariantRequest;
import com.yuruicamp.backend.catalog.domain.Brand;
import com.yuruicamp.backend.catalog.domain.EquipmentImage;
import com.yuruicamp.backend.catalog.domain.EquipmentItem;
import com.yuruicamp.backend.catalog.domain.Product;
import com.yuruicamp.backend.catalog.domain.ProductCategory;
import com.yuruicamp.backend.catalog.domain.ProductVariant;
import com.yuruicamp.backend.catalog.infrastructure.AdminProductReadRepository;
import com.yuruicamp.backend.catalog.infrastructure.BrandRepository;
import com.yuruicamp.backend.catalog.infrastructure.EquipmentImageRepository;
import com.yuruicamp.backend.catalog.infrastructure.EquipmentItemRepository;
import com.yuruicamp.backend.catalog.infrastructure.ProductCategoryRepository;
import com.yuruicamp.backend.catalog.infrastructure.ProductRepository;
import com.yuruicamp.backend.catalog.infrastructure.ProductVariantRepository;
import com.yuruicamp.backend.common.api.PageMeta;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.inventory.infrastructure.AdminInventoryMovementRepository;
import com.yuruicamp.backend.inventory.infrastructure.AdminInventoryMovementRepository.LocationRecord;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 後台商品管理用例：同交易同步裝備主檔、商品、規格、圖片，並可選寫入商城 inventory_stocks（ADM-W2-08）。
 */
@Service
public class AdminProductService {

	private static final Set<String> STATUS_VALUES = Set.of("", "active", "inactive");
	private static final Set<String> SORT_DIRECTIONS = Set.of("asc", "desc");

	private final ProductRepository productRepository;
	private final EquipmentItemRepository equipmentItemRepository;
	private final ProductVariantRepository variantRepository;
	private final EquipmentImageRepository imageRepository;
	private final ProductCategoryRepository categoryRepository;
	private final BrandRepository brandRepository;
	private final AdminProductReadRepository readRepository;
	private final AdminInventoryMovementRepository inventoryMovementRepository;

	public AdminProductService(
			ProductRepository productRepository,
			EquipmentItemRepository equipmentItemRepository,
			ProductVariantRepository variantRepository,
			EquipmentImageRepository imageRepository,
			ProductCategoryRepository categoryRepository,
			BrandRepository brandRepository,
			AdminProductReadRepository readRepository,
			AdminInventoryMovementRepository inventoryMovementRepository) {
		this.productRepository = productRepository;
		this.equipmentItemRepository = equipmentItemRepository;
		this.variantRepository = variantRepository;
		this.imageRepository = imageRepository;
		this.categoryRepository = categoryRepository;
		this.brandRepository = brandRepository;
		this.readRepository = readRepository;
		this.inventoryMovementRepository = inventoryMovementRepository;
	}

	@Transactional(readOnly = true)
	public PagedProducts list(
			int page,
			int size,
			String query,
			String status,
			Long categoryId,
			String brandId,
			String sort) {
		String normalizedStatus = normalize(status);
		SortSpec sortSpec = validateListParameters(page, size, normalizedStatus, sort);
		var idPage = readRepository.findIds(
				page,
				size,
				normalize(query),
				normalizedStatus,
				categoryId,
				normalize(brandId),
				sortSpec.field(),
				sortSpec.direction());
		List<AdminProductResponse> data = readRepository.findProducts(idPage.ids());
		int totalPages = (int) Math.ceil((double) idPage.totalElements() / size);

		return new PagedProducts(
				data,
				new PageMeta(page, size, idPage.totalElements(), totalPages));
	}

	@Transactional(readOnly = true)
	public AdminProductResponse get(String id) {
		List<AdminProductResponse> products = readRepository.findProducts(List.of(id));
		if (products.isEmpty()) {
			throw new BusinessException(ErrorCode.NOT_FOUND, "Product not found");
		}

		return products.getFirst();
	}

	@Transactional(readOnly = true)
	public AdminProductLookupResponse getLookups() {
		return readRepository.findLookups();
	}

	@Transactional
	public AdminProductResponse create(AdminProductUpsertRequest request) {
		validateRequest(request, null);
		ProductCategory category = findCategory(request.categoryId());
		Brand brand = findBrand(request.brandId());
		Instant now = Instant.now();

		EquipmentItem item = new EquipmentItem();
		item.setId(generateId("E"));
		item.setCategory(category);
		item.setBrand(brand);
		item.setName(request.name().trim());
		item.setDescription(normalizeNullable(request.description()));
		item.setActive(true);
		item.setCreatedAt(now);
		item.setUpdatedAt(now);
		equipmentItemRepository.save(item);

		Product product = new Product();
		product.setId(generateId("P"));
		product.setStatus(request.status());
		product.setItem(item);
		product.setCreatedAt(now);
		product.setUpdatedAt(now);
		productRepository.save(product);

		syncVariants(product, request.variants(), now);
		replaceImages(item.getId(), request.images(), request.name(), now);
		productRepository.flush();

		return get(product.getId());
	}

	@Transactional
	public AdminProductResponse update(String id, AdminProductUpsertRequest request) {
		Product product = findProductForUpdate(id);
		validateRequest(request, product.getId());
		ProductCategory category = findCategory(request.categoryId());
		Brand brand = findBrand(request.brandId());
		Instant now = Instant.now();
		EquipmentItem item = product.getItem();

		item.setCategory(category);
		item.setBrand(brand);
		item.setName(request.name().trim());
		item.setDescription(normalizeNullable(request.description()));
		item.setUpdatedAt(now);
		equipmentItemRepository.save(item);

		product.setStatus(request.status());
		product.setUpdatedAt(now);
		productRepository.save(product);

		syncVariants(product, request.variants(), now);
		if (request.images() != null) {
			replaceImages(item.getId(), request.images(), request.name(), now);
		}
		productRepository.flush();

		return get(product.getId());
	}

	@Transactional
	public AdminProductResponse activate(String id) {
		return changeStatus(id, "active");
	}

	@Transactional
	public AdminProductResponse deactivate(String id) {
		return changeStatus(id, "inactive");
	}

	private AdminProductResponse changeStatus(String id, String status) {
		Product product = findProductForUpdate(id);
		if ("active".equals(status)) {
			boolean hasActiveVariant = variantRepository.findAllByProductIdOrderById(id).stream()
					.anyMatch(variant -> "active".equals(variant.getStatus()));
			if (!hasActiveVariant) {
				throw new BusinessException(
						ErrorCode.CONFLICT,
						"Active product must have at least one active variant");
			}
		}
		if (!status.equals(product.getStatus())) {
			product.setStatus(status);
			product.setUpdatedAt(Instant.now());
			productRepository.saveAndFlush(product);
		}

		return get(id);
	}

	private void syncVariants(
			Product product,
			List<AdminProductVariantRequest> requests,
			Instant now) {
		List<ProductVariant> existing = variantRepository.findAllByProductIdOrderById(product.getId());
		Map<String, ProductVariant> existingById = new HashMap<>();
		existing.forEach(variant -> existingById.put(variant.getId(), variant));
		Set<String> retainedIds = new HashSet<>();
		List<ProductVariant> changed = new ArrayList<>();
		// 收集「規格 ID → 要寫的庫位量」；null／省略 stockLocations＝本規格不動庫存
		List<VariantStockWrite> stockWrites = new ArrayList<>();

		for (AdminProductVariantRequest request : requests) {
			String requestId = normalizeNullable(request.id());
			ProductVariant variant;
			if (requestId == null) {
				variant = new ProductVariant();
				variant.setId(generateId("V"));
				variant.setProduct(product);
				variant.setCreatedAt(now);
			} else {
				variant = existingById.get(requestId);
				if (variant == null) {
					throw new BusinessException(
							ErrorCode.CONFLICT,
							"Variant does not belong to product: " + requestId);
				}
			}
			validateSkuAvailability(request.sku().trim(), variant.getId());
			variant.setSku(request.sku().trim());
			variant.setColor(normalizeNullable(request.color()));
			variant.setSize(normalizeNullable(request.size()));
			variant.setSpecification(request.specification().trim());
			variant.setPrice(request.price());
			variant.setStatus(request.status());
			variant.setUpdatedAt(now);
			retainedIds.add(variant.getId());
			changed.add(variant);
			if (request.stockLocations() != null) {
				stockWrites.add(new VariantStockWrite(variant.getId(), request.stockLocations()));
			}
		}

		for (ProductVariant variant : existing) {
			if (!retainedIds.contains(variant.getId()) && !"inactive".equals(variant.getStatus())) {
				variant.setStatus("inactive");
				variant.setUpdatedAt(now);
				changed.add(variant);
			}
		}
		try {
			variantRepository.saveAll(changed);
			variantRepository.flush();
		}
		catch (DataIntegrityViolationException ex) {
			throw new BusinessException(
					ErrorCode.CONFLICT,
					"SKU or product variant combination already exists");
		}
		applyStoreStockWrites(stockWrites, now);
	}

	/**
	 * 依契約 Z2 寫入商城 on-hand：只處理有送出的 location；鎖 variant×location 後 upsert。
	 */
	private void applyStoreStockWrites(List<VariantStockWrite> stockWrites, Instant now) {
		if (stockWrites.isEmpty()) {
			return;
		}
		record StockTarget(String variantId, String locationId, int onHand) {
		}
		List<StockTarget> targets = new ArrayList<>();
		for (VariantStockWrite write : stockWrites) {
			Set<String> seenLocations = new HashSet<>();
			for (AdminProductStockLocationRequest location : write.locations()) {
				String locationId = location.locationId().trim();
				if (!seenLocations.add(locationId)) {
					throw new BusinessException(
							ErrorCode.VALIDATION_ERROR,
							"Duplicate stock location in request: " + locationId);
				}
				if (location.onHandQuantity() == null || location.onHandQuantity() < 0) {
					throw new BusinessException(
							ErrorCode.VALIDATION_ERROR,
							"onHandQuantity must be greater than or equal to 0");
				}
				LocationRecord record = inventoryMovementRepository.findActiveLocation(locationId);
				if (record == null || !record.active()) {
					throw new BusinessException(ErrorCode.NOT_FOUND, "Active inventory location not found");
				}
				if (!"store".equals(record.inventoryDomain())) {
					throw new BusinessException(
							ErrorCode.VALIDATION_ERROR,
							"Product stockLocations must use store inventory locations");
				}
				targets.add(new StockTarget(write.variantId(), locationId, location.onHandQuantity()));
			}
		}
		targets.sort((left, right) -> {
			int byVariant = left.variantId().compareTo(right.variantId());
			return byVariant != 0 ? byVariant : left.locationId().compareTo(right.locationId());
		});
		for (StockTarget target : targets) {
			inventoryMovementRepository.ensureAndLockStock(
					"store",
					target.locationId(),
					target.variantId(),
					now);
			inventoryMovementRepository.updateStock(
					"store",
					target.locationId(),
					target.variantId(),
					target.onHand(),
					now);
		}
	}

	private record VariantStockWrite(String variantId, List<AdminProductStockLocationRequest> locations) {
	}

	private void replaceImages(
			String itemId,
			List<AdminProductImageRequest> requests,
			String productName,
			Instant now) {
		imageRepository.deleteAllByItemId(itemId);
		imageRepository.flush();
		List<EquipmentImage> images = new ArrayList<>();
		List<AdminProductImageRequest> source = requests == null ? List.of() : requests;
		for (int index = 0; index < source.size(); index++) {
			AdminProductImageRequest request = source.get(index);
			String url = request.url().trim();
			if (!isSupportedImageUrl(url)) {
				throw new BusinessException(
						ErrorCode.VALIDATION_ERROR,
						"Image URL must use /assets/ or http(s)");
			}
			EquipmentImage image = new EquipmentImage();
			image.setItemId(itemId);
			image.setSortOrder(index);
			image.setUrl(url);
			image.setAltText(normalizeNullable(request.altText()) == null
					? productName.trim()
					: request.altText().trim());
			image.setCreatedAt(now);
			image.setUpdatedAt(now);
			images.add(image);
		}
		imageRepository.saveAll(images);
	}

	private void validateRequest(AdminProductUpsertRequest request, String productId) {
		Set<String> skuValues = new HashSet<>();
		Set<String> specificationValues = new HashSet<>();
		long activeVariants = 0;
		for (AdminProductVariantRequest variant : request.variants()) {
			String sku = variant.sku().trim();
			if (!skuValues.add(sku)) {
				throw new BusinessException(ErrorCode.CONFLICT, "Duplicate SKU in request: " + sku);
			}
			String combination = normalize(variant.color()) + "\u0000"
					+ normalize(variant.size()) + "\u0000" + variant.specification().trim();
			if (!specificationValues.add(combination)) {
				throw new BusinessException(ErrorCode.CONFLICT, "Duplicate product variant specification");
			}
			if ("active".equals(variant.status())) {
				activeVariants++;
			}
		}
		if ("active".equals(request.status()) && activeVariants == 0) {
			throw new BusinessException(
					ErrorCode.CONFLICT,
					"Active product must have at least one active variant");
		}
		if (productId == null) {
			for (String sku : skuValues) {
				if (variantRepository.existsBySku(sku)) {
					throw new BusinessException(ErrorCode.CONFLICT, "SKU already exists: " + sku);
				}
			}
		}
	}

	private SortSpec validateListParameters(int page, int size, String status, String sort) {
		if (page < 0 || size < 1 || size > 100 || !STATUS_VALUES.contains(status)) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR, "Invalid product list parameters");
		}
		String[] parts = sort.split(",", -1);
		if (parts.length != 2
				|| AdminProductReadRepository.resolveSortColumn(parts[0]) == null
				|| !SORT_DIRECTIONS.contains(parts[1].toLowerCase(Locale.ROOT))) {
			throw new BusinessException(ErrorCode.VALIDATION_ERROR, "Invalid product sort");
		}

		return new SortSpec(parts[0], parts[1].toUpperCase(Locale.ROOT));
	}

	private Product findProductForUpdate(String id) {
		return productRepository.findByIdForUpdate(id)
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Product not found"));
	}

	private ProductCategory findCategory(Long categoryId) {
		return categoryRepository.findById(categoryId)
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Product category not found"));
	}

	private Brand findBrand(String brandId) {
		String normalized = normalize(brandId);
		if (normalized.isBlank()) {
			return null;
		}

		return brandRepository.findById(normalized)
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Brand not found"));
	}

	private void validateSkuAvailability(String sku, String variantId) {
		boolean exists = variantId == null
				? variantRepository.existsBySku(sku)
				: variantRepository.existsBySkuAndIdNot(sku, variantId);
		if (exists) {
			throw new BusinessException(ErrorCode.CONFLICT, "SKU already exists: " + sku);
		}
	}

	private boolean isSupportedImageUrl(String url) {
		return url.startsWith("/assets/")
				|| url.startsWith("https://")
				|| url.startsWith("http://");
	}

	private String generateId(String prefix) {
		return prefix + UUID.randomUUID()
				.toString()
				.replace("-", "")
				.substring(0, 31);
	}

	private String normalize(String value) {
		return value == null ? "" : value.trim();
	}

	private String normalizeNullable(String value) {
		String normalized = normalize(value);

		return normalized.isBlank() ? null : normalized;
	}

	public record PagedProducts(List<AdminProductResponse> data, PageMeta meta) {
	}

	private record SortSpec(String field, String direction) {
	}
}
