// ========================================
// Yuruicamp Formatters
// ========================================

/**
 * Formats a number as Taiwan Dollar currency.
 * @param {number} amount - Amount to format.
 * @returns {string} Localized currency text.
 */
window.formatCurrency = (amount) => {
  const formatter = new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0,
  });
  return formatter.format(Number(amount) || 0);
};

/**
 * Formats a date string for zh-TW users.
 * @param {string|Date} dateString - Date value accepted by Date constructor.
 * @returns {string} Localized date text.
 */
window.formatDate = (dateString) => {
  const formatter = new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date(dateString));
};

/**
 * 格式化日期時間（含時分秒），供訂單/預約詳情顯示
 * Format datetime with time for order/booking detail views.
 * @param {string|Date} dateString - e.g. "2026-06-27 17:58:27"
 * @returns {string} Localized datetime text
 */
window.formatDateTime = (dateString) => {
  if (!dateString) return '';
  const normalized = String(dateString).trim().replace(' ', 'T');
  const formatter = new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return formatter.format(new Date(normalized));
};

/**
 * Generates a lightweight unique id for mock records and UI nodes.
 * @returns {string} Unique id string.
 */
window.generateId = () => `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

/**
 * Delays running a function until user input has paused.
 * @param {Function} func - Function to debounce.
 * @param {number} delay - Delay in milliseconds.
 * @returns {Function} Debounced function.
 */
window.debounce = (func, delay) => {
  let timeoutId;
  return function debouncedFunction(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
};

/**
 * Limits a function so it can run at most once per delay interval.
 * @param {Function} func - Function to throttle.
 * @param {number} delay - Minimum interval in milliseconds.
 * @returns {Function} Throttled function.
 */
window.throttle = (func, delay) => {
  let lastCall = 0;
  return function throttledFunction(...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      func.apply(this, args);
      lastCall = now;
    }
  };
};

/**
 * Deep clones plain objects and arrays used by mock front-end data.
 * @param {*} value - Value to clone.
 * @returns {*} Cloned value.
 */
window.deepClone = (value) => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => window.deepClone(item));

  const cloned = {};
  Object.keys(value).forEach((key) => {
    cloned[key] = window.deepClone(value[key]);
  });
  return cloned;
};

// ── 假資料整合：訂單 / 會員 / 商品工具 ──

/** 訂單數字 id → 顯示用 ORD-0001（與後台 id-utils 一致） */
window.formatOrderDisplayId = (id) => {
  const num = Number(id);
  if (!Number.isFinite(num) || num < 1) return String(id || '');
  return 'ORD-' + String(num).padStart(4, '0');
};

/** 預約數字 id → 顯示用 BK-0001（與後台 id-utils 一致） */
window.formatBookingDisplayId = (id) => {
  const num = Number(id);
  if (!Number.isFinite(num) || num < 1) return String(id || '');
  return 'BK-' + String(num).padStart(4, '0');
};

/** 寬鬆比對 id（避免 1 !== "1"） */
window.sameId = (a, b) => String(a) === String(b);

/** 依累積消費計算會員等級（門檻 12,000 / 28,000） */
window.computeTier = (totalSpent) => {
  const spent = Number(totalSpent) || 0;
  if (spent >= 28000) return { tier: 'master', tierName: '大師' };
  if (spent >= 12000) return { tier: 'guide', tierName: '嚮導' };
  return { tier: 'explorer', tierName: '探險家' };
};

/** 下一等級所需消費（供會員中心進度條） */
window.getNextTierThreshold = (totalSpent) => {
  const spent = Number(totalSpent) || 0;
  if (spent >= 28000) return null;
  if (spent >= 12000) return 28000;
  return 12000;
};

/** 訂單回饋點數 = subtotal × 10% 無條件進位 */
window.calculateOrderRewardPoints = (subtotal) => {
  return Math.ceil((Number(subtotal) || 0) * 0.1);
};

/** 從 reviews 聚合商品評分 */
window.aggregateProductRating = (productId, reviews) => {
  const list = (reviews || []).filter((r) => r && r.productId === productId);
  if (list.length === 0) {
    return { rating: null, reviewCount: 0, ratingDisplay: '—' };
  }
  const sum = list.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
  const rating = Math.round((sum / list.length) * 10) / 10;
  return {
    rating,
    reviewCount: list.length,
    // ratingDisplay 只放分數；評價次數由 reviewCount 欄位負責 / Score only; count lives in reviewCount
    ratingDisplay: rating.toFixed(1),
  };
};

/** 從訂單加總商品銷量 */
window.computeProductSales = (productId, orders) => {
  return (orders || []).reduce((total, order) => {
    const items = order.items || [];
    return total + items.reduce((sum, item) => {
      if (item.productId !== productId) return sum;
      return sum + (Number(item.quantity) || 0);
    }, 0);
  }, 0);
};

/** 為前台商品補齊衍生欄位（colors / sizes / 路徑正規化） */
window.enrichProductForDisplay = (product) => {
  if (!product) return product;
  const p = window.deepClone ? window.deepClone(product) : { ...product };
  const variants = p.variants || [];

  p.colors = [...new Set(variants.map((v) => v.color).filter(Boolean))];
  p.sizes = [...new Set(variants.map((v) => v.size).filter(Boolean))];

  if (p.image && String(p.image).startsWith('../')) {
    p.image = String(p.image).replace(/^\.\.\//, '/');
  }
  if (Array.isArray(p.images)) {
    p.images = p.images.map((src) =>
      String(src).startsWith('../') ? String(src).replace(/^\.\.\//, '/') : src
    );
  }
  return p;
};

// ── 多規格 / SKU 工具（商城 cart、訂單、卡片快速加入）──

/** 組合規格顯示文字：單維顯示有的；多維用 " / " */
window.buildSpecLabel = (color, size) => {
  return [color, size].filter(Boolean).join(' / ');
};

/** 從 variant 物件取得 label */
window.buildVariantLabel = (variant) => {
  if (!variant) return '';
  const label = (variant.label || '').trim();
  if (label) return label;
  return window.buildSpecLabel(variant.color, variant.size);
};

/** 取得商品規格陣列（至少一筆） */
window.getProductVariants = (product) => {
  const variants = (product && product.variants) || [];
  if (variants.length) return variants;
  const pid = product && product.id ? product.id : 'unknown';
  return [{ id: `v-${pid}-0`, color: '', size: '', label: '' }];
};

/** 依 color / size 找 variant；找不到則回第一筆 */
window.findProductVariant = (product, color, size) => {
  const variants = window.getProductVariants(product);
  const c = color == null ? '' : String(color);
  const s = size == null ? '' : String(size);
  const exact = variants.find((v) => (v.color || '') === c && (v.size || '') === s);
  return exact || variants[0];
};

/** 組 cart / order line payload */
window.buildCartLineFromProduct = (product, variant, extra) => {
  const v = variant || window.getProductVariants(product)[0];
  const specLabel = window.buildVariantLabel(v);
  const base = {
    id: product.id,
    productId: product.id,
    variantId: v.id,
    sku: v.id,
    name: product.name,
    color: v.color || '',
    size: v.size || '',
    specLabel,
    price: product.price,
    image: product.image,
    brand: product.brand,
  };
  return Object.assign(base, extra || {});
};

/** 購物車合併 key：productId + variantId */
window.getCartLineKey = (item) => {
  const pid = item.productId || item.id || '';
  const vid = item.variantId || '';
  return `${pid}:${vid}`;
};

/** 後台異動 B2 品名 */
window.formatMovementProductName = (name, specLabel) => {
  const base = String(name || '').trim();
  const spec = String(specLabel || '').trim();
  if (!spec) return base;
  return `${base}（${spec}）`;
};

/** 卡片預設規格（第一個 color / size） */
window.getDefaultCardSpecSelection = (product) => {
  const variants = window.getProductVariants(product);
  const colors = [...new Set(variants.map((v) => v.color).filter(Boolean))];
  const sizes = [...new Set(variants.map((v) => v.size).filter(Boolean))];
  const color = colors[0] || '';
  const size = sizes[0] || '';
  const variant = window.findProductVariant(product, color, size);
  return { color, size, variant, specLabel: window.buildVariantLabel(variant) };
};

/** 規格小字 HTML（購物車、結帳、會員中心共用） */
window.renderSpecLabelHtml = (specLabel, className) => {
  const spec = String(specLabel || '').trim();
  if (!spec) return '';
  const cls = className || 'itemSpecLabel';
  return `<p class="${cls}">${spec.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
};

// formatShippingAddressLine 由 js/shipping-address.js 提供（需在 formatters 之後載入）

console.log('✓ Formatters 已初始化');
