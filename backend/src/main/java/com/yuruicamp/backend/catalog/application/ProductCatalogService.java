package com.yuruicamp.backend.catalog.application;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import com.yuruicamp.backend.catalog.api.ProductResponse;
import com.yuruicamp.backend.catalog.domain.EquipmentImage;
import com.yuruicamp.backend.catalog.domain.Product;
import com.yuruicamp.backend.catalog.infrastructure.EquipmentImageRepository;
import com.yuruicamp.backend.catalog.infrastructure.ProductRepository;
import com.yuruicamp.backend.catalog.infrastructure.ProductRatingRepository;
import com.yuruicamp.backend.catalog.infrastructure.ProductRatingRepository.ProductRating;
import com.yuruicamp.backend.catalog.infrastructure.VariantAvailabilityProjection;
import com.yuruicamp.backend.catalog.infrastructure.VariantAvailabilityRepository;
import com.yuruicamp.backend.common.api.PageMeta;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Public catalog use-cases (B-1 list, B-2 detail, B-3 pagination and sorting).
 *
 * <h2>給新手：這支 Service 在做什麼？</h2>
 * <ol>
 *   <li>從 Repository 讀「可販售」商品（active product + active equipment）</li>
 *   <li>只保留 active variants；沒有規格的商品直接丟掉</li>
 *   <li>查主圖（equipment_images.sort_order = 0）</li>
 *   <li>組裝成 Product API Contract v0.1 的 DTO</li>
 * </ol>
 *
 * <h2>如何自己完成 B-3～B-5？（複製這套流程）</h2>
 * <ul>
 *   <li><b>B-3 分頁（已完成）</b>：{@link #listProducts(int, int, String)} 接收
 *       {@code page,size,sort}，Repository 使用 {@code Pageable}，Controller 透過
 *       {@code ApiResponse.ok(data, meta)} 回傳分頁資訊。</li>
 *   <li><b>B-4 篩選</b>：加 query 參數（category／brand／minPrice／maxPrice），
 *       在 JPQL {@code where} 加條件，或先查出再在 memory filter（資料少時可接受）。
 *       篩選參數名稱要寫進 {@code docs/api/product-api-contract.md}。</li>
 *   <li><b>B-5 庫存</b>：不要塞進本契約亂加欄位；另開讀模型或升版契約，
 *       可查 {@code product_stock_summary}／{@code sellable_product_variants}。</li>
 *   <li><b>B-7 branches</b>：新建 {@code branch} package，照
 *       Controller → Service → Repository → DTO 四層，公開 GET 即可。</li>
 * </ul>
 */
@Service
public class ProductCatalogService {

	private static final BigDecimal MIN_CATALOG_PRICE = BigDecimal.ZERO;

	private static final BigDecimal MAX_CATALOG_PRICE = new BigDecimal("9999999999.99");

	private final ProductRepository productRepository;
	private final EquipmentImageRepository equipmentImageRepository;
	private final ProductCatalogAssembler assembler;
	private final VariantAvailabilityRepository variantAvailabilityRepository;
	private final ProductRatingRepository productRatingRepository;

	public ProductCatalogService(
			ProductRepository productRepository,
			EquipmentImageRepository equipmentImageRepository,
			ProductCatalogAssembler assembler,
			VariantAvailabilityRepository variantAvailabilityRepository,
			ProductRatingRepository productRatingRepository) {
		// 用途：透過建構式注入商品、圖片 Repository 與 DTO 組裝器。
		// 核心重點：所有相依物件均為必要依賴，交由 Spring 建立並管理此 Service。
		this.productRepository = productRepository;
		this.equipmentImageRepository = equipmentImageRepository;
		this.assembler = assembler;
		this.variantAvailabilityRepository = variantAvailabilityRepository;
		this.productRatingRepository = productRatingRepository;
	}

	/**
	 * B-1: GET /api/products
	 */
	@Transactional(readOnly = true)
	public List<ProductResponse> listProducts() {
		// 用途：取得未分頁的公開商品清單。
		// 核心重點：批次載入主圖、排除沒有 active 規格的商品，最後依商品 ID 穩定排序。
		List<Product> products = productRepository.findAllActiveForCatalog();
		Map<String, String> images = loadMainImages(products);
		Map<String, Long> availability = loadAvailability(products);
		Map<String, ProductRating> ratings = loadRatings(products);

		return products.stream()
				.map(product -> withRating(
						assembler.toResponse(product, images, availability),
						ratings.getOrDefault(product.getId(), ProductRating.empty(product.getId()))))
				.filter(dto -> !dto.variants().isEmpty())
				.sorted(Comparator.comparing(ProductResponse::id))
				.toList();
	}

	/** B-3／B-4: GET /api/products with pagination, sorting and filters (Contract v0.4). */
	@Transactional(readOnly = true)
	public PagedProducts listProducts(
			int page,
			int size,
			String sort,
			String category,
			String brand,
			BigDecimal minPrice,
			BigDecimal maxPrice) {
		// 用途：依頁碼、筆數及排序條件取得公開商品清單與分頁資訊。
		// 核心重點：先驗證原始價格，再把未指定條件轉成明確型別，避免 PostgreSQL 將 null 誤判為 bytea。
		validatePriceRange(minPrice, maxPrice);

		BigDecimal normalizedMinPrice = minPrice == null ? MIN_CATALOG_PRICE : minPrice;
		BigDecimal normalizedMaxPrice = maxPrice == null ? MAX_CATALOG_PRICE : maxPrice;

		Page<String> idPage = productRepository.findActiveIdsForCatalog(
				normalizeFilter(category),
				normalizeFilter(brand),
				normalizedMinPrice,
				normalizedMaxPrice,
				PageRequest.of(page, size, toSort(sort)));
		if (idPage.isEmpty()) {
			return new PagedProducts(List.of(), toMeta(idPage));
		}

		Map<String, Product> productById = productRepository.findAllByIdInForCatalog(idPage.getContent()).stream()
				.collect(Collectors.toMap(Product::getId, product -> product));
		List<Product> productsInPageOrder = idPage.getContent().stream()
				.map(productById::get)
				.filter(Objects::nonNull)
				.toList();
		Map<String, String> images = loadMainImages(productsInPageOrder);
		Map<String, Long> availability = loadAvailability(productsInPageOrder);
		Map<String, ProductRating> ratings = loadRatings(productsInPageOrder);
		List<ProductResponse> data = productsInPageOrder.stream()
				.map(product -> withRating(
						assembler.toResponse(product, images, availability),
						ratings.getOrDefault(product.getId(), ProductRating.empty(product.getId()))))
				.filter(dto -> !dto.variants().isEmpty())
				.toList();
		return new PagedProducts(data, toMeta(idPage));
	}

	/**
	 * 首頁公開熱銷商品。
	 */
	@Transactional(readOnly = true)
	public List<ProductResponse> listBestsellers(int limit) {
		// 先由資料庫依有效訂單銷量選出商品，再沿用公開商品契約組裝完整資料。
		List<String> productIds = productRepository.findBestsellerIds(PageRequest.of(0, limit));
		if (productIds.isEmpty()) {
			return List.of();
		}

		Map<String, Product> productById = productRepository.findAllByIdInForCatalog(productIds).stream()
				.collect(Collectors.toMap(Product::getId, product -> product));
		List<Product> products = productIds.stream()
				.map(productById::get)
				.filter(Objects::nonNull)
				.toList();
		Map<String, String> images = loadMainImages(products);
		Map<String, Long> availability = loadAvailability(products);
		Map<String, ProductRating> ratings = loadRatings(products);

		return products.stream()
				.map(product -> withRating(
						assembler.toResponse(product, images, availability),
						ratings.getOrDefault(product.getId(), ProductRating.empty(product.getId()))))
				.filter(dto -> !dto.variants().isEmpty())
				.toList();
	}

	private void validatePriceRange(BigDecimal minPrice, BigDecimal maxPrice) {
		if ((minPrice != null && minPrice.signum() < 0)
				|| (maxPrice != null && maxPrice.signum() < 0)
				|| (minPrice != null && maxPrice != null && minPrice.compareTo(maxPrice) > 0)) {
			throw new BusinessException(
					ErrorCode.VALIDATION_ERROR,
					"Price range must be non-negative and minPrice must not exceed maxPrice");
		}
	}

	private String normalizeFilter(String value) {
		// 用途：空字串代表不套用文字篩選，非空值則去除首尾空白。
		// 核心重點：Repository 不再接收無法穩定推斷 SQL 型別的 null 字串參數。
		if (value == null || value.isBlank()) {
			return "";
		}

		return value.trim();
	}

	private Sort toSort(String sort) {
		// 用途：把 API 的「欄位,方向」字串轉成 Spring Data Sort。
		// 核心重點：createdAt 對應 products.created_at，首頁可依商品販售身分建立時間排序。
		String[] parts = sort.split(",", -1);
		if (parts.length != 2) {
			throw invalidSort(sort);
		}
		String property = switch (parts[0]) {
			case "id" -> "id";
			case "name" -> "item.name";
			case "createdAt" -> "createdAt";
			default -> throw invalidSort(sort);
		};
		try {
			Sort.Direction direction = Sort.Direction.fromString(parts[1]);
			Sort requestedSort = Sort.by(direction, property);
			if ("createdAt".equals(parts[0])) {
				// 同一時間建立的商品再依 ID 排序，避免跨頁時順序不穩定。
				return requestedSort.and(Sort.by(direction, "id"));
			}

			return requestedSort;
		} catch (IllegalArgumentException ex) {
			throw invalidSort(sort);
		}
	}

	private BusinessException invalidSort(String sort) {
		// 用途：建立統一的排序參數驗證例外。
		// 核心重點：使用 VALIDATION_ERROR，並在訊息中列出允許格式供呼叫端修正。
		return new BusinessException(
				ErrorCode.VALIDATION_ERROR,
				"Invalid sort: " + sort
						+ ". Allowed values: id,asc|desc; name,asc|desc; createdAt,asc|desc");
	}

	private PageMeta toMeta(Page<?> page) {
		// 用途：把 Spring Data Page 的分頁狀態轉成 API 契約的 PageMeta。
		// 核心重點：僅輸出頁碼、每頁筆數、總筆數與總頁數，不暴露框架物件。
		return new PageMeta(page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages());
	}

	/**
	 * 用途：封裝分頁商品資料與分頁中繼資訊。
	 * 核心重點：以不可變 record 保證 Service 回傳的資料與 meta 成對存在。
	 */
	public record PagedProducts(List<ProductResponse> data, PageMeta meta) {
	}

	/**
	 * B-2: GET /api/products/{id}
	 */
	@Transactional(readOnly = true)
	public ProductResponse getProduct(String id) {
		// 用途：依商品 ID 取得單一公開商品詳情。
		// 核心重點：商品不存在、不可販售或沒有 active 規格時，一律視為 NOT_FOUND。
		Product product = productRepository.findActiveByIdForCatalog(id)
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Product not found: " + id));

		String image = equipmentImageRepository.findByItemIdAndSortOrder(product.getItem().getId(), 0)
				.map(EquipmentImage::getUrl)
				.orElse(null);

		Map<String, Long> availability = loadAvailability(List.of(product));
		ProductRating rating = productRatingRepository.findByProductIds(List.of(product.getId()))
				.getOrDefault(product.getId(), ProductRating.empty(product.getId()));
		ProductResponse dto = withRating(assembler.toResponse(product, image, availability), rating);
		if (dto.variants().isEmpty()) {
			throw new BusinessException(ErrorCode.NOT_FOUND, "Product not found: " + id);
		}
		return dto;
	}

	private Map<String, ProductRating> loadRatings(List<Product> products) {
		return productRatingRepository.findByProductIds(products.stream().map(Product::getId).toList());
	}

	private ProductResponse withRating(ProductResponse product, ProductRating rating) {
		return new ProductResponse(
				product.id(),
				product.itemId(),
				product.status(),
				product.name(),
				product.category(),
				product.brand(),
				product.description(),
				product.image(),
				product.price(),
				rating.rating().setScale(1, java.math.RoundingMode.HALF_UP).toPlainString(),
				rating.reviewCount(),
				product.tags(),
				product.variants());
	}

	private Map<String, Long> loadAvailability(List<Product> products) {
		Set<String> variantIds = products.stream()
				.flatMap(product -> product.getVariants().stream())
				.filter(variant -> "active".equals(variant.getStatus()))
				.map(variant -> variant.getId())
				.collect(Collectors.toSet());
		if (variantIds.isEmpty()) {
			return Map.of();
		}

		return variantAvailabilityRepository.findAvailabilityByVariantIds(variantIds).stream()
				.collect(Collectors.toMap(
						VariantAvailabilityProjection::getVariantId,
						projection -> projection.getAvailableQuantity() == null
								? 0L
								: projection.getAvailableQuantity()));
	}

	private Map<String, String> loadMainImages(List<Product> products) {
		// 用途：批次載入一批商品所屬器材的主圖，回傳「器材 ID → 圖片網址」對照表。
		// 核心重點：先去除重複 ID，再用單次查詢避免 N+1；重複圖片資料保留第一筆。
		Set<String> itemIds = products.stream()
				.map(p -> p.getItem().getId())
				.filter(Objects::nonNull)
				.collect(Collectors.toSet());
		if (itemIds.isEmpty()) {
			return Map.of();
		}
		return equipmentImageRepository.findByItemIdInAndSortOrder(itemIds, 0).stream()
				.collect(Collectors.toMap(EquipmentImage::getItemId, EquipmentImage::getUrl, (a, b) -> a));
	}
}
