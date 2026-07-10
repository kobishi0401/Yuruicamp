// ========================================
// 首頁邏輯 (Home Page)
// 步驟 4.1 ~ 4.4
// ========================================

// ----------------------------------------
// 工具函數：計算折扣百分比
// Calculate discount percentage
// @param {number} original - 原價
// @param {number} current  - 現價
// @returns {string} e.g. "-25%"
// ----------------------------------------
function _calcDiscount(original, current) {
  if (!original || original <= current) return '';
  return `-${Math.round((1 - current / original) * 100)}%`;
}

// ----------------------------------------
// 工具函數：渲染星星評分
// Render star rating HTML
// @param {number} rating - 評分（0~5）
// @returns {string} HTML 字串
// ----------------------------------------
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

// ----------------------------------------
// 工具函數：產生商品卡片 HTML
// Generate product card HTML
// @param {Object} product - 商品資料
// @param {string} badgeType - 'new' | 'hot' | ''（標籤類型）
// @returns {string} HTML 字串
// ----------------------------------------
function _buildProductCard(product, badgeType = '') {
  const discount = _calcDiscount(product.originalPrice, product.price);
  const priceFormatted    = product.price.toLocaleString('zh-TW');
  const origPriceFormatted = product.originalPrice
    ? product.originalPrice.toLocaleString('zh-TW')
    : null;

  return `
    <article
      class="homeProductCard"
      data-product-id="${product.id}"
      tabindex="0"
      aria-label="查看 ${product.name} 商品詳情"
    >
      ${_buildProductImage(product, badgeType)}
      ${_buildProductInfo(product, priceFormatted, origPriceFormatted, discount)}
    </article>
  `;
}

// ----------------------------------------
// 產生首頁商品圖片區塊
// Build image block used by HomePage product cards
// @param {Object} product - 商品資料
// @param {string} badgeType - 'new' | 'hot' | ''
// @returns {string} HTML 字串
// ----------------------------------------
function _buildProductImage(product, badgeType) {
  return `
    <div class="homeProductImage">
      <img
        src="${product.image}"
        alt="${product.name}"
        loading="lazy"
        onerror="this.src='https://placehold.co/400x300/f2f2f2/999?text=圖片載入中'"
      >
      ${_buildProductBadge(badgeType)}
    </div>
  `;
}

// ----------------------------------------
// 產生首頁商品標籤
// Build badge used by HomePage product cards
// @param {string} badgeType - 'new' | 'hot' | ''
// @returns {string} HTML 字串
// ----------------------------------------
function _buildProductBadge(badgeType) {
  if (badgeType === 'new') {
    return '<span class="productCardBadge productBadgeNew">NEW</span>';
  }

  if (badgeType === 'hot') {
    return '<span class="productCardBadge productBadgeHot">熱銷</span>';
  }

  return '';
}

// ----------------------------------------
// 產生首頁商品資訊區塊
// Build text and action block used by HomePage product cards
// @param {Object} product - 商品資料
// @param {string} priceFormatted - 格式化售價
// @param {string|null} origPriceFormatted - 格式化原價
// @param {string} discount - 折扣百分比
// @returns {string} HTML 字串
// ----------------------------------------
function _buildProductInfo(product, priceFormatted, origPriceFormatted, discount) {
  return `
    <div class="homeProductBody">
      <p class="homeProductBrand">${product.brand}</p>
      <h3 class="homeProductName">${product.name}</h3>
      <div class="homeProductRating">
        ${_renderStars(product.rating)}
        <span>${product.rating}</span>
        <span>(${product.reviews})</span>
      </div>
      <div class="homeProductPrice">
        <span class="homeProductPriceCurrent">NT$ ${priceFormatted}</span>
        ${origPriceFormatted
          ? `<span class="homeProductPriceOriginal">NT$ ${origPriceFormatted}</span>`
          : ''}
      </div>
      ${discount
        ? `<span class="homeProductDiscount">${discount}</span>`
        : ''}
      <button class="homeProductAddButton" data-product-id="${product.id}">
        加入購物車
      </button>
    </div>
  `;
}

// ----------------------------------------
// 渲染商品列表到指定容器
// Render products into a container element
// @param {Array}       products      - 商品資料陣列
// @param {HTMLElement} container     - 目標容器 DOM
// @param {string}      badgeType     - 'new' | 'hot' | ''
// ----------------------------------------
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

  // 把每張卡片 HTML 拼接後一次寫入 DOM（效能優化）
  container.innerHTML = products.map(p => _buildProductCard(p, badgeType)).join('');
}

// ----------------------------------------
// 步驟 4.3：初始化商品列表（最新 + 熱銷）
// Initialize product sections (new + bestsellers)
// ----------------------------------------
async function _initProductSections() {
  const newRow        = document.getElementById('newProductsRow');
  const bestsellerRow = document.getElementById('bestsellerProductsRow');

  if (!newRow && !bestsellerRow) return;

  try {
    // 從 Mock API 取得所有商品
    // Fetch all products via Mock API
    const allProducts = await window.API.products.getAll();

    // ── 最新商品：isNew = true 的前 6 筆 ──
    const newProducts = allProducts
      .filter(p => p.isNew === true)
      .slice(0, 6);

    // ── 熱銷商品：isBestSeller = true，依評論數排序，前 6 筆 ──
    const bestsellerProducts = allProducts
      .filter(p => p.isBestSeller === true)
      .sort((a, b) => b.reviews - a.reviews)
      .slice(0, 6);

    _renderProducts(newProducts, newRow, 'new');
    _renderProducts(bestsellerProducts, bestsellerRow, 'hot');

    // 綁定商品卡片點擊事件（購物車 + 詳情頁跳轉）
    _bindCardEvents();

  } catch (error) {
    console.error('商品載入失敗 | Failed to load products:', error);

    // 若載入失敗，顯示錯誤提示
    if (newRow) newRow.innerHTML = '<p class="homeProductLoadError">商品載入失敗，請重新整理頁面</p>';
    if (bestsellerRow) bestsellerRow.innerHTML = '<p class="homeProductLoadError">商品載入失敗，請重新整理頁面</p>';
  }
}

// ----------------------------------------
// 綁定商品卡片的點擊事件
// Bind click events on product cards
// ----------------------------------------
function _bindCardEvents() {
  // 使用事件委派（Event Delegation）：只在容器上監聽一次
  // Using event delegation: listen once on the parent

  ['newProductsRow', 'bestsellerProductsRow'].forEach(rowId => {
    const row = document.getElementById(rowId);
    if (!row) return;

    row.addEventListener('click', async (e) => {
      // ① 點擊「加入購物車」底部按鈕
      if (e.target.classList.contains('homeProductAddButton')) {
        const productId = e.target.dataset.productId;
        await _handleAddToCart(productId);
        return;
      }

      // ② 點擊卡片其他區域 → 跳轉商品詳情頁
      const card = e.target.closest('.homeProductCard');
      if (card) {
        _goToProductDetail(card.dataset.productId);
      }
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

// ----------------------------------------
// 導向商品詳情頁
// Navigate to product detail page
// @param {string} productId - 商品 ID
// ----------------------------------------
function _goToProductDetail(productId) {
  window.location.href = `product-detail.html?id=${productId}`;
}

// ----------------------------------------
// 處理加入購物車
// Handle add to cart action
// @param {string} productId - 商品 ID
// ----------------------------------------
async function _handleAddToCart(productId) {
  try {
    // 取得商品資料
    const product = await window.API.products.getById(productId);

    // 呼叫全局購物車功能（定義在 cart.js）
    window.addToCart({
      id:    product.id,
      name:  product.name,
      price: product.price,
      image: product.image,
      brand: product.brand,
    }, 1);

    // 購物車 Badge 動畫效果（透過 CSS class）
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

// ========================================
// 首頁初始化入口
// Home page init entry point
// ========================================
window.initHomePage = async () => {
  console.log('📌 首頁初始化中...');

  
  // 載入商品區塊
  await _initProductSections();

  console.log('✓ 首頁初始化完成');
};


console.log('✓ home.js 已載入');
