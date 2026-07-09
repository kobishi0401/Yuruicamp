// Product detail page state and behavior.
const DEFAULT_PRODUCT_ID = 'P001';
const FREE_SHIPPING_THRESHOLD = 3000;
const MEMBER_REVIEW_KEY = 'member_center_reviews';

// Initialize product detail page after shared scripts are available.
window.initProductDetailPage = async () => {
  const productId = _getProductIdFromUrl();
  _setProductPageState('loading');

  try {
    const product = await window.API.products.getById(productId);
    const reviews = await window.API.products.getReviews(productId);
    _renderProductPage(product, reviews);
    _setProductPageState('ready');
  } catch (error) {
    console.error('Product detail failed to load', error);
    _setProductPageState('error');
  }
};

// Read product id from query string with a stable fallback.
function _getProductIdFromUrl() {
  return new URLSearchParams(window.location.search).get('id') || DEFAULT_PRODUCT_ID;
}

// Toggle loading, error, and content states without inline styles.
function _setProductPageState(state) {
  const loading = document.getElementById('productLoading');
  const error = document.getElementById('productError');
  const content = document.getElementById('productDetailContent');
  if (loading) loading.hidden = state !== 'loading';
  if (error) error.hidden = state !== 'error';
  if (content) content.hidden = state !== 'ready';
}

// Render all product detail sections and bind interactions.
function _renderProductPage(product, reviews = []) {
  _renderProductInfo(product);
  _renderGallery(product);
  _renderSpecOptions(product, 'color');
  _renderSpecOptions(product, 'size');
  _renderSpecTable(product);
  _renderReviews(reviews);
  _renderShippingProgress();
  _initShippingProgressSync();
  _initQtyStepper();
  _initActionButtons(product);
  _initTabSwitching();
  _updatePageMeta(product);
}

// Update title and breadcrumb for the loaded product.
function _updatePageMeta(product) {
  const breadcrumb = document.getElementById('breadcrumbProductName');
  if (breadcrumb) breadcrumb.textContent = product.name;
  document.title = `${product.name} - Yuruicamp`;
}

// Render brand, name, rating, price, description, and tags.
function _renderProductInfo(product) {
  _setText('productBrand', product.brand || '');
  _setText('productName', product.name || '');
  // 商品描述支援 Summernote 輸出的 HTML / Support Summernote rich HTML output
  const descEl = document.getElementById('productDescription');
  if (descEl) descEl.innerHTML = product.description || '';
  _renderPrice(product);
  _renderTags(product.tags || []);
}

// Safely set textContent by id.
function _setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

// Render rating text from static review cards or product data.
function _renderRating(product) {
  const starRating = Number(product.rating) || 0;
  const ratingText = product.ratingDisplay ?? starRating.toFixed(1);
  const reviewCount = product.reviewCount ?? product.reviews ?? 0;
  _setText('productStars', _renderStars(starRating));
  _setText('productRatingNum', ratingText);
  _setText('productReviewCount', `\uff08${reviewCount} \u5247\u8a55\u50f9\uff09`);
}

function _renderPrice(product) {
  _setText('productPrice', window.formatCurrency(product.price));
  _setText('productOriginalPrice', '');
  _setText('productDiscount', '');
  document.getElementById('productOriginalPrice')?.toggleAttribute('hidden', true);
  document.getElementById('productDiscount')?.toggleAttribute('hidden', true);
}

function _renderReviews(reviews) {
  const container = document.getElementById('productReviewsList');
  if (!container) return;
  _updateReviewsTabCount(reviews ? reviews.length : 0);
  if (!reviews || reviews.length === 0) {
    container.innerHTML = '<p class="productReviewEmpty">目前尚無評價</p>';
    return;
  }
  container.innerHTML = reviews.map((review) => `
    <div class="reviewCard">
      <div class="reviewHeader">
        <div class="reviewAvatar">${(review.buyerName || '?').charAt(0)}</div>
        <div>
          <div class="reviewAuthorName">${review.buyerName || '會員'}</div>
          <div class="starStyle">${_renderStars(review.rating)}</div>
        </div>
        <div class="ratingDate">${(review.createdAt || '').slice(0, 10)}</div>
      </div>
      <p class="reviewText">${review.comment || ''}</p>
    </div>
  `).join('');
}

/** 更新 Tab 上的評價數量（依 API 實際筆數）/ Update review count on tab label */
function _updateReviewsTabCount(count) {
  const el = document.getElementById('productReviewsTabCount');
  if (el) el.textContent = String(count);
}

// Render product tags as badges.
function _renderTags(tags) {
  const tagsEl = document.getElementById('productTags');
  if (!tagsEl) return;
  tagsEl.innerHTML = tags.map((tag) => `<span class="productTag">#${tag}</span>`).join('');
}

// Convert numeric rating to five star characters.
function _renderStars(rating) {
  const filled = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return `${'\u2605'.repeat(filled)}${'\u2606'.repeat(5 - filled)}`;
}

// Calculate an average value from numbers.
function _average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Read star values from static review cards.
function _getReviewCardRatings() {
  return Array.from(document.querySelectorAll('[data-review-rating]'))
    .map((element) => Number(element.dataset.reviewRating))
    .filter((value) => Number.isFinite(value));
}

// Keep a reference so thumbnail clicks can drive the Swiper instance.
// 保留 Swiper 實例，讓縮圖點擊可以切換主圖。
let _detailGallerySwiper = null;

// Render image gallery: Swiper main slider + thumbs + GLightbox zoom.
// 渲染圖片區：主圖輪播、縮圖、點擊放大。
function _renderGallery(product) {
  const images =
    product.images && product.images.length > 0 ? product.images : [product.image].filter(Boolean);
  const galleryMain = document.getElementById('galleryMain');
  const thumbs = document.getElementById('galleryThumbs');
  if (!galleryMain || !thumbs || images.length === 0) return;

  // Main area: reuse shared card-gallery markup (no title bar in lightbox)
  // 主圖區：共用 card-gallery（燈箱不帶標題白條）
  if (window.buildCardGalleryHtml) {
    galleryMain.innerHTML = window.buildCardGalleryHtml({
      images,
      alt: product.name,
      galleryId: `product-detail-${product.id}`,
      wrapClass: 'productDetailGallery',
    });
  } else {
    galleryMain.innerHTML = `<img class="galleryMainImg" src="${images[0]}" alt="${product.name}" loading="lazy">`;
  }

  thumbs.innerHTML = images.map((src, index) => _buildGalleryThumb(src, index, product.name)).join('');

  // Init Swiper + GLightbox after DOM is ready / DOM 就緒後初始化
  window.initCardGalleries?.(document.getElementById('productGallery') || document);

  // Remember the detail-page Swiper for thumbnail sync / 記住詳情頁 Swiper 供縮圖同步
  const swiperEl = galleryMain.querySelector('.card-gallery-swiper');
  _detailGallerySwiper = swiperEl?.swiper || null;

  // Sync active thumb when user swipes / 滑動主圖時同步縮圖高亮
  if (_detailGallerySwiper) {
    _detailGallerySwiper.on('slideChange', () => {
      _setActiveThumb(_detailGallerySwiper.activeIndex);
    });
  }

  // Thumbnail click → switch main slide (and open is via main image lightbox)
  // 點縮圖：切換主圖；放大請點主圖
  thumbs.onclick = (event) => _handleGalleryThumbClick(event);
}

// Highlight the thumbnail that matches the current slide index.
// 依目前投影片索引高亮對應縮圖。
function _setActiveThumb(index) {
  const thumbs = document.querySelectorAll('.galleryThumb');
  thumbs.forEach((item, i) => {
    item.classList.toggle('isSelected', i === index);
  });
}

// Build one gallery thumbnail button.
function _buildGalleryThumb(src, index, name) {
  const active = index === 0 ? ' isSelected' : '';
  return `
    <button class="galleryThumb${active}" data-index="${index}" type="button" aria-label="${name} ${index + 1}">
      <img src="${src}" alt="" class="galleryThumbImage" loading="lazy">
    </button>
  `;
}

// Switch the main Swiper slide from a thumbnail click.
// 點縮圖時切換主圖輪播。
function _handleGalleryThumbClick(event) {
  const thumb = event.target.closest('.galleryThumb');
  if (!thumb) return;
  const index = Number(thumb.dataset.index);
  if (!Number.isFinite(index)) return;
  _setActiveThumb(index);
  if (_detailGallerySwiper) {
    _detailGallerySwiper.slideTo(index);
  }
}

// Render color or size option groups.
function _renderSpecOptions(product, type) {
  const options = type === 'color' ? product.colors : product.sizes;
  const group = document.getElementById(`${type}SpecGroup`);
  const container = document.getElementById(`${type}Options`);
  const label = document.getElementById(`selected${_capitalize(type)}Label`);

  group?.toggleAttribute('hidden', !options || options.length === 0);
  if (!options || !container || options.length === 0) return;
  if (label) label.textContent = options[0];
  container.innerHTML = options.map((value, index) => _buildSpecButton(type, value, index)).join('');
  container.addEventListener('click', (event) => _handleSpecClick(event, type, container, label));
}

// Build one spec option button.
function _buildSpecButton(type, value, index) {
  const active = index === 0 ? ' isSelected' : '';
  return `<button class="specOptionBtn${active}" data-${type}="${value}" type="button">${value}</button>`;
}

// Update selected spec button and visible label.
function _handleSpecClick(event, type, container, label) {
  const button = event.target.closest('.specOptionBtn');
  if (!button) return;
  container.querySelectorAll('.specOptionBtn').forEach((item) => item.classList.remove('isSelected'));
  button.classList.add('isSelected');
  if (label) label.textContent = button.dataset[type];
}

// Capitalize a simple ASCII word.
function _capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Render product specifications and feature tags.
function _renderSpecTable(product) {
  const specTable = document.getElementById('productSpecTable');
  if (!specTable) return;
  const specs = product.specifications || {};
  specTable.innerHTML = Object.keys(specs).length
    ? _buildSpecRows(specs)
    : '<div class="productSpecEmpty">\u66ab\u7121\u898f\u683c\u8cc7\u6599</div>';
  _renderFeatures(product.tags || []);
}

// Build specification rows from key-value data.
function _buildSpecRows(specs) {
  return Object.entries(specs)
    .map(
      ([key, value]) => `
    <div class="productSpecRow">
      <div class="productSpecLabel">${_getSpecLabel(key)}</div>
      <div class="productSpecValue">${value}</div>
    </div>
  `
    )
    .join('');
}

// Map known specification keys to labels.
function _getSpecLabel(key) {
  const labels = {
    weight: '\u91cd\u91cf',
    capacity: '\u5bb9\u91cf',
    material: '\u6750\u8cea',
    waterproof: '\u9632\u6c34\u4fc2\u6578',
    frameType: '\u652f\u67b6\u985e\u578b',
    power: '\u529f\u7387',
    fuelType: '\u71c3\u6599\u985e\u578b',
    lumens: '\u4eae\u5ea6',
    batteryLife: '\u96fb\u6c60\u7e8c\u822a',
    windSpeed: '\u98a8\u901f',
    poles: '\u71df\u67f1\u6750\u8cea',
  };
  return labels[key] || key;
}

// Render feature tags in the description tab.
function _renderFeatures(tags) {
  const features = document.getElementById('productFeatures');
  if (!features || tags.length === 0) return;
  features.innerHTML = `
    <h4 class="productFeaturesTitle">\u5546\u54c1\u7279\u8272</h4>
    <ul class="productFeaturesList">${tags.map((tag) => `<li>${tag}</li>`).join('')}</ul>
  `;
}

// Render native progress value for free shipping threshold.
function _renderShippingProgress() {
  const cartTotal = window.calculateCartTotal ? window.calculateCartTotal() : 0;
  const progress = Math.min(Math.round((cartTotal / FREE_SHIPPING_THRESHOLD) * 100), 100);
  const remaining = Math.max(FREE_SHIPPING_THRESHOLD - cartTotal, 0);

  const progressBar = document.getElementById('shippingProgressBar');
  if (progressBar) {
    // 免運進度條渲染值必須與實際購物車進度一致，避免清空購物車後仍殘留假進度。
    progressBar.value = progress;
    progressBar.setAttribute('aria-valuenow', String(progress));
    _setShippingProgressBarState(progressBar, progress);
  }
  _setText(
    'shippingProgressText',
    cartTotal >= FREE_SHIPPING_THRESHOLD ? '\u5df2\u9054\u514d\u904b' : `${progress}%`
  );
  _setShippingHint(cartTotal, remaining);
}

// 同步免運進度條狀態與百分比 class，讓 CSS 可直接畫出深色進度與淺色剩餘軌道。
function _setShippingProgressBarState(progressBar, progress) {
  const previousProgressClass = progressBar.dataset.progressClass;
  const progressClass = `shippingProgressValue${progress}`;

  if (previousProgressClass) progressBar.classList.remove(previousProgressClass);
  progressBar.dataset.progressClass = progressClass;
  progressBar.classList.add(progressClass);
  progressBar.classList.toggle('isEmpty', progress === 0);
  progressBar.classList.toggle('isInProgress', progress > 0 && progress < 100);
  progressBar.classList.toggle('isComplete', progress >= 100);
}

// 監聽共用購物車變更事件，讓抽屜清空、移除與減少商品時同步更新免運進度條。
function _initShippingProgressSync() {
  if (document.body.dataset.shippingProgressBound === 'true') return;
  document.body.dataset.shippingProgressBound = 'true';
  document.addEventListener('yurui:cart-changed', _renderShippingProgress);
}

// Render shipping hint text and status class.
function _setShippingHint(cartTotal, remaining) {
  const hint = document.getElementById('shippingProgressHint');
  if (!hint) return;
  hint.classList.toggle('isSuccess', cartTotal >= FREE_SHIPPING_THRESHOLD);
  if (cartTotal >= FREE_SHIPPING_THRESHOLD) hint.textContent = '\u5df2\u9054\u514d\u904b\u9580\u6abb';
  else if (cartTotal === 0)
    hint.textContent = `\u8cfc\u7269\u6eff NT$${FREE_SHIPPING_THRESHOLD.toLocaleString()} \u514d\u904b\uff0c\u9084\u5dee NT$${remaining.toLocaleString()}`;
  else hint.textContent = `\u518d\u8cfc\u8cb7 NT$${remaining.toLocaleString()} \u5373\u53ef\u514d\u904b`;
}

// Initialize quantity stepper buttons.
function _initQtyStepper() {
  const qtyInput = document.getElementById('qtyInput');
  document.getElementById('qtyDecrease')?.addEventListener('click', () => _setQuantity(qtyInput, -1));
  document.getElementById('qtyIncrease')?.addEventListener('click', () => _setQuantity(qtyInput, 1));
  qtyInput?.addEventListener('change', () => _normalizeQuantity(qtyInput));
}

// Increment or decrement the current quantity.
function _setQuantity(input, step) {
  if (!input) return;
  input.value = Math.max(1, Math.min(99, parseInt(input.value, 10) + step));
}

// Keep quantity inside the supported range.
function _normalizeQuantity(input) {
  let value = parseInt(input.value, 10);
  if (Number.isNaN(value) || value < 1) value = 1;
  input.value = Math.min(value, 99);
}

// Initialize add-to-cart and buy-now actions.
function _initActionButtons(product) {
  document.getElementById('addToCartBtn')?.addEventListener('click', () => {
    _addSelectedProductToCart(product);
  });
  document.getElementById('buyNowBtn')?.addEventListener('click', () => {
    _addSelectedProductToCart(product);
    window.setTimeout(() => {
      window.location.href = 'checkout.html';
    }, 500);
  });
}

// Add the current product and selected specs to cart.
function _addSelectedProductToCart(product) {
  const qty = parseInt(document.getElementById('qtyInput')?.value || '1', 10);
  const specs = _getSelectedSpecs();
  const variant = window.findProductVariant(product, specs.color, specs.size);
  window.addToCart(window.buildCartLineFromProduct(product, variant), qty);
}

// Get currently selected color and size.
function _getSelectedSpecs() {
  return {
    color: document.querySelector('#colorOptions .specOptionBtn.isSelected')?.dataset.color || null,
    size: document.querySelector('#sizeOptions .specOptionBtn.isSelected')?.dataset.size || null,
  };
}

// Initialize product description and review tabs.
function _initTabSwitching() {
  const tabBtns = document.querySelectorAll('.productTabBtn');
  const tabPanels = document.querySelectorAll('.productTabPanel');
  tabBtns.forEach((button) => {
    button.addEventListener('click', () => _activateTab(button, tabBtns, tabPanels));
  });
}

// Activate one tab and its matching panel.
function _activateTab(activeButton, tabBtns, tabPanels) {
  const targetTab = activeButton.dataset.tab;
  tabBtns.forEach((button) => button.classList.toggle('isSelected', button === activeButton));
  tabPanels.forEach((panel) => panel.classList.toggle('isSelected', panel.dataset.panel === targetTab));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.initProductDetailPage);
} else {
  window.initProductDetailPage();
}
