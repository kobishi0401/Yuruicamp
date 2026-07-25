// Product list page state and behavior.
const _state = {
  allProducts: [],
  filteredProducts: [],
  currentPage: 1,
  pageSize: 12,
  filters: {
    category: '',
    brands: [],
    minPrice: null,
    maxPrice: null,
    tag: '',
    keyword: '',
  },
  sortBy: 'default',
};

let _adCarouselTimer = null;
let _adCarouselAbortController = null;
let _adCarouselTransitionFallback = null;

// Stop active ad carousel timers and event listeners before rebuilding or hiding it.
function _cleanupAdCarousel() {
  if (_adCarouselTimer) {
    clearInterval(_adCarouselTimer);
    _adCarouselTimer = null;
  }
  if (_adCarouselTransitionFallback) {
    clearTimeout(_adCarouselTransitionFallback);
    _adCarouselTransitionFallback = null;
  }
  if (_adCarouselAbortController) {
    _adCarouselAbortController.abort();
    _adCarouselAbortController = null;
  }
}

// Calculate the discount percentage label for a product.
function _calcDiscount(original, current) {
  if (!original || original <= current) return '';
  return `-${Math.round((1 - current / original) * 100)}%`;
}

// Render a simple star rating using text symbols.
function _renderStars(rating) {
  const normalizedRating = Math.max(0, Math.min(5, Number(rating) || 0));
  const ratingClass = `starRatingValue${Math.round(normalizedRating * 10)}`;
  const stars = '<span class="star">\u2605</span>'.repeat(5);
  return `
    <span class="starRating ${ratingClass}" aria-label="${normalizedRating.toFixed(1)} 顆星">
      <span class="starRatingBase" aria-hidden="true">${stars}</span>
      <span class="starRatingFill" aria-hidden="true">${stars}</span>
    </span>
  `;
}

// Normalize survey preference storage from AppState or profile localStorage.
function _normalizeSurveyTagValues(preferences) {
  if (Array.isArray(preferences)) return preferences;
  if (typeof preferences === 'string' && preferences) return [preferences];
  if (!preferences || typeof preferences !== 'object') return [];
  return [...(preferences.styles || []), ...(preferences.equipment || [])];
}

// Read JSON from localStorage without breaking carousel rendering on corrupt values.
function _readStorageJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`Failed to parse ${key} from localStorage`, error);
    return fallback;
  }
}

// Get the same surveyTag values that member-center displays as selected.
function _getSavedSurveyTags() {
  const appPrefs = _normalizeSurveyTagValues(window.AppState && window.AppState.preferences);
  if (appPrefs.length > 0) return appPrefs;

  const profilePrefs = _normalizeSurveyTagValues(_readStorageJson('yurui_profile', {}).preferences);
  if (profilePrefs.length > 0) return profilePrefs;

  return _normalizeSurveyTagValues(_readStorageJson('preferences', {}));
}

// Randomize carousel products so matched products do not always show in JSON order.
function _shuffleProducts(products) {
  const shuffled = [...products];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Select ad carousel products by matching saved surveyTags with products.interestTags.
function _selectAdCarouselProducts() {
  const selectedTags = new Set(_getSavedSurveyTags());
  const matchedProducts =
    selectedTags.size === 0
      ? []
      : _state.allProducts.filter((product) => {
          const interestTags = Array.isArray(product.interestTags) ? product.interestTags : [];
          return interestTags.some((tag) => selectedTags.has(tag));
        });
  const fallbackProducts = _state.allProducts.slice(0, 12);
  return _shuffleProducts(matchedProducts.length > 0 ? matchedProducts : fallbackProducts);
}

// Build compact spec option chips for product cards.
function _buildCardSpecChips(product, defaultSel) {
  const colors = product.colors || [];
  const sizes = product.sizes || [];
  const parts = [];

  if (colors.length) {
    parts.push(`
      <div class="productCardSpecGroup" data-spec-type="color">
        ${colors.map((value, index) => {
          const active = value === defaultSel.color ? ' isSelected' : '';
          return `<button type="button" class="productCardSpecChip${active}" data-spec-type="color" data-spec-value="${value}">${value}</button>`;
        }).join('')}
      </div>
    `);
  }
  if (sizes.length) {
    parts.push(`
      <div class="productCardSpecGroup" data-spec-type="size">
        ${sizes.map((value) => {
          const active = value === defaultSel.size ? ' isSelected' : '';
          return `<button type="button" class="productCardSpecChip${active}" data-spec-type="size" data-spec-value="${value}">${value}</button>`;
        }).join('')}
      </div>
    `);
  }

  // 多規格時才顯示 preview，避免單一規格與 chip 重複 / Preview only when multiple spec options
  const hasMultipleSpecs = colors.length > 1 || sizes.length > 1;
  const preview = hasMultipleSpecs && defaultSel.specLabel
    ? `<p class="productCardSpecPreview">${defaultSel.specLabel}</p>`
    : '';
  // Always render the specs wrapper (even if empty) so CSS min-height keeps cards equal.
  // 一律輸出規格容器（即使沒有 chip），CSS 才能用固定高度讓卡片對齊。
  return `<div class="productCardSpecs">${parts.join('')}${preview}</div>`;
}

// Read selected specs from card dataset.
function _readCardSpecSelection(card) {
  return {
    color: card.dataset.selectedColor || '',
    size: card.dataset.selectedSize || '',
  };
}

// 依後端標籤判定新品／熱銷，端點清單只負責提供各自的排序順位。
function _annotateProductLabels(products, newestProducts, bestsellerProducts) {
  const newestRanks = new Map(newestProducts.map((product, index) => [product.id, index]));
  const bestsellerRanks = new Map(bestsellerProducts.map((product, index) => [product.id, index]));

  return products.map((product) => ({
    ...product,
    isNew: product.tags.includes('新品'),
    isBestseller: product.tags.includes('熱銷'),
    newRank: newestRanks.get(product.id) ?? Number.MAX_SAFE_INTEGER,
    bestsellerRank: bestsellerRanks.get(product.id) ?? Number.MAX_SAFE_INTEGER,
  }));
}

// 建立商品卡左上角的新品與熱銷標籤，同一商品可同時顯示兩種狀態。
function _buildProductBadges(product) {
  const badges = [];

  if (product.isNew) {
    badges.push('<span class="productCardBadge badgeNew">新品</span>');
  }
  if (product.isBestseller) {
    badges.push('<span class="productCardBadge badgeHot">熱銷</span>');
  }

  return badges.length > 0
    ? `<div class="productCardBadges">${badges.join('')}</div>`
    : '';
}

// Build product card HTML for the products grid.
function _buildCard(product) {
  const priceFormatted = product.price.toLocaleString('zh-TW');
  const reviewCount = product.reviewCount ?? product.reviews ?? 0;
  const starRating = Number(product.rating) || 0;
  const ratingText = product.ratingDisplay ?? starRating.toFixed(1);
  const defaultSel = window.getDefaultCardSpecSelection
    ? window.getDefaultCardSpecSelection(product)
    : { color: '', size: '', specLabel: '' };

  // Multi-image gallery: Swiper swipe + GLightbox zoom / 多圖輪播 + 點擊放大
  const images = window.getItemImages
    ? window.getItemImages(product)
    : [product.image].filter(Boolean).map(_resolveProductImageSrc);
  const fallbackImage = images[0] || _resolveProductImageSrc(product);
  const badgeHtml = _buildProductBadges(product);
  const imageHtml = window.buildCardGalleryHtml
    ? window.buildCardGalleryHtml({
        images,
        alt: product.name,
        galleryId: `product-${product.id}`,
        wrapClass: 'productCardImageWrap',
        badgeHtml,
        fallbackSrc: `https://placehold.co/400x300/f2f2f2/999?text=${encodeURIComponent(product.name)}`,
      })
    : `<div class="productCardImageWrap"><img src="${fallbackImage}" alt="${product.name}" loading="lazy">${badgeHtml}</div>`;

  return `
    <div class="productCard" data-product-id="${product.id}" data-selected-color="${defaultSel.color}" data-selected-size="${defaultSel.size}" role="article">
      ${imageHtml}
      <div class="productCardBody">
        <p class="productCardBrand">${product.brand}</p>
        <h3 class="productCardName">${product.name}</h3>
        ${_buildCardSpecChips(product, defaultSel)}
        <div class="productCardRating">
          ${_renderStars(starRating)}
          <span>${ratingText}</span>
          <span>(${reviewCount})</span>
        </div>
        <div class="productCardPrice">
          <span class="priceCurrent">NT$ ${priceFormatted}</span>
        </div>
        <button class="productCardAddBtn" data-product-id="${product.id}">\u52a0\u5165\u8cfc\u7269\u8eca</button>
      </div>
    </div>
  `;
}

// Render the current product page into the grid.
function _renderGrid() {
  const grid = document.getElementById('productsGrid');
  const countEl = document.getElementById('productCount');
  if (!grid) return;

  const start = (_state.currentPage - 1) * _state.pageSize;
  const paginated = _state.filteredProducts.slice(start, start + _state.pageSize);
  if (countEl) countEl.textContent = `\u5171 ${_state.filteredProducts.length} \u4ef6\u5546\u54c1`;

  if (_state.filteredProducts.length === 0) {
    grid.innerHTML = `
      <div class="emptyState productGridEmptyState">
        <span class="emptyState-icon">!</span>
        <p class="emptyState-title">\u6c92\u6709\u7b26\u5408\u689d\u4ef6\u7684\u5546\u54c1</p>
        <p class="emptyState-desc">\u8abf\u6574\u7be9\u9078\u689d\u4ef6\u5f8c\u518d\u8a66\u4e00\u6b21</p>
        <button class="btn btnOutline productFilterResetAction" onclick="_resetAllFilters()">\u6e05\u9664\u7be9\u9078</button>
      </div>
    `;
    _renderPagination();
    return;
  }

  grid.innerHTML = paginated.map((product) => _buildCard(product)).join('');
  _renderPagination();
  _bindCardEvents();
  // Init after cloneNode in _bindCardEvents / 必須在 cloneNode 之後再初始化 Swiper
  window.initCardGalleries?.(document.getElementById('productsGrid') || document);
}

// Return pagination item descriptors for the current page window.
function _getPaginationItems(totalPages) {
  const range = 2;
  const items = [];
  for (let page = 1; page <= totalPages; page += 1) {
    const isEdge = page === 1 || page === totalPages;
    const isNearCurrent = page >= _state.currentPage - range && page <= _state.currentPage + range;
    const isGapEdge = page === _state.currentPage - range - 1 || page === _state.currentPage + range + 1;
    if (isEdge || isNearCurrent) items.push({ type: 'page', page });
    else if (isGapEdge) items.push({ type: 'ellipsis' });
  }
  return items;
}

// Build a single pagination button.
function _buildPaginationButton(page, label, options = {}) {
  const selectedClass = options.isSelected ? ' isSelected' : '';
  const disabled = options.disabled ? ' disabled' : '';
  const current = options.isSelected ? ' aria-current="page"' : '';
  return `<button class="paginationBtn${selectedClass}" data-page="${page}" aria-label="${options.ariaLabel || label}"${current}${disabled}>${label}</button>`;
}

// Render pagination controls for the filtered product list.
function _renderPagination() {
  const paginationEl = document.getElementById('pagination');
  if (!paginationEl) return;

  const totalPages = Math.ceil(_state.filteredProducts.length / _state.pageSize);
  paginationEl.hidden = totalPages <= 1;
  if (totalPages <= 1) {
    paginationEl.innerHTML = '';
    return;
  }

  const pageItems = _getPaginationItems(totalPages).map((item) => {
    if (item.type === 'ellipsis') return '<span class="paginationEllipsis">...</span>';
    return _buildPaginationButton(item.page, item.page, {
      isSelected: item.page === _state.currentPage,
      ariaLabel: `? ${item.page} ?`,
    });
  });

  paginationEl.innerHTML = [
    _buildPaginationButton(_state.currentPage - 1, '\u2039', {
      disabled: _state.currentPage === 1,
      ariaLabel: '\u4e0a\u4e00\u9801',
    }),
    ...pageItems,
    _buildPaginationButton(_state.currentPage + 1, '\u203a', {
      disabled: _state.currentPage === totalPages,
      ariaLabel: '\u4e0a\u4e00\u9801',
    }),
  ].join('');

  paginationEl.querySelectorAll('.paginationBtn:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => _goToPage(parseInt(btn.dataset.page, 10)));
  });
}

// Navigate to a product list page and keep the viewport near the top.
function _goToPage(page) {
  const totalPages = Math.ceil(_state.filteredProducts.length / _state.pageSize);
  if (page < 1 || page > totalPages) return;
  _state.currentPage = page;
  _renderGrid();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Apply category, brand, price, tag, and sorting rules.
function _filterBySelectedOptions(products) {
  const filters = _state.filters;
  const keyword = filters.keyword.trim().toLowerCase();
  return products.filter((product) => {
    const searchableText = [
      product.name,
      product.brand,
      product.category,
      product.description,
      ...(Array.isArray(product.tags) ? product.tags : []),
      ...(Array.isArray(product.interestTags) ? product.interestTags : []),
    ]
      .join(' ')
      .toLowerCase();
    const matchKeyword = !keyword || searchableText.includes(keyword);
    const matchCategory = !filters.category || product.category === filters.category;
    const matchBrand = filters.brands.length === 0 || filters.brands.includes(product.brand);
    const matchMin = filters.minPrice === null || product.price >= filters.minPrice;
    const matchMax = filters.maxPrice === null || product.price <= filters.maxPrice;
    const matchTag = !filters.tag
      || (filters.tag === 'new' ? product.isNew : product.isBestseller);
    return matchKeyword && matchCategory && matchBrand && matchMin && matchMax && matchTag;
  });
}

// Sort products by the selected sort option.
function _sortProducts(products) {
  const sorted = [...products];
  const sorters = {
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    rating: (a, b) => b.rating - a.rating,
    reviews: (a, b) => (b.reviewCount ?? b.reviews ?? 0) - (a.reviewCount ?? a.reviews ?? 0),
  };
  if (sorters[_state.sortBy]) {
    sorted.sort(sorters[_state.sortBy]);
  } else if (_state.filters.tag === 'new') {
    sorted.sort((a, b) => a.newRank - b.newRank);
  } else if (_state.filters.tag === 'bestseller') {
    sorted.sort((a, b) => a.bestsellerRank - b.bestsellerRank);
  }
  return sorted;
}

// Apply all current filters and refresh the grid.
function _applyFilters() {
  _state.filteredProducts = _sortProducts(_filterBySelectedOptions(_state.allProducts));
  _state.currentPage = 1;
  _renderGrid();
}

// Reset all filters and synced filter controls.
window._resetAllFilters = function () {
  _state.filters = { category: '', brands: [], minPrice: null, maxPrice: null, tag: '', keyword: '' };
  document
    .querySelectorAll('.filterCategoryBtn')
    .forEach((btn) => btn.classList.toggle('isSelected', btn.dataset.category === ''));
  document.querySelectorAll('.filterBrandList input[type="checkbox"]').forEach((input) => {
    input.checked = false;
  });
  document.querySelectorAll('#priceMin, #mobilePriceMin, #priceMax, #mobilePriceMax').forEach((input) => {
    input.value = '';
  });
  document.querySelectorAll('[data-tag]').forEach((btn) => btn.classList.remove('isSelected'));
  _applyFilters();
};

// Render and bind category filter buttons for desktop and mobile lists.
function _bindCategoryFilterList(listId, categories) {
  const list = document.getElementById(listId);
  if (!list) return;

  list.innerHTML = categories
    .map((category) => {
      const value = category === '\u5168\u90e8' ? '' : category;
      return `<li><button class="filterCategoryBtn${value === '' ? ' isSelected' : ''}" data-category="${value}">${category}</button></li>`;
    })
    .join('');

  list.querySelectorAll('.filterCategoryBtn').forEach((btn) => {
    btn.addEventListener('click', () => {
      _state.filters.category = btn.dataset.category;
      _syncCategoryFilters(btn.dataset.category);
      if (listId === 'categoryFilterList') _applyFilters();
    });
  });
}

// Render and bind brand checkboxes for desktop and mobile lists.
function _bindBrandFilterList(listId, brands) {
  const list = document.getElementById(listId);
  if (!list) return;

  list.innerHTML = brands
    .map(
      (brand) => `
    <li class="filterBrandItem">
      <input type="checkbox" id="${listId}-${brand}" name="brand" value="${brand}" aria-label="${brand}">
      <label for="${listId}-${brand}">${brand}</label>
    </li>
  `
    )
    .join('');

  if (listId !== 'brandFilterList') return;
  list.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.addEventListener('change', () => {
      _state.filters.brands = Array.from(list.querySelectorAll('input:checked')).map((el) => el.value);
      _applyFilters();
    });
  });
}

// Bind desktop price controls and reset action.
function _bindDesktopPriceFilter() {
  document.getElementById('applyPriceBtn')?.addEventListener('click', () => {
    const minVal = parseFloat(document.getElementById('priceMin')?.value);
    const maxVal = parseFloat(document.getElementById('priceMax')?.value);
    _state.filters.minPrice = Number.isNaN(minVal) ? null : minVal;
    _state.filters.maxPrice = Number.isNaN(maxVal) ? null : maxVal;
    _applyFilters();
  });
  document.getElementById('resetFiltersBtn')?.addEventListener('click', window._resetAllFilters);
}

// Bind quick filter buttons for new and best seller products.
function _bindQuickFilterButtons() {
  const buttons = [
    { el: document.getElementById('filterNewBtn'), tag: 'new' },
    { el: document.getElementById('filterBestBtn'), tag: 'bestseller' },
  ];

  buttons.forEach(({ el, tag }) => {
    if (!el) return;
    el.addEventListener('click', () => {
      const isActive = _state.filters.tag !== tag;
      _state.filters.tag = isActive ? tag : '';
      buttons.forEach((item) => item.el?.classList.toggle('isSelected', item.tag === _state.filters.tag));
      _applyFilters();
    });
  });
}

// Initialize desktop and shared filter controls.
function _initSidebarFilters() {
  const categories = ['\u5168\u90e8', ...new Set(_state.allProducts.map((product) => product.category))];
  const brands = [...new Set(_state.allProducts.map((product) => product.brand))].sort();
  ['categoryFilterList', 'mobileCategoryFilterList'].forEach((id) => _bindCategoryFilterList(id, categories));
  ['brandFilterList', 'mobileBrandFilterList'].forEach((id) => _bindBrandFilterList(id, brands));
  _bindDesktopPriceFilter();
  _bindQuickFilterButtons();
}

// Sync category selection between desktop and mobile lists.
function _syncCategoryFilters(category) {
  ['categoryFilterList', 'mobileCategoryFilterList'].forEach((listId) => {
    const list = document.getElementById(listId);
    if (!list) return;
    list.querySelectorAll('.filterCategoryBtn').forEach((btn) => {
      btn.classList.toggle('isSelected', btn.dataset.category === category);
    });
  });
}

// Toggle the mobile filter sheet and backdrop.
function _setFilterSheetOpen(isOpen) {
  const sheet = document.getElementById('filterSheet');
  const backdrop = document.getElementById('filterSheetBackdrop');
  sheet?.classList.toggle('isOpen', isOpen);
  backdrop?.classList.toggle('isOpen', isOpen);
  document.body.classList.toggle('filterSheetLocked', isOpen);
}

// Apply mobile-only brand and price inputs before refreshing the grid.
function _applyMobileFilters() {
  _state.filters.brands = Array.from(document.querySelectorAll('#mobileBrandFilterList input:checked')).map(
    (el) => el.value
  );
  const mobileMin = parseFloat(document.getElementById('mobilePriceMin')?.value);
  const mobileMax = parseFloat(document.getElementById('mobilePriceMax')?.value);
  _state.filters.minPrice = Number.isNaN(mobileMin) ? null : mobileMin;
  _state.filters.maxPrice = Number.isNaN(mobileMax) ? null : mobileMax;
  _setFilterSheetOpen(false);
  _applyFilters();
}

// Initialize mobile bottom sheet controls.
function _initMobileFilterSheet() {
  if (!document.getElementById('mobileFilterBtn') || !document.getElementById('filterSheet')) return;
  document.getElementById('mobileFilterBtn').addEventListener('click', () => _setFilterSheetOpen(true));
  document.getElementById('filterSheetClose')?.addEventListener('click', () => _setFilterSheetOpen(false));
  document.getElementById('filterSheetBackdrop')?.addEventListener('click', () => _setFilterSheetOpen(false));
  document.getElementById('mobileApplyBtn')?.addEventListener('click', _applyMobileFilters);
  document.getElementById('mobileResetBtn')?.addEventListener('click', () => {
    window._resetAllFilters();
    _setFilterSheetOpen(false);
  });
}

// Initialize sort dropdown.
function _initSortSelect() {
  const select = document.getElementById('sortSelect');
  if (!select) return;
  select.addEventListener('change', () => {
    _state.sortBy = select.value;
    _applyFilters();
  });
}

// Apply URL query params such as ?filter=new or ?keyword=帳篷.
function _handleUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const filter = params.get('filter');
  const keyword = params.get('keyword');

  if (keyword) _state.filters.keyword = keyword.trim();
  if (['new', 'bestseller'].includes(filter)) {
    _state.filters.tag = filter;
    const btn = document.getElementById(filter === 'new' ? 'filterNewBtn' : 'filterBestBtn');
    btn?.classList.add('isSelected');
  }
}

// Bind click events on product cards through a cloned grid to avoid duplicate listeners.
function _bindCardEvents() {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  const newGrid = grid.cloneNode(true);
  grid.parentNode.replaceChild(newGrid, grid);
  newGrid.addEventListener('click', async (event) => {
    // Gallery nav / lightbox should not open product detail / 切圖或放大時不要進詳情
    if (window.isCardGalleryInteractiveTarget?.(event.target)) {
      event.stopPropagation();
      return;
    }

    const specChip = event.target.closest('.productCardSpecChip');
    if (specChip) {
      event.stopPropagation();
      const card = specChip.closest('.productCard');
      const group = specChip.closest('.productCardSpecGroup');
      if (!card || !group) return;
      group.querySelectorAll('.productCardSpecChip').forEach((chip) => chip.classList.remove('isSelected'));
      specChip.classList.add('isSelected');
      const type = specChip.dataset.specType;
      if (type === 'color') card.dataset.selectedColor = specChip.dataset.specValue || '';
      if (type === 'size') card.dataset.selectedSize = specChip.dataset.specValue || '';
      const product = _state.allProducts.find((item) => item.id === card.dataset.productId);
      if (product && window.findProductVariant) {
        const specs = _readCardSpecSelection(card);
        const variant = window.findProductVariant(product, specs.color, specs.size);
        const label = window.buildVariantLabel ? window.buildVariantLabel(variant) : '';
        const colors = product.colors || [];
        const sizes = product.sizes || [];
        const hasMultipleSpecs = colors.length > 1 || sizes.length > 1;
        let preview = card.querySelector('.productCardSpecPreview');
        if (hasMultipleSpecs) {
          if (!preview && label) {
            preview = document.createElement('p');
            preview.className = 'productCardSpecPreview';
            card.querySelector('.productCardSpecs')?.appendChild(preview);
          }
          if (preview) preview.textContent = label;
        } else if (preview) {
          preview.remove();
        }
      }
      return;
    }

    if (event.target.classList.contains('productCardAddBtn')) {
      event.stopPropagation();
      const card = event.target.closest('.productCard');
      await _handleAddToCart(event.target.dataset.productId, card);
      return;
    }
    const card = event.target.closest('.productCard');
    if (card) window.location.href = `product-detail.html?id=${card.dataset.productId}`;
  });
}

// Add the selected product to cart and animate the cart badge.
async function _handleAddToCart(productId, cardEl) {
  try {
    const product = _state.allProducts.find((item) => item.id === productId);
    if (!product) return;

    const specs = cardEl ? _readCardSpecSelection(cardEl) : { color: '', size: '' };
    const variant = window.findProductVariant
      ? window.findProductVariant(product, specs.color, specs.size)
      : window.getProductVariants(product)[0];
    const line = window.buildCartLineFromProduct
      ? window.buildCartLineFromProduct(product, variant)
      : { id: product.id, name: product.name, price: product.price, image: product.image, brand: product.brand };

    window.addToCart(line, 1);

    const badge = document.querySelector('.cartBadge');
    if (badge) {
      badge.classList.add('badgeBounce');
      setTimeout(() => badge.classList.remove('badgeBounce'), 600);
    }
  } catch (error) {
    console.error('Failed to add product to cart', error);
    window.showToast?.(
      '\u52a0\u5165\u8cfc\u7269\u8eca\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66',
      'error'
    );
  }
}

/** Resolve product image for carousel / 推薦輪播圖路徑解析 */
function _resolveProductImageSrc(product) {
  const raw = product?.image || '';
  if (!raw) return '';
  return raw;
}

// Build one ad carousel slide.
function _buildAdCarouselSlide(product) {
  const badge = product.interestTags?.length ? '推薦' : '';
  const imageSrc = _resolveProductImageSrc(product);
  return `
    <div class="adCarouselSlide" data-product-id="${product.id}">
      <div class="adCarouselContent">
        <span class="adCarouselBadge">${badge}</span>
        <h3 class="adCarouselTitle">${product.name}</h3>
        <p class="adCarouselDesc">${product.brand}</p>
        <p class="adCarouselPrice">NT$ ${product.price.toLocaleString('zh-TW')}</p>
      </div>
      <img src="${imageSrc}" alt="${product.name}" class="adCarouselImage" loading="lazy" onerror="this.src='https://placehold.co/200x200/f2f2f2/999?text=Image'">
    </div>
  `;
}

// Render carousel slides and dot controls.
function _renderAdCarouselMarkup(products) {
  const loopProducts =
    products.length > 1 ? [products[products.length - 1], ...products, products[0]] : products;
  document.getElementById('adCarouselSlides').innerHTML = loopProducts.map(_buildAdCarouselSlide).join('');
  document.getElementById('adCarouselDots').innerHTML = products
    .map(
      (_, index) =>
        `<button class="adCarouselDot${index === 0 ? ' isSelected' : ''}" data-slide="${index}" aria-label="\u7b2c ${index + 1} \u500b\u63a8\u85a6\u5546\u54c1"></button>`
    )
    .join('');
}

// Preload carousel images so cloned edge slides are ready before the first loop.
function _preloadAdCarouselImages(products) {
  products.forEach((product) => {
    const src = _resolveProductImageSrc(product);
    if (!src) return;
    const image = new Image();
    image.src = src;
  });
}

// Bind carousel navigation, dots, product links, and auto rotation.
function _bindAdCarouselControls(products) {
  _cleanupAdCarousel();
  _adCarouselAbortController = new AbortController();
  const { signal } = _adCarouselAbortController;

  let currentSlide = products.length > 1 ? 1 : 0;
  let isAnimating = false;
  const slidesContainer = document.getElementById('adCarouselSlides');
  const isLooping = products.length > 1;
  const firstRealSlide = 1;
  const lastRealSlide = products.length;
  const firstCloneSlide = products.length + 1;
  const lastCloneSlide = 0;

  const getWrappedIndex = (index) => ((index % products.length) + products.length) % products.length;

  const clearTransitionFallback = () => {
    if (!_adCarouselTransitionFallback) return;
    clearTimeout(_adCarouselTransitionFallback);
    _adCarouselTransitionFallback = null;
  };

  const updateDots = () => {
    const visibleIndex = isLooping ? getWrappedIndex(currentSlide - 1) : 0;
    document.querySelectorAll('.adCarouselDot').forEach((dot, index) => {
      dot.classList.toggle('isSelected', index === visibleIndex);
    });
  };

  const setRenderedSlide = (nextIndex, shouldAnimate = true) => {
    currentSlide = isLooping ? nextIndex : 0;
    slidesContainer.classList.toggle('isResetting', !shouldAnimate);
    slidesContainer.style.transform = `translateX(${-currentSlide * 100}%)`;
    updateDots();
  };

  const completeLoopReset = (realSlideIndex) => {
    currentSlide = realSlideIndex;
    slidesContainer.classList.add('isResetting');
    slidesContainer.style.transform = `translateX(${-currentSlide * 100}%)`;
    // 強制瀏覽器在下一幀前套用無動畫重定位，避免 reset 被使用者看到。
    slidesContainer.offsetHeight;
    requestAnimationFrame(() => slidesContainer.classList.remove('isResetting'));
    updateDots();
  };

  const finishAnimation = () => {
    clearTransitionFallback();
    isAnimating = false;
    if (!isLooping) return;
    if (currentSlide === firstCloneSlide) {
      completeLoopReset(firstRealSlide);
      return;
    }
    if (currentSlide === lastCloneSlide) completeLoopReset(lastRealSlide);
  };

  const animateToSlide = (nextIndex) => {
    if (!isLooping || isAnimating) return;
    clearTransitionFallback();
    isAnimating = true;
    setRenderedSlide(nextIndex);
    _adCarouselTransitionFallback = setTimeout(() => {
      if (!isAnimating) return;
      finishAnimation();
    }, 550);
  };

  const goToSlide = (realIndex) => {
    if (!isLooping) {
      currentSlide = 0;
      setRenderedSlide(0);
      return;
    }
    const targetSlide = getWrappedIndex(realIndex);
    if (targetSlide === getWrappedIndex(currentSlide - 1)) return;
    animateToSlide(targetSlide + 1);
  };

  const goToNextSlide = () => {
    animateToSlide(currentSlide + 1);
  };

  const goToPrevSlide = () => {
    animateToSlide(currentSlide - 1);
  };

  const completeSlideTransition = (event) => {
    if (event.target !== slidesContainer || event.propertyName !== 'transform' || !isLooping) return;
    finishAnimation();
  };

  const initializeSlidePosition = () => {
    isAnimating = false;
    _preloadAdCarouselImages(products);
    setRenderedSlide(currentSlide, false);
    requestAnimationFrame(() => slidesContainer.classList.remove('isResetting'));
  };

  document.getElementById('adCarouselPrev')?.addEventListener('click', goToPrevSlide, { signal });
  document.getElementById('adCarouselNext')?.addEventListener('click', goToNextSlide, { signal });
  document.querySelectorAll('.adCarouselDot').forEach((dot) => {
    dot.addEventListener('click', () => goToSlide(parseInt(dot.dataset.slide, 10)), { signal });
  });
  slidesContainer.addEventListener(
    'click',
    (event) => {
      const slide = event.target.closest('.adCarouselSlide');
      if (slide) window.location.href = `product-detail.html?id=${slide.dataset.productId}`;
    },
    { signal }
  );
  slidesContainer.addEventListener('transitionend', completeSlideTransition, { signal });

  if (_adCarouselTimer) clearInterval(_adCarouselTimer);
  _adCarouselTimer = isLooping ? setInterval(goToNextSlide, 5000) : null;
  initializeSlidePosition();
}

// Initialize personalized ad carousel by saved preferences.
function _initAdCarousel() {
  const slidesContainer = document.getElementById('adCarouselSlides');
  const dotsContainer = document.getElementById('adCarouselDots');
  const container = document.querySelector('.adCarouselContainer');
  if (!slidesContainer || !dotsContainer) return;

  const products = _selectAdCarouselProducts();
  container.hidden = products.length === 0;
  if (products.length === 0) {
    _cleanupAdCarousel();
    slidesContainer.innerHTML = '';
    dotsContainer.innerHTML = '';
    return;
  }

  _renderAdCarouselMarkup(products);
  _bindAdCarouselControls(products);
}

// Rebuild the ad carousel when the shared header survey updates preferences.
function _initAdCarouselPreferenceListener() {
  if (window.__productInterestCarouselBound) return;
  window.__productInterestCarouselBound = true;
  window.addEventListener('yurui:preferences-updated', _initAdCarousel);
}

// Product list page init entry point.
window.initProductListPage = async () => {
  try {
    window.initNavbar?.();
    window.initModalListeners?.();
    window.initPersonalizationModal?.();
    window.initCartListeners?.();
    window._appComponentsInitialized = true;

    // 一般清單負責完整商品資料；新品與熱銷端點提供後端認定的分類名單。
    const [allProducts, newestProducts, bestsellerProducts] = await Promise.all([
      window.API.products.getAll(),
      window.API.products.getNewest(100),
      window.API.products.getBestsellers(100),
    ]);
    _state.allProducts = _annotateProductLabels(
      allProducts,
      newestProducts,
      bestsellerProducts
    );
    _handleUrlParams();
    _initSidebarFilters();
    _initMobileFilterSheet();
    _initSortSelect();
    _applyFilters();
    _initAdCarousel();
    _initAdCarouselPreferenceListener();
  } catch (error) {
    console.error('Product list failed to initialize', error);
    const grid = document.getElementById('productsGrid');
    if (grid) {
      grid.innerHTML = `
        <div class="emptyState productGridEmptyState">
          <span class="emptyState-icon">!</span>
          <p class="emptyState-title">\u5546\u54c1\u8f09\u5165\u5931\u6557</p>
          <p class="emptyState-desc">\u91cd\u65b0\u6574\u7406\u9801\u9762\uff0c\u6216\u7a0d\u5f8c\u518d\u8a66</p>
        </div>
      `;
    }
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.initProductListPage);
} else {
  window.initProductListPage();
}
