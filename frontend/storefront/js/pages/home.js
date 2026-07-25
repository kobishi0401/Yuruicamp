// ========================================
// 首頁邏輯 (Home Page)
// 最新 12 / 熱銷 20 / 品牌跑馬燈
// ========================================

/** 首頁已載入商品快取，供規格 chip 切換時查 variant / Cache for spec chip preview */
let _homeProductsById = {};

function _renderStars(rating) {
  const normalizedRating = Math.max(0, Math.min(5, Number(rating) || 0));
  const ratingClass = `starRatingValue${Math.round(normalizedRating * 10)}`;
  const stars = '<span class="starIcon">★</span>'.repeat(5);

  return `
    <span class="starRating ${ratingClass}" aria-label="${normalizedRating.toFixed(1)} 顆星">
      <span class="starRatingBase" aria-hidden="true">${stars}</span>
      <span class="starRatingFill" aria-hidden="true">${stars}</span>
    </span>
  `;
}

function _buildHomeCardSpecChips(product, defaultSel) {
  const colors = product.colors || [];
  const sizes = product.sizes || [];
  const parts = [];

  if (colors.length) {
    parts.push(`
      <div class="homeProductSpecGroup" data-spec-type="color">
        ${colors.map((value) => {
          const active = value === defaultSel.color ? ' isSelected' : '';
          return `<button type="button" class="homeProductSpecChip${active}" data-spec-type="color" data-spec-value="${value}">${value}</button>`;
        }).join('')}
      </div>
    `);
  }
  if (sizes.length) {
    parts.push(`
      <div class="homeProductSpecGroup" data-spec-type="size">
        ${sizes.map((value) => {
          const active = value === defaultSel.size ? ' isSelected' : '';
          return `<button type="button" class="homeProductSpecChip${active}" data-spec-type="size" data-spec-value="${value}">${value}</button>`;
        }).join('')}
      </div>
    `);
  }

  // 多規格時才顯示 preview，避免單一規格與 chip 重複 / Preview only when multiple spec options
  const hasMultipleSpecs = colors.length > 1 || sizes.length > 1;
  const preview = hasMultipleSpecs && defaultSel.specLabel
    ? `<p class="homeProductSpecPreview">${defaultSel.specLabel}</p>`
    : '';
  // Always render the specs wrapper (even if empty) so CSS min-height keeps cards equal.
  // 一律輸出規格容器（即使沒有 chip），CSS 才能用固定高度讓卡片對齊。
  return `<div class="homeProductSpecs">${parts.join('')}${preview}</div>`;
}

function _readHomeCardSpecSelection(card) {
  return {
    color: card.dataset.selectedColor || '',
    size: card.dataset.selectedSize || '',
  };
}

function _buildProductCard(product, badgeType = '') {
  const priceFormatted = product.price.toLocaleString('zh-TW');
  const reviewCount = product.reviewCount ?? product.reviews ?? 0;
  const starRating = Number(product.rating) || 0;
  const ratingText = product.ratingDisplay ?? starRating.toFixed(1);
  const defaultSel = window.getDefaultCardSpecSelection
    ? window.getDefaultCardSpecSelection(product)
    : { color: '', size: '', specLabel: '' };

  return `
    <article
      class="homeProductCard"
      data-product-id="${product.id}"
      data-selected-color="${defaultSel.color}"
      data-selected-size="${defaultSel.size}"
      tabindex="0"
      aria-label="查看 ${product.name} 商品詳情"
    >
      ${_buildProductImage(product, badgeType)}
      <div class="homeProductBody">
        <p class="homeProductBrand">${product.brand}</p>
        <h3 class="homeProductName">${product.name}</h3>
        ${_buildHomeCardSpecChips(product, defaultSel)}
        <div class="homeProductRating">
          ${_renderStars(starRating)}
          <span>${ratingText}</span>
          <span>(${reviewCount})</span>
        </div>
        <div class="homeProductPrice">
          <span class="homeProductPriceCurrent">NT$ ${priceFormatted}</span>
        </div>
        <button class="homeProductAddButton" data-product-id="${product.id}">
          加入購物車
        </button>
      </div>
    </article>
  `;
}

function _buildProductImage(product, badgeType) {
  const images = window.getItemImages ? window.getItemImages(product) : [product.image].filter(Boolean);
  const badgeHtml = _buildProductBadge(badgeType);

  if (window.buildCardGalleryHtml) {
    return window.buildCardGalleryHtml({
      images,
      alt: product.name,
      galleryId: `home-product-${product.id}`,
      wrapClass: 'homeProductImage',
      badgeHtml,
      fallbackSrc: 'https://placehold.co/400x300/f2f2f2/999?text=圖片載入中',
    });
  }

  const imageSrc =
    product.image;

  return `
    <div class="homeProductImage">
      <img
        src="${imageSrc}"
        alt="${product.name}"
        loading="lazy"
        onerror="this.src='https://placehold.co/400x300/f2f2f2/999?text=圖片載入中'"
      >
      ${badgeHtml}
    </div>
  `;
}

function _buildProductBadge(badgeType) {
  if (badgeType === 'new') {
    return '<span class="productCardBadge productBadgeNew">NEW</span>';
  }
  if (badgeType === 'hot') {
    return '<span class="productCardBadge productBadgeHot">熱銷</span>';
  }
  return '';
}

function _renderProducts(products, container, badgeType = '') {
  if (!container) return;

  if (products.length === 0) {
    container.innerHTML = `
      <div class="homeEmptyState">
        <span class="homeEmptyStateIcon" aria-hidden="true">🏕️</span>
        <p class="homeEmptyStateTitle">目前沒有商品</p>
      </div>
    `;
    return;
  }

  container.innerHTML = products.map((p) => _buildProductCard(p, badgeType)).join('');
}

async function _initBrandMarquee() {
  const track = document.querySelector('.brandMarqueeTrack');
  if (!track || !window.API?.marketing?.getBrands) return;

  const renderStatus = (message) => {
    const status = document.createElement('div');
    status.className = 'brandLogoItem brandLogoItemStatus';
    status.textContent = message;
    track.replaceChildren(status);
  };

  const renderBrands = (brands) => {
    const fragment = document.createDocumentFragment();

    // 兩組相同品牌首尾相接，第二組只供動畫銜接並從輔助技術隱藏。
    [false, true].forEach((isDuplicate) => {
      brands.forEach((brand) => {
        const item = document.createElement('div');
        item.className = 'brandLogoItem';
        item.textContent = brand.name || brand.id;
        if (isDuplicate) item.setAttribute('aria-hidden', 'true');
        fragment.appendChild(item);
      });
    });

    track.replaceChildren(fragment);
  };

  try {
    const brands = await window.API.marketing.getBrands();
    if (!Array.isArray(brands) || brands.length === 0) {
      renderStatus('合作品牌資料更新中');
      return;
    }

    renderBrands(brands);
  } catch (error) {
    console.warn('品牌跑馬燈載入失敗', error);
    renderStatus('合作品牌暫時無法載入');
  }
}

async function _initProductSections() {
  const newRow = document.getElementById('newProductsRow');
  const bestsellerRow = document.getElementById('bestsellerProductsRow');

  if (!newRow && !bestsellerRow) return;

  try {
    const [newProducts, bestsellerProducts] = await Promise.all([
      window.API.products.getNewest(12),
      window.API.products.getBestsellers(20),
    ]);

    _homeProductsById = {};
    [...newProducts, ...bestsellerProducts].forEach((p) => {
      _homeProductsById[p.id] = p;
    });

    _renderProducts(newProducts, newRow, 'new');
    _renderProducts(bestsellerProducts.slice(0, 6), bestsellerRow, 'hot');
    // Re-init lightbox once after both rows are filled / 兩列都渲染完再統一綁定燈箱
    window.initCardGalleries?.(document);
    _bindCardEvents();
  } catch (error) {
    console.error('商品載入失敗 | Failed to load products:', error);
    if (newRow) newRow.innerHTML = '<p class="homeProductLoadError">商品載入失敗，請重新整理頁面</p>';
    if (bestsellerRow) bestsellerRow.innerHTML = '<p class="homeProductLoadError">商品載入失敗，請重新整理頁面</p>';
  }
}

function _bindCardEvents() {
  ['newProductsRow', 'bestsellerProductsRow'].forEach((rowId) => {
    const row = document.getElementById(rowId);
    if (!row) return;

    row.addEventListener('click', async (e) => {
      // Gallery nav / lightbox should not open product detail / 切圖或放大時不要進詳情
      if (window.isCardGalleryInteractiveTarget?.(e.target)) {
        e.stopPropagation();
        return;
      }

      const specChip = e.target.closest('.homeProductSpecChip');
      if (specChip) {
        e.stopPropagation();
        const card = specChip.closest('.homeProductCard');
        const group = specChip.closest('.homeProductSpecGroup');
        if (!card || !group) return;
        group.querySelectorAll('.homeProductSpecChip').forEach((chip) => chip.classList.remove('isSelected'));
        specChip.classList.add('isSelected');
        const type = specChip.dataset.specType;
        if (type === 'color') card.dataset.selectedColor = specChip.dataset.specValue || '';
        if (type === 'size') card.dataset.selectedSize = specChip.dataset.specValue || '';
        const product = _homeProductsById[card.dataset.productId];
        if (product && window.findProductVariant) {
          const specs = _readHomeCardSpecSelection(card);
          const variant = window.findProductVariant(product, specs.color, specs.size);
          const label = window.buildVariantLabel ? window.buildVariantLabel(variant) : '';
          const colors = product.colors || [];
          const sizes = product.sizes || [];
          const hasMultipleSpecs = colors.length > 1 || sizes.length > 1;
          let preview = card.querySelector('.homeProductSpecPreview');
          if (hasMultipleSpecs) {
            if (!preview && label) {
              preview = document.createElement('p');
              preview.className = 'homeProductSpecPreview';
              card.querySelector('.homeProductSpecs')?.appendChild(preview);
            }
            if (preview) preview.textContent = label;
          } else if (preview) {
            preview.remove();
          }
        }
        return;
      }

      if (e.target.classList.contains('homeProductAddButton')) {
        e.stopPropagation();
        const card = e.target.closest('.homeProductCard');
        await _handleAddToCart(e.target.dataset.productId, card);
        return;
      }
      const card = e.target.closest('.homeProductCard');
      if (card) _goToProductDetail(card.dataset.productId);
    });

    row.addEventListener('keydown', (e) => {
      const card = e.target.closest('.homeProductCard');
      if (!card || e.target.classList.contains('homeProductAddButton')) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      _goToProductDetail(card.dataset.productId);
    });
  });
}

function _goToProductDetail(productId) {
  window.location.href = `product-detail.html?id=${productId}`;
}

async function _handleAddToCart(productId, cardEl) {
  try {
    const product = await window.API.products.getById(productId);
    const specs = cardEl ? _readHomeCardSpecSelection(cardEl) : { color: '', size: '' };
    const variant = window.findProductVariant
      ? window.findProductVariant(product, specs.color, specs.size)
      : window.getProductVariants(product)[0];
    window.addToCart(window.buildCartLineFromProduct(product, variant), 1);

    const badge = document.querySelector('.cartBadge');
    if (badge) {
      badge.classList.add('badgeBounce');
      setTimeout(() => badge.classList.remove('badgeBounce'), 600);
    }
  } catch (error) {
    console.error('加入購物車失敗:', error);
    window.showToast('加入失敗，請稍後再試', 'error');
  }
}

window.initHomePage = async () => {
  await Promise.all([_initBrandMarquee(), _initProductSections()]);
};

console.log('✓ home.js 已載入');
