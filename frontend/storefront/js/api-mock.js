// ========================================
// Mock / REST API 層 — 統一資料入口（window.API）
// ========================================
// Mock：根絕對路徑 /data/**.json（不再依頁面深度改寫）
// REST：AppConfig.USE_MOCK_API === false 時打 API_BASE_URL
// English: Single API facade — mock JSON or Spring REST; pages never rewrite paths.

/**
 * Mock 專用路徑表（僅 USE_MOCK_API 時使用）
 * Root-absolute paths under Vite root=frontend. Do not use ../ here.
 */
const MOCK_DATA_PATHS = {
  products: '/data/catalog/products.json',
  productDisplay: '/data/catalog/product-display.json',
  adminProducts: '/data/admin/products.legacy.json',
  campgrounds: '/data/catalog/campgrounds.json',
  campEquipment: '/data/catalog/camp-equipment.json',
  orders: '/data/commerce/orders.json',
  campBookings: '/data/commerce/camp-bookings.json',
  customers: '/data/customers/customers.json',
  preferenceOptions: '/data/customers/preference-options.json',
  customerPreferences: '/data/customers/customer-preferences.json',
  customerShippingAddresses: '/data/customers/customer-shipping-addresses.json',
  customerTags: '/data/customers/customer-tags.json',
  customerTagAssignments: '/data/customers/customer-tag-assignments.json',
  articles: '/data/marketing/articles.json',
  branches: '/data/marketing/branches.json',
  brands: '/data/marketing/brands.json',
  coupons: '/data/promotions/coupons.json',
  reviews: '/data/admin/reviews.json',
  movement: '/data/admin/movement.json',
  minStock: '/data/admin/min-stock.json',
  rentalSkus: '/data/admin/rental-skus.json',
  bookingPolicy: '/data/admin/booking-policy.json',
  zoneBlocks: '/data/admin/zone-blocks.json',
  campgroundClosures: '/data/admin/campground-closures.json',
};

window.MockDataPaths = MOCK_DATA_PATHS;

const MOCK_ORDERS_KEY = 'mockOrders';
const MOCK_CHECKOUT_SESSIONS_KEY = 'mockCheckoutSessions';
const MOCK_REVIEWS_KEY = 'mockReviews';
const MOCK_CUSTOMER_OVERLAY_KEY = 'mockCustomerOverlay';
const MOCK_CUSTOMER_RELATIONS_KEY = 'mockCustomerRelations';

let productsCache = null;
let productsCacheExpiresAt = 0;
let productDisplayCache = null;
let reviewsCache = null;
let ordersCache = null;

/** @returns {boolean} true = mock JSON；false = Spring REST */
const _useMockApi = () => window.AppConfig?.USE_MOCK_API !== false;

const _path = (key) => MOCK_DATA_PATHS[key] || '';

const PRODUCT_CONTRACT_FIELDS = [
  'id', 'itemId', 'status', 'name', 'category', 'brand', 'description', 'image', 'price',
  'rating', 'reviewCount', 'variants',
];
const PRODUCT_VARIANT_CONTRACT_FIELDS = [
  'id', 'sku', 'color', 'size', 'specification', 'price', 'availableQuantity', 'inStock',
];
const CONTRACT_MONEY = /^\d+\.\d{2}$/;

const _contractError = (message) => {
  throw new Error(`PRODUCT_CONTRACT_ERROR: ${message}`);
};

const _assertExactKeys = (value, expected, label) => {
  const actual = Object.keys(value).sort();
  const required = expected.slice().sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    _contractError(`${label} fields must be exactly: ${expected.join(', ')}`);
  }
};

/**
 * Public catalog input must already be Product API Contract v0.4.
 * Do not silently create item IDs, SKUs, prices, or variants from old fixtures.
 */
const _readProductContract = (product) => {
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    _contractError('product must be an object');
  }
  const hasTags = Object.prototype.hasOwnProperty.call(product, 'tags');
  _assertExactKeys(
    product,
    hasTags ? [...PRODUCT_CONTRACT_FIELDS, 'tags'] : PRODUCT_CONTRACT_FIELDS,
    'product'
  );
  if (typeof product.id !== 'string' || typeof product.itemId !== 'string' || product.status !== 'active'
      || typeof product.name !== 'string' || typeof product.price !== 'string'
      || !CONTRACT_MONEY.test(product.price) || !/^\d+\.\d$/.test(product.rating)
      || !Number.isInteger(product.reviewCount) || product.reviewCount < 0
      || !Array.isArray(product.variants) || product.variants.length === 0) {
    _contractError(`invalid product: ${product.id || '(missing id)'}`);
  }
  if (hasTags && (!Array.isArray(product.tags)
      || product.tags.some((tag) => typeof tag !== 'string' || !tag.trim()))) {
    _contractError(`${product.id}.tags must be a non-empty string array`);
  }
  ['category', 'brand', 'description', 'image'].forEach((field) => {
    if (product[field] !== null && typeof product[field] !== 'string') {
      _contractError(`${product.id}.${field} must be string or null`);
    }
  });
  product.variants.forEach((variant) => {
    if (!variant || typeof variant !== 'object' || Array.isArray(variant)) {
      _contractError(`${product.id}: variant must be an object`);
    }
    _assertExactKeys(variant, PRODUCT_VARIANT_CONTRACT_FIELDS, `${product.id} variant`);
    if (typeof variant.id !== 'string' || typeof variant.sku !== 'string'
        || typeof variant.specification !== 'string' || typeof variant.price !== 'string'
        || !CONTRACT_MONEY.test(variant.price)
        || !Number.isInteger(variant.availableQuantity) || variant.availableQuantity < 0
        || variant.inStock !== (variant.availableQuantity > 0)) {
      _contractError(`${product.id}: invalid variant ${variant.id || '(missing id)'}`);
    }
    ['color', 'size'].forEach((field) => {
      if (variant[field] !== null && typeof variant[field] !== 'string') {
        _contractError(`${product.id}/${variant.id}.${field} must be string or null`);
      }
    });
  });
  return {
    ...product,
    tags: hasTags ? product.tags : [],
  };
};

/**
 * 依開關讀 mock 檔或 REST。
 * @param {string} mockKey - MOCK_DATA_PATHS 鍵
 * @param {string} restPath - 例如 '/products'
 */
const _loadMockOrRest = async (mockKey, restPath) => {
  if (_useMockApi()) {
    return _fetchJson(_path(mockKey));
  }

  // REST 的 Token、Envelope 與錯誤都交給共用請求層。
  return window.ApiClient._restRequest(restPath, { auth: 'optional' });
};

/**
 * Transitional read for storefront-only display enrichments.
 * Catalog is already backed by Spring, but reviews and orders are scheduled
 * for later backend phases. Their missing endpoints must not hide products.
 */
const _loadDisplaySeed = async (mockKey, restPath) => {
  if (_useMockApi()) return _fetchJson(_path(mockKey));
  try {
    return await window.ApiClient._restRequest(restPath, { auth: 'optional' });
  } catch (error) {
    console.info(`Backend ${restPath} is not available yet; using local ${mockKey} display seed.`, error);
    return _fetchJson(_path(mockKey));
  }
};

const _readJsonStorage = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch (error) {
    console.warn('localStorage parse failed:', key, error);
    return fallback;
  }
};

const _writeJsonStorage = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

/** 載入本機 Mock JSON（靜態資源，不走 ApiClient／Bearer） */
const _fetchJson = async (url, options = {}) => {
  const res = await fetch(url, { cache: 'no-store', ...options });
  if (!res.ok) throw new Error('Fetch failed: ' + url);
  return res.json();
};

const _formatLocalDateTime = (date = new Date()) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};

// 將後端 CouponClaimResponse 轉成會員中心既有折價券卡片欄位。
const _toMemberCouponCard = (claim) => {
  const coupon = claim?.coupon || {};
  const claimStatus = String(claim?.status || '').trim();
  const couponStatus = String(coupon.status || '').trim();

  return {
    id: claim?.id,
    couponId: claim?.couponId,
    claimStatus,
    code: coupon.code || '',
    name: coupon.name || '',
    type: coupon.discountType || 'fixed',
    discount: Number(coupon.discountValue) || 0,
    minOrder: Number(coupon.minimumAmount) || 0,
    category: coupon.category || 'promotion',
    startDate: coupon.validFrom || '',
    endDate: coupon.validUntil || '',
    expiry: coupon.validUntil ? String(coupon.validUntil).slice(0, 10) : '',
    claimedAt: claim?.claimedAt || '',
    consumedAt: claim?.consumedAt || null,
    used: claimStatus !== 'claimed' || couponStatus !== 'active',
  };
};

const _getStoredOrders = () => _readJsonStorage(MOCK_ORDERS_KEY, []);

const _mergeOrders = (base = [], persisted = []) => {
  const map = new Map();
  [...base, ...persisted].forEach((o) => {
    if (o && o.id != null) map.set(o.id, o);
  });
  return [...map.values()];
};

const _getNextOrderId = (orders = []) => {
  const ids = orders.map((o) => Number(o.id)).filter((n) => Number.isFinite(n) && n > 0);
  return Math.max(100, ...ids, 0) + 1;
};

const _normalizeOrder = (order) => {
  if (!order) return order;

  // 後端 Order 契約保留正式欄位，並補上會員中心既有的顯示欄位。
  const items = Array.isArray(order.items)
    ? order.items.map((item) => ({
        ...item,
        orderItemId: item.orderItemId ?? item.id,
        name: item.name || item.productName || '',
        image: item.image || item.imageUrl || '',
        price: Number(item.price ?? item.unitPrice ?? 0),
        specLabel: item.specLabel || item.specification || '',
      }))
    : [];

  return {
    ...order,
    items,
    createdAt: order.createdAt || order.placedAt || '',
    payment: order.payment || order.paymentMethod || '',
    address: order.address || order.shippingAddress || '',
    buyerPhone: order.buyerPhone || order.shippingPhone || '',
    displayId: window.formatOrderDisplayId(order.id),
  };
};

/**
 * API 衍生欄位（不寫回 products.json）
 * Derived fields only — do NOT persist rating / salesCount / reviewCount to JSON.
 * totalStock / branch 亦為衍生（由 variants[].branch 加總，見 normalize-phase1-data.cjs）
 */
const _enrichProduct = async (product, reviews, orders) => {
  const display = await _loadProductDisplay();
  const displayMetadata = display[product.id] || {};
  const enriched = window.enrichProductForDisplay({
    ...product,
    ...displayMetadata,
    // 正式模式以後端 equipment_tags 為真相；Mock 才讀同步的展示 Seed。
    tags: _useMockApi() ? (displayMetadata.tags || []) : (product.tags || []),
    // Display metadata must never replace public variant identity or pricing.
    variants: product.variants,
  });
  // 契約線上是字串金額；頁面仍多用 number（toLocaleString）→ 只在 UI enrich 轉型
  // Wire contract uses string money; convert only for display helpers below.
  enriched.price = Number(enriched.price);
  if (Array.isArray(enriched.variants)) {
    enriched.variants = enriched.variants.map((v) => ({ ...v, price: Number(v.price) }));
  }
  if (_useMockApi()) {
    const ratingInfo = window.aggregateProductRating(enriched.id, reviews);
    enriched.rating = ratingInfo.rating;
    enriched.reviewCount = ratingInfo.reviewCount;
    enriched.ratingDisplay = ratingInfo.ratingDisplay;
  } else {
    enriched.rating = Number(product.rating);
    enriched.reviewCount = product.reviewCount;
    enriched.ratingDisplay = product.rating;
  }
  enriched.salesCount = window.computeProductSales(enriched.id, orders);
  return enriched;
};

const _getCustomerOverlay = () => _readJsonStorage(MOCK_CUSTOMER_OVERLAY_KEY, {});

const _setCustomerOverlay = (customerId, patch) => {
  const all = _getCustomerOverlay();
  all[customerId] = { ...(all[customerId] || {}), ...patch };
  _writeJsonStorage(MOCK_CUSTOMER_OVERLAY_KEY, all);
};

const _applyCustomerOverlay = (customer) => {
  const overlay = _getCustomerOverlay()[customer.id] || {};
  return { ...customer, ...overlay };
};

const _getCustomerRelationOverlay = () => _readJsonStorage(MOCK_CUSTOMER_RELATIONS_KEY, {});

const _setCustomerRelationOverlay = (customerId, patch) => {
  const all = _getCustomerRelationOverlay();
  all[customerId] = { ...(all[customerId] || {}), ...patch };
  _writeJsonStorage(MOCK_CUSTOMER_RELATIONS_KEY, all);
};

const _loadNormalizedCustomers = async () => {
  const [customers, options, preferences, addresses, tags, assignments] = await Promise.all([
    _fetchJson(_path('customers')),
    _fetchJson(_path('preferenceOptions')),
    _fetchJson(_path('customerPreferences')),
    _fetchJson(_path('customerShippingAddresses')),
    _fetchJson(_path('customerTags')),
    _fetchJson(_path('customerTagAssignments')),
  ]);
  const optionById = new Map(options.map((option) => [option.id, option]));
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  return customers.map((customer) => {
    const preferenceObject = { styles: [], equipment: [] };
    preferences
      .filter((item) => item.customerId === customer.id)
      .map((item) => optionById.get(item.preferenceId))
      .filter(Boolean)
      .forEach((option) => {
        const key = option.type === 'style' ? 'styles' : 'equipment';
        preferenceObject[key].push(option.code);
      });
    const defaultAddress = addresses.find((address) => address.customerId === customer.id && address.isDefault);
    const shippingAddress = defaultAddress ? {
      lastName: '',
      firstName: defaultAddress.recipientName,
      postalCode: defaultAddress.postalCode,
      city: defaultAddress.city,
      district: defaultAddress.district,
      township: '',
      addressLine1: defaultAddress.addressLine,
      addressLine2: '',
      email: defaultAddress.email || customer.email,
      phone: defaultAddress.phone,
    } : null;
    const customerTagNames = assignments
      .filter((item) => item.customerId === customer.id)
      .map((item) => tagById.get(item.tagId)?.name)
      .filter(Boolean);
    return {
      ...customer,
      status: customer.status || 'active',
      deletedAt: customer.deletedAt || null,
      preferences: preferenceObject,
      shippingAddress,
      tags: customerTagNames,
      ...(_getCustomerRelationOverlay()[customer.id] || {}),
    };
  });
};

const _loadProductsRaw = async () => {
  const now = Date.now();
  if (productsCache && now < productsCacheExpiresAt) return productsCache;
  // Mock: /data/catalog/products.json ；REST: GET /api/products
  // getAll is a legacy convenience method; B-3's explicit getPage below is
  // the contract-aware entry point. Request the largest permitted page here.
  const raw = await _loadMockOrRest('products', '/products?page=0&size=100&sort=id,asc');
  const list = Array.isArray(raw) ? raw : [];
  productsCache = list.map(_readProductContract);
  productsCacheExpiresAt = now + (window.AppConfig?.CACHE_DURATION || 3600000);
  return productsCache;
};

/** Presentation-only fields live outside the public Product API contract. */
const _loadProductDisplay = async () => {
  if (productDisplayCache) return productDisplayCache;
  const source = await _fetchJson(_path('productDisplay'));
  productDisplayCache = source && typeof source === 'object' ? source : {};
  return productDisplayCache;
};

/**
 * B-3 product page adapter. It preserves the API envelope's meta while the
 * older getAll API intentionally continues returning an array for old pages.
 */
const _loadProductPage = async ({
  page = 0,
  size = 20,
  sort = 'id,asc',
  category = null,
  brand = null,
  minPrice = null,
  maxPrice = null,
} = {}) => {
  const [field, direction] = String(sort).split(',');
  if (!['id', 'name', 'createdAt'].includes(field) || !['asc', 'desc'].includes(direction)) {
    throw new Error(
      'VALIDATION_ERROR: sort must be id,asc|desc, name,asc|desc, or createdAt,asc|desc'
    );
  }

  if (!_useMockApi()) {
    const queryParams = new URLSearchParams({ page: String(page), size: String(size), sort });
    if (category) queryParams.set('category', category);
    if (brand) queryParams.set('brand', brand);
    if (minPrice !== null && minPrice !== '') queryParams.set('minPrice', String(minPrice));
    if (maxPrice !== null && maxPrice !== '') queryParams.set('maxPrice', String(maxPrice));
    const query = queryParams.toString();
    const result = await window.ApiClient._restRequest(`/products?${query}`, {
      auth: 'optional',
      includeMeta: true,
    });

    return {
      data: Array.isArray(result.data) ? result.data.map(_readProductContract) : [],
      meta: result.meta,
    };
  }

  let all = await _loadProductsRaw();
  if (category) all = all.filter((product) => product.category?.toLocaleLowerCase() === String(category).trim().toLocaleLowerCase());
  if (brand) all = all.filter((product) => product.brand?.toLocaleLowerCase() === String(brand).trim().toLocaleLowerCase());
  if ((minPrice !== null && minPrice !== '') || (maxPrice !== null && maxPrice !== '')) {
    all = all.filter((product) => product.variants.some((variant) => (
      (minPrice === null || minPrice === '' || Number(variant.price) >= Number(minPrice))
      && (maxPrice === null || maxPrice === '' || Number(variant.price) <= Number(maxPrice))
    )));
  }
  const multiplier = direction === 'asc' ? 1 : -1;
  const ordered = all.slice().sort((a, b) => String(a[field]).localeCompare(String(b[field]), 'zh-Hant') * multiplier);
  const start = Number(page) * Number(size);
  return {
    data: ordered.slice(start, start + Number(size)),
    meta: {
      page: Number(page),
      size: Number(size),
      totalElements: ordered.length,
      totalPages: Math.ceil(ordered.length / Number(size)),
    },
  };
};

const _loadReviews = async () => {
  if (reviewsCache) return reviewsCache;
  const seed = await _loadDisplaySeed('reviews', '/reviews');
  const mock = _useMockApi() ? _readJsonStorage(MOCK_REVIEWS_KEY, []) : [];
  reviewsCache = [...seed, ...mock].map((review) => ({
    ...review,
    verifiedPurchase: review.verifiedPurchase === true || review.id === 'REV031',
    ...(review.id === 'REV031' && review.orderItemId == null ? { orderItemId: 418 } : {}),
  }));
  return reviewsCache;
};

const _loadOrdersSeed = async () => {
  if (ordersCache) return ordersCache;
  let orderItemId = 0;
  const source = await _loadDisplaySeed('orders', '/orders');
  ordersCache = source.map((order) => ({
    ...order,
    items: (order.items || []).map((item) => ({
      ...item,
      // Mirrors P4 source-order identity assignment. The review write
      // contract sends only this authoritative relationship.
      orderItemId: ++orderItemId,
    })),
  }));
  return ordersCache;
};

const _buildCustomerNotifications = (customer, orders) => {
  const list = [];
  const cid = customer.id;
  (orders || []).filter((o) => o.customerId === cid).forEach((o) => {
    const disp = window.formatOrderDisplayId(o.id);
    if (o.status === 'shipped') {
      // orderId：點通知可開訂單明細；trackingNumber 對應 schema orders.tracking_number
      const trackHint = o.trackingNumber
        ? '運單編號：' + o.trackingNumber + '。'
        : '';
      list.push({
        id: 'n-ship-' + o.id,
        type: 'order',
        orderId: o.id,
        title: '訂單 ' + disp + ' 已出貨',
        message: trackHint + '您的訂單已由宅配公司取件，請留意配送進度。',
        time: o.createdAt,
        read: false,
      });
    }
    if (o.status === 'completed') {
      const trackHint = o.trackingNumber
        ? '運單編號：' + o.trackingNumber + '。'
        : '';
      list.push({
        id: 'n-done-' + o.id,
        type: 'order',
        orderId: o.id,
        title: '訂單 ' + disp + ' 已送達',
        message: trackHint + '已送達，歡迎評價。',
        time: o.deliveredAt || o.createdAt,
        read: false,
      });
    }
  });
  const now = new Date();
  if (customer.birthday) {
    const bMonth = parseInt(String(customer.birthday).slice(5, 7), 10);
    if (bMonth === now.getMonth() + 1) {
      list.push({
        id: 'n-bday',
        type: 'promo',
        title: '生日折扣碼 YURUIHBD 當月可用',
        message: '祝您生日快樂！本月結帳可使用生日優惠。',
        time: _formatLocalDateTime(now).slice(0, 10),
        read: false,
      });
    }
  }
  if (!customer.firstPurchaseUsed) {
    list.push({
      id: 'n-first',
      type: 'promo',
      title: '首購優惠 YRUIFIRST 尚未使用',
      message: '首次購物可套用首購折扣碼。',
      time: _formatLocalDateTime(now).slice(0, 10),
      read: false,
    });
  }
  return list;
};

const customersApi = {
  getAll: async () => {
    const customers = await _loadNormalizedCustomers();
    return customers
      .map(_applyCustomerOverlay)
      .filter((customer) => customer.status === 'active' && customer.deletedAt === null);
  },

  getById: async (customerId) => {
    const customers = await customersApi.getAll();
    const user = customers.find((c) => c.id === customerId);
    if (!user) throw new Error('Customer not found');
    return user;
  },

  softDelete: async (customerId) => {
    const customer = await customersApi.getById(customerId);
    const timestamp = new Date().toISOString();
    _setCustomerOverlay(customerId, {
      status: 'deleted',
      deletedAt: timestamp,
      updatedAt: timestamp,
    });
    if (window.AppState?.currentUser?.id === customer.id) await customersApi.logout();
    return { ...customer, status: 'deleted', deletedAt: timestamp, updatedAt: timestamp };
  },

  suspend: async (customerId) => {
    const customer = await customersApi.getById(customerId);
    const timestamp = new Date().toISOString();
    _setCustomerOverlay(customerId, {
      status: 'suspended',
      deletedAt: null,
      updatedAt: timestamp,
    });
    if (window.AppState?.currentUser?.id === customer.id) await customersApi.logout();
    return { ...customer, status: 'suspended', deletedAt: null, updatedAt: timestamp };
  },

  getNotifications: async (customerId) => {
    const customer = await customersApi.getById(customerId);
    const orders = await window.API.orders.getAll();
    return _buildCustomerNotifications(customer, orders);
  },

  addPoints: async (customerId, points) => {
    const earned = Number(points) || 0;
    const customer = await customersApi.getById(customerId);
    const nextPoints = (Number(customer.points) || 0) + earned;
    _setCustomerOverlay(customerId, { points: nextPoints });
    const updated = await customersApi.getById(customerId);
    if (window.AppState?.currentUser?.id === customerId) {
      window.AppState.currentUser.points = updated.points;
      window.saveAppState && window.saveAppState();
    }
    window.dispatchEvent(new CustomEvent('yurui:user-points-updated', {
      detail: { userId: customerId, points: updated.points, earnedPoints: earned },
    }));
    return updated;
  },

  markFirstPurchaseUsed: async (customerId) => {
    _setCustomerOverlay(customerId, { firstPurchaseUsed: true });
  },

  update: async (customerId, updates) => {
    const current = window.AppState?.currentUser;
    if (!current || current.id !== customerId) throw new Error('Unauthorized');
    const updated = { ...current, ...updates };
    window.AppState.currentUser = updated;
    window.saveAppState && window.saveAppState();
    const relationUpdates = {};
    const customerUpdates = { ...updates };
    ['preferences', 'shippingAddress', 'tags'].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(customerUpdates, key)) {
        relationUpdates[key] = customerUpdates[key];
        delete customerUpdates[key];
      }
    });
    if (Object.keys(relationUpdates).length) _setCustomerRelationOverlay(customerId, relationUpdates);
    if (Object.keys(customerUpdates).length) _setCustomerOverlay(customerId, customerUpdates);
    return customersApi.getById(customerId);
  },

  logout: async () => {
    if (window.YuruiAuth?.logout) {
      window.YuruiAuth.logout({ showToast: false });
      return;
    }
    window.AppState.isLoggedIn = false;
    window.AppState.currentUser = null;
    window.saveAppState && window.saveAppState();
    localStorage.removeItem('currentUser');
    localStorage.removeItem('yuruiUser');
    localStorage.setItem('isLoggedIn', 'false');
    window.dispatchEvent(new CustomEvent('yurui:auth-changed', { detail: { type: 'logout', user: null } }));
  },
};

// 將會員中心表單轉為後端既有 customer_shipping_addresses 契約。
const _toMemberShippingAddressRequest = (address) => {
  const normalized = window.YuruiShippingAddress?.clone
    ? window.YuruiShippingAddress.clone(address)
    : { ...(address || {}) };
  return {
    recipientName: `${normalized.lastName || ''}${normalized.firstName || ''}`.trim(),
    postalCode: String(normalized.postalCode || '').trim(),
    city: String(normalized.city || '').trim(),
    district: String(normalized.district || '').trim(),
    addressLine: [normalized.township, normalized.addressLine1, normalized.addressLine2]
      .filter(Boolean)
      .join(' ')
      .trim(),
    phone: String(normalized.phone || '').replace(/[\s\-()]/g, ''),
    email: String(normalized.email || '').trim(),
  };
};

// 後端只保存完整收件人姓名；讀回時以首字作為姓，維持既有雙欄表單。
const _fromMemberShippingAddressResponse = (address) => {
  if (!address) return null;
  const recipientName = String(address.recipientName || '').trim();
  return {
    lastName: recipientName.slice(0, 1),
    firstName: recipientName.slice(1),
    postalCode: address.postalCode || '',
    city: address.city || '',
    district: address.district || '',
    township: '',
    addressLine1: address.addressLine || '',
    addressLine2: '',
    email: address.email || '',
    phone: address.phone || '',
  };
};

const memberShippingAddressesApi = {
  getDefault: async () => {
    if (!_useMockApi()) {
      const response = await window.ApiClient._restRequest('/me/shipping-address', {
        auth: 'required',
      });
      return _fromMemberShippingAddressResponse(response);
    }

    return window.AppState?.currentUser?.shippingAddress || null;
  },

  saveDefault: async (address) => {
    if (!_useMockApi()) {
      const response = await window.ApiClient._restRequest('/me/shipping-address', {
        method: 'PUT',
        auth: 'required',
        body: _toMemberShippingAddressRequest(address),
      });
      return _fromMemberShippingAddressResponse(response);
    }

    const current = window.AppState?.currentUser;
    if (!current?.id) throw new Error('Unauthorized');
    const normalized = window.YuruiShippingAddress?.clone
      ? window.YuruiShippingAddress.clone(address)
      : { ...(address || {}) };
    current.shippingAddress = normalized;
    _setCustomerRelationOverlay(current.id, { shippingAddress: normalized });
    window.saveAppState && window.saveAppState();
    return normalized;
  },
};

/**
 * 驗證並編碼 Checkout orderId，避免組出 undefined 或未編碼的路徑。
 */
const _checkoutOrderPath = (orderId) => {
  const normalized = String(orderId || '').trim();

  if (!normalized) {
    throw new window.ApiRequestError(
      'VALIDATION_ERROR',
      'orderId is required'
    );
  }

  return `/checkout/sessions/${encodeURIComponent(normalized)}`;
};

/**
 * Checkout 都是會員操作，統一要求 Firebase／dev Bearer Token。
 */
const _checkoutRestRequest = (path, options = {}) => window.ApiClient._restRequest(path, {
  ...options,
  auth: 'required',
});

// 即使離開 Checkout 頁，也能清除目前分頁保存的冪等狀態。
const _clearCheckoutRequestState = () => {
  if (window.CheckoutIdempotency?.clear) {
    window.CheckoutIdempotency.clear();
    return;
  }

  window.sessionStorage?.removeItem('checkoutIdempotencyKey');
  window.sessionStorage?.removeItem('checkoutCartFingerprint');
  window.sessionStorage?.removeItem('checkoutCompletedOrderId');
  window.sessionStorage?.removeItem('lastCheckoutSession');
};

// Checkout 取消成功或逾時時，通知頁面清除舊冪等狀態。
const _runCheckoutAction = async (action, clearOnSuccess = false) => {
  try {
    const result = await action();
    if (clearOnSuccess) _clearCheckoutRequestState();
    return result;
  } catch (error) {
    if (error?.code === 'CHECKOUT_EXPIRED') _clearCheckoutRequestState();
    throw error;
  }
};

const MOCK_CHECKOUT_HOLD_MS = 15 * 60 * 1000;
const MOCK_CHECKOUT_PENDING = 'PENDING_CHECKOUT';
const CHECKOUT_PAYMENT_METHODS = [
  'ecpay-credit',
  'ecpay-atm',
  'ecpay-cvs',
  'ecpay-other',
  'cod',
];

/**
 * 建立與真後端相同格式的前端 API 錯誤。
 */
const _checkoutMockError = (code, message, status = 0) => new window.ApiRequestError(
  code,
  message,
  [],
  status
);

/**
 * 取得 Mock Checkout 所屬會員，讓冪等鍵仍維持會員範圍。
 * 必須是已登入的真實 customerId（不再 fallback MOCK-CUSTOMER／U001）。
 */
const _getMockCheckoutCustomerId = () => {
  if (window.YuruiAuth && typeof window.YuruiAuth.getUser === 'function') {
    const authUser = window.YuruiAuth.getUser();
    if (authUser && authUser.id) return String(authUser.id);
  }
  const current = window.AppState?.currentUser;
  if (current && current.id) return String(current.id);

  throw _checkoutMockError(
    'AUTH_TOKEN_UNAVAILABLE',
    '請先登入後再結帳（Mock Checkout 需要真實 customerId）',
    401
  );
};

/**
 * 複製公開 CheckoutSession，避免內部冪等資訊被頁面修改或看到。
 */
const _copyCheckoutSession = (session) => JSON.parse(JSON.stringify(session));

/**
 * 讀寫獨立的 Checkout Mock 紀錄，不與 Legacy mockOrders 混用。
 */
const _getMockCheckoutRecords = () => _readJsonStorage(MOCK_CHECKOUT_SESSIONS_KEY, []);

const _saveMockCheckoutRecords = (records) => {
  _writeJsonStorage(MOCK_CHECKOUT_SESSIONS_KEY, records);
};

/**
 * 統一付款方式；後端未提供時預設 ecpay-credit。
 */
const _normalizeCheckoutPaymentMethod = (value) => {
  const paymentMethod = value == null || String(value).trim() === ''
    ? 'ecpay-credit'
    : String(value).trim();

  if (!CHECKOUT_PAYMENT_METHODS.includes(paymentMethod)) {
    throw _checkoutMockError(
      'VALIDATION_ERROR',
      `Unsupported paymentMethod: ${paymentMethod}`,
      400
    );
  }

  return paymentMethod;
};

/**
 * 合併重複 variant 並固定排序，對齊後端的 Checkout 正規化方式。
 */
const _normalizeCheckoutItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw _checkoutMockError('VALIDATION_ERROR', 'items are required', 400);
  }

  const quantities = new Map();
  items.forEach((item) => {
    const variantId = String(item?.variantId || '').trim();
    const quantity = Number(item?.quantity);

    if (!variantId || !Number.isInteger(quantity) || quantity < 1) {
      throw _checkoutMockError(
        'VALIDATION_ERROR',
        'Each checkout item requires variantId and a positive quantity',
        400
      );
    }

    quantities.set(variantId, (quantities.get(variantId) || 0) + quantity);
  });

  return [...quantities.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([variantId, quantity]) => ({ variantId, quantity }));
};

/**
 * 將 Request 轉為穩定字串，支援相同冪等鍵的回放與衝突判斷。
 */
const _checkoutRequestFingerprint = (items, paymentMethod, shipping) => JSON.stringify({
  items,
  paymentMethod,
  shipping: {
    recipientName: String(shipping?.recipientName || '').trim(),
    phone: String(shipping?.phone || '').trim(),
    address: String(shipping?.address || '').trim(),
  },
});

/**
 * 使用 Mock 商品契約建立後端 Checkout item 快照與金額。
 */
const _buildMockCheckoutItems = async (requestedItems) => {
  const products = await _loadProductsRaw();
  let subtotalCents = 0;
  const snapshots = requestedItems.map((requested, index) => {
    let matchedProduct = null;
    let matchedVariant = null;

    for (const product of products) {
      const variant = product.variants.find((item) => item.id === requested.variantId);
      if (variant) {
        matchedProduct = product;
        matchedVariant = variant;
        break;
      }
    }

    if (!matchedProduct || !matchedVariant) {
      throw _checkoutMockError(
        'VARIANT_NOT_SELLABLE',
        `Variant not sellable: ${requested.variantId}`,
        409
      );
    }

    const unitPriceCents = Math.round(Number(matchedVariant.price) * 100);
    const lineTotalCents = unitPriceCents * requested.quantity;
    subtotalCents += lineTotalCents;

    return {
      orderItemId: index + 1,
      productId: matchedProduct.id,
      variantId: matchedVariant.id,
      sku: matchedVariant.sku,
      productName: matchedProduct.name,
      specification: matchedVariant.specification,
      brandName: matchedProduct.brand || '',
      imageUrl: matchedProduct.image,
      unitPrice: (unitPriceCents / 100).toFixed(2),
      quantity: requested.quantity,
      lineTotal: (lineTotalCents / 100).toFixed(2),
    };
  });

  return { snapshots, subtotalCents };
};

/**
 * 建立 Mock orderId；只需符合 CheckoutSession 字串識別碼契約。
 */
const _newMockCheckoutId = () => {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 10).toUpperCase();

  return `O-MOCK-${time}-${random}`;
};

/**
 * 取得 Mock Checkout 紀錄；不存在時使用與後端一致的 NOT_FOUND 錯誤。
 */
const _findMockCheckoutRecord = (orderId) => {
  const customerId = _getMockCheckoutCustomerId();
  const records = _getMockCheckoutRecords();
  const record = records.find((item) => (
    item.customerId === customerId && item.session?.orderId === orderId
  ));

  if (!record) {
    throw _checkoutMockError('NOT_FOUND', 'Checkout session not found', 404);
  }

  return { record, records };
};

/**
 * 更新指定 Mock 紀錄並寫回 localStorage。
 */
const _replaceMockCheckoutRecord = (records, nextRecord) => {
  const next = records.map((item) => (
    item.session?.orderId === nextRecord.session.orderId ? nextRecord : item
  ));

  _saveMockCheckoutRecords(next);
};

/**
 * 檢查 Mock Checkout 是否仍可更新或操作。
 */
const _assertMockCheckoutActive = (record) => {
  if (record.session.status === 'cancelled') {
    throw _checkoutMockError('CONFLICT', 'Checkout is cancelled or expired', 409);
  }

  if (new Date(record.session.checkoutExpiresAt).getTime() <= Date.now()) {
    throw _checkoutMockError('CHECKOUT_EXPIRED', 'Checkout is expired', 409);
  }
};

/**
 * Mock Checkout adapter 回傳與 Spring Boot 完全相同的 CheckoutSession 形狀。
 */
const checkoutMockAdapter = {
  createSession: async (request) => {
    const idempotencyKey = String(request?.idempotencyKey || '').trim();
    if (!idempotencyKey || idempotencyKey.length > 128) {
      throw _checkoutMockError(
        'VALIDATION_ERROR',
        'idempotencyKey is required and must not exceed 128 characters',
        400
      );
    }

    const items = _normalizeCheckoutItems(request?.items);
    const paymentMethod = _normalizeCheckoutPaymentMethod(request?.paymentMethod);
    const shippingInput = request?.shipping || {};
    const fingerprint = _checkoutRequestFingerprint(items, paymentMethod, shippingInput);
    const customerId = _getMockCheckoutCustomerId();
    const records = _getMockCheckoutRecords();
    const replay = records.find((item) => (
      item.customerId === customerId && item.idempotencyKey === idempotencyKey
    ));

    if (replay) {
      if (replay.fingerprint !== fingerprint) {
        throw _checkoutMockError(
          'CONFLICT',
          'Idempotency key was already used with a different checkout request',
          409
        );
      }

      return _copyCheckoutSession(replay.session);
    }

    const user = window.AppState?.currentUser || {};
    const recipientName = String(
      shippingInput.recipientName || user.name || user.displayName || MOCK_CHECKOUT_PENDING
    ).trim();
    const phone = String(shippingInput.phone || user.phone || MOCK_CHECKOUT_PENDING).trim();
    const shippingMethod = shippingInput.method === 'pickup' ? 'pickup' : 'delivery';
    const pickupBranchId = shippingMethod === 'pickup'
      ? String(shippingInput.pickupBranchId || '').trim()
      : null;
    const branch = pickupBranchId
      ? (await window.API.branches.getAll()).find(item => item.id === pickupBranchId)
      : null;
    const address = String(branch?.address || shippingInput.address || MOCK_CHECKOUT_PENDING).trim();
    const checkoutItems = await _buildMockCheckoutItems(items);
    const subtotal = (checkoutItems.subtotalCents / 100).toFixed(2);
    const ready = [recipientName, phone, address]
      .every((value) => value && value !== MOCK_CHECKOUT_PENDING);
    const session = {
      orderId: _newMockCheckoutId(),
      paymentStatus: 'unpaid',
      paymentMethod,
      status: 'unshipped',
      checkoutExpiresAt: new Date(Date.now() + MOCK_CHECKOUT_HOLD_MS).toISOString(),
      pricing: {
        subtotal,
        shippingFee: '0.00',
        discount: '0.00',
        total: subtotal,
      },
      items: checkoutItems.snapshots,
      shipping: {
        method: shippingMethod,
        recipientName,
        phone,
        address,
        pickupBranchId,
        pickupBranchName: branch?.name || null,
      },
      couponClaimId: null,
      checkoutStep: ready ? 'ready_to_pay' : 'draft',
    };

    records.push({ customerId, idempotencyKey, fingerprint, session });
    _saveMockCheckoutRecords(records);

    return _copyCheckoutSession(session);
  },

  getSession: async (orderId) => {
    const result = _findMockCheckoutRecord(orderId);

    return _copyCheckoutSession(result.record.session);
  },

  updateSession: async (orderId, request) => {
    const result = _findMockCheckoutRecord(orderId);
    const next = _copyCheckoutSession(result.record.session);
    _assertMockCheckoutActive(result.record);

    if (request?.couponClaimId != null) {
      throw _checkoutMockError(
        'VALIDATION_ERROR',
        'couponClaimId is not supported until the coupon checkout flow is implemented',
        400
      );
    }

    const shipping = request?.shipping;
    const hasShipping = shipping && ['recipientName', 'phone', 'address']
      .some((field) => shipping[field] != null);
    const hasPaymentMethod = request?.paymentMethod != null;
    if (!hasShipping && !hasPaymentMethod) {
      throw _checkoutMockError(
        'VALIDATION_ERROR',
        'At least one shipping field or paymentMethod is required',
        400
      );
    }

    if (hasPaymentMethod) {
      if (String(request.paymentMethod).trim() === '') {
        throw _checkoutMockError('VALIDATION_ERROR', 'paymentMethod must not be blank', 400);
      }

      next.paymentMethod = _normalizeCheckoutPaymentMethod(request.paymentMethod);
    }

    if (hasShipping) {
      ['recipientName', 'phone', 'address'].forEach((field) => {
        if (shipping[field] == null) {
          return;
        }

        const value = String(shipping[field]).trim();
        if (!value) {
          throw _checkoutMockError('VALIDATION_ERROR', `${field} must not be blank`, 400);
        }

        next.shipping[field] = value;
      });
    }

    next.checkoutStep = ['recipientName', 'phone', 'address'].map(field => next.shipping[field])
      .every((value) => value && value !== MOCK_CHECKOUT_PENDING)
      ? 'ready_to_pay'
      : 'draft';
    const nextRecord = { ...result.record, session: next };
    _replaceMockCheckoutRecord(result.records, nextRecord);

    return _copyCheckoutSession(next);
  },

  cancelSession: async (orderId) => {
    const result = _findMockCheckoutRecord(orderId);
    if (result.record.session.status === 'cancelled') {
      return _copyCheckoutSession(result.record.session);
    }

    _assertMockCheckoutActive(result.record);

    const next = {
      ...result.record.session,
      status: 'cancelled',
    };
    _replaceMockCheckoutRecord(result.records, { ...result.record, session: next });

    return _copyCheckoutSession(next);
  },

  confirmCod: async (orderId) => {
    const result = _findMockCheckoutRecord(orderId);
    _assertMockCheckoutActive(result.record);
    if (result.record.session.paymentMethod !== 'cod') {
      throw _checkoutMockError('CONFLICT', 'Only COD checkout can be confirmed here', 409);
    }
    const next = {
      ...result.record.session,
      checkoutExpiresAt: null,
      checkoutStep: 'completed',
    };
    _replaceMockCheckoutRecord(result.records, { ...result.record, session: next });
    return _copyCheckoutSession(next);
  },

  createEcpayForm: async () => {
    throw _checkoutMockError(
      'PAYMENT_NOT_IMPLEMENTED',
      'ECPay form creation waits for Payment line D',
      501
    );
  },
};

window.API = {
  /**
   * 真後端共用請求入口；頁面應呼叫領域方法，不自行 fetch。
   */
  _restRequest: window.ApiClient._restRequest,

  /** @deprecated 請用 MockDataPaths / API 方法 */
  _getDataPath() {
    return '/data';
  },

  products: {
    /**
     * B-3 contract-aware list API. Returns { data, meta }; callers that need
     * the old all-products array should continue using getAll during migration.
     */
    getPage: async (options = {}) => {
      const [result, reviews, orders] = await Promise.all([
        _loadProductPage(options),
        _useMockApi() ? _loadReviews() : Promise.resolve([]),
        _useMockApi() ? _loadOrdersSeed() : Promise.resolve([]),
      ]);
      return {
        data: await Promise.all(result.data.map((product) => _enrichProduct(product, reviews, orders))),
        meta: result.meta,
      };
    },

    /**
     * 列表：契約 v0.4 欄位 + UI enrich。
     * rating／reviewCount 是正式契約欄位；ratingDisplay 等仍是展示衍生值。
     */
    getAll: async (filters = {}) => {
      const [raw, reviews, orders] = await Promise.all([
        _loadProductsRaw(),
        _useMockApi() ? _loadReviews() : Promise.resolve([]),
        _useMockApi() ? _loadOrdersSeed() : Promise.resolve([]),
      ]);
      let products = raw.filter((p) => p.status === 'active');
      products = await Promise.all(products.map((p) => _enrichProduct(p, reviews, orders)));

      if (filters.category) products = products.filter((p) => p.category === filters.category);
      // 契約 price 是字串；篩選／UI 用 Number
      if (filters.minPrice != null) {
        products = products.filter((p) => Number(p.price) >= filters.minPrice);
      }
      if (filters.maxPrice != null) {
        products = products.filter((p) => Number(p.price) <= filters.maxPrice);
      }
      if (filters.brand) products = products.filter((p) => p.brand === filters.brand);
      return products;
    },

    getById: async (productId) => {
      // REST 詳情：直接打 /products/{id}（Envelope 已在 _loadMockOrRest 解開）
      // Mock：從正規化後的列表找
      let product;
      if (!_useMockApi()) {
        product = await _loadMockOrRest('products', `/products/${encodeURIComponent(productId)}`);
        product = _readProductContract(product);
      } else {
        const raw = await _loadProductsRaw();
        product = raw.find((p) => p.id === productId) || null;
      }
      if (!product) throw new Error('Product not found');
      const [reviews, orders] = await Promise.all([
        _useMockApi() ? _loadReviews() : Promise.resolve([]),
        _useMockApi() ? _loadOrdersSeed() : Promise.resolve([]),
      ]);
      return _enrichProduct(product, reviews, orders);
    },

    getReviews: async (productId, options = {}) => {
      const page = Number.isInteger(options.page) ? options.page : 0;
      const size = Number.isInteger(options.size) ? options.size : 20;
      const sort = options.sort || 'latest';
      const rating = Number.isInteger(options.rating) ? options.rating : null;
      const hasPhotos = options.hasPhotos === true;
      if (!_useMockApi()) {
        const query = new URLSearchParams({ page, size, sort, hasPhotos });
        if (rating !== null) query.set('rating', rating);
        const response = await window.ApiClient._restRequest(
          `/products/${encodeURIComponent(productId)}/reviews?${query}`,
          { auth: 'none', includeMeta: true }
        );
        return {
          items: response.data?.items || [],
          summary: response.data?.summary || {
            totalCount: 0,
            averageRating: 0,
            ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          },
          meta: response.meta,
        };
      }
      const reviews = await _loadReviews();
      const matching = reviews.filter((r) => r.productId === productId);
      const filtered = matching.filter((review) => {
        if (rating !== null && Number(review.rating) !== rating) return false;
        if (hasPhotos && (!Array.isArray(review.photos) || review.photos.length === 0)) return false;
        return true;
      });
      const sorted = filtered.slice().sort((a, b) => {
        if (sort === 'highest' && b.rating !== a.rating) return b.rating - a.rating;
        if (sort === 'lowest' && a.rating !== b.rating) return a.rating - b.rating;
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });
      const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      matching.forEach((review) => {
        if (ratingCounts[review.rating] !== undefined) ratingCounts[review.rating] += 1;
      });
      const totalCount = matching.length;
      const filteredCount = filtered.length;
      return {
        items: sorted.slice(page * size, page * size + size),
        summary: {
          totalCount,
          averageRating:
            totalCount === 0
              ? 0
              : Number(
                  (matching.reduce((sum, review) => sum + Number(review.rating || 0), 0) / totalCount).toFixed(2)
                ),
          ratingCounts,
        },
        meta: {
          page,
          size,
          totalElements: filteredCount,
          totalPages: filteredCount === 0 ? 0 : Math.ceil(filteredCount / size),
        },
      };
    },

    getNewest: async (limit = 12) => {
      if (!_useMockApi()) {
        // 正式模式由後端依 products.created_at 排序，不再用商品 ID 猜測上架先後。
        const result = await window.API.products.getPage({
          page: 0,
          size: limit,
          sort: 'createdAt,desc',
        });
        return result.data;
      }

      // Mock 沒有上架時間欄位，僅保留既有 ID 排序供離線展示。
      const all = await window.API.products.getAll();
      return all
        .slice()
        .sort((a, b) => {
          const na = parseInt(String(a.id).replace(/\D/g, ''), 10) || 0;
          const nb = parseInt(String(b.id).replace(/\D/g, ''), 10) || 0;
          return nb - na;
        })
        .slice(0, limit);
    },

    getBestsellers: async (limit = 20) => {
      if (!_useMockApi()) {
        // 正式模式由後端依訂單銷量排序，首頁不再讀取受保護的訂單端點。
        const raw = await window.ApiClient._restRequest(
          `/products/bestsellers?limit=${encodeURIComponent(limit)}`,
          { auth: 'none' }
        );
        return Promise.all(
          (raw || []).map((product) => _enrichProduct(_readProductContract(product), [], []))
        );
      }

      const all = await window.API.products.getAll();
      return all
        .filter((product) => product.tags.includes('熱銷'))
        .slice()
        .sort((a, b) => {
          if (b.salesCount !== a.salesCount) return b.salesCount - a.salesCount;
          return (b.reviewCount || 0) - (a.reviewCount || 0);
        })
        .slice(0, limit);
    },

    getCategories: async () => {
      const products = await _loadProductsRaw();
      return [...new Set(products.map((p) => p.category))];
    },
  },

  checkout: {
    // 建立 Checkout；Mock 與 Backend 都回傳 CheckoutSession。
    createSession: async (request) => _runCheckoutAction(() => (
      _useMockApi()
        ? checkoutMockAdapter.createSession(request)
        : _checkoutRestRequest('/checkout/sessions', {
          method: 'POST',
          body: request,
        })
    )),

    // 取得會員自己的 Checkout Session。
    getSession: async (orderId) => _runCheckoutAction(() => (
      _useMockApi()
        ? checkoutMockAdapter.getSession(String(orderId || '').trim())
        : _checkoutRestRequest(_checkoutOrderPath(orderId), {
          method: 'GET',
        })
    )),

    // 更新會員自己的收件資料與付款方式。
    updateSession: async (orderId, request) => _runCheckoutAction(() => (
      _useMockApi()
        ? checkoutMockAdapter.updateSession(String(orderId || '').trim(), request)
        : _checkoutRestRequest(_checkoutOrderPath(orderId), {
          method: 'PATCH',
          body: request,
        })
    )),

    // 主動取消未付款 Checkout 並釋放庫存。
    cancelSession: async (orderId) => _runCheckoutAction(() => (
      _useMockApi()
        ? checkoutMockAdapter.cancelSession(String(orderId || '').trim())
        : _checkoutRestRequest(
          `${_checkoutOrderPath(orderId)}/cancel`,
          { method: 'POST' }
        )
    ), true),

    // 確認商城 COD；後端 Payment 線完成前端點可能尚不可用。
    confirmCod: async (orderId) => _runCheckoutAction(() => (
      _useMockApi()
        ? checkoutMockAdapter.confirmCod(orderId)
        : _checkoutRestRequest(
          `${_checkoutOrderPath(orderId)}/confirm-cod`,
          { method: 'POST' }
        )
    )),

    // 取得 ECPay 表單；後端 Payment 線完成前端點可能尚不可用。
    createEcpayForm: async (orderId) => _runCheckoutAction(() => (
      _useMockApi()
        ? checkoutMockAdapter.createEcpayForm(orderId)
        : _checkoutRestRequest(
          `${_checkoutOrderPath(orderId)}/ecpay`,
          { method: 'POST' }
        )
    )),
  },

  orders: {
    getAll: async () => {
      if (!_useMockApi()) {
        const orders = await window.ApiClient._restRequest('/me/orders', {
          auth: 'required',
        });

        return (orders || []).map(_normalizeOrder);
      }

      const seed = await _loadOrdersSeed();
      return _mergeOrders(seed, _getStoredOrders()).map(_normalizeOrder);
    },

    getByCustomerId: async (customerId, status = null) => {
      let orders = await window.API.orders.getAll();

      // Backend 的會員身分由 Firebase Principal 決定，不信任前端傳入的 customerId。
      if (_useMockApi()) {
        orders = orders.filter((o) => o.customerId === customerId);
      }
      if (status) orders = orders.filter((o) => o.status === status);
      return orders;
    },

    create: async (orderData) => {
      if (!_useMockApi()) {
        throw new window.ApiRequestError(
          'LEGACY_ORDER_CREATE_DISABLED',
          'Legacy orders.create() is disabled when USE_MOCK_API=false'
        );
      }

      const customerId = orderData && orderData.customerId
        ? String(orderData.customerId).trim()
        : '';
      if (!customerId) {
        throw new window.ApiRequestError(
          'VALIDATION_ERROR',
          '建立訂單需要真實 customerId（已移除 U001 fallback）',
          [],
          400
        );
      }

      const seed = await _loadOrdersSeed();
      const stored = _getStoredOrders();
      const merged = _mergeOrders(seed, stored);
      const nextId = orderData.id != null ? Number(orderData.id) : _getNextOrderId(merged);
      const subtotal = Number(orderData.subtotal) || 0;
      const points = window.calculateOrderRewardPoints(subtotal);

      const newOrder = _normalizeOrder({
        id: nextId,
        customerId,
        buyerName: orderData.buyerName || '',
        buyerPhone: orderData.buyerPhone || '',
        buyerEmail: orderData.buyerEmail || '',
        userNote: orderData.userNote || orderData.buyerNote || '',
        items: orderData.items || [],
        subtotal,
        points,
        pointsAwarded: false,
        shippingFee: Number(orderData.shippingFee) || 0,
        coupons: orderData.coupons,
        discount: Number(orderData.discount) || 0,
        total: Number(orderData.total) || 0,
        status: orderData.status || 'unshipped',
        shippingMethod: orderData.shippingMethod || 'delivery',
        address: orderData.address || '',
        // payment = 付款方式；paymentStatus = unpaid|paid|refunded（COD → unpaid）
        payment: orderData.payment || 'ecpay-credit',
        paymentStatus:
          orderData.paymentStatus ||
          (orderData.payment === 'cod' ? 'unpaid' : 'paid'),
        createdAt: orderData.createdAt || _formatLocalDateTime(),
        deliveredAt: '',
        trackingNumber: '',
        reviewed: false,
        history: [{ time: _formatLocalDateTime(), action: '訂單產生' }],
      });

      const orders = [...stored.filter((o) => o.id !== newOrder.id), newOrder];
      _writeJsonStorage(MOCK_ORDERS_KEY, orders);
      return newOrder;
    },

    markReviewed: async (orderId) => {
      const stored = _getStoredOrders();
      const idx = stored.findIndex((o) => o.id === orderId);
      if (idx >= 0) {
        stored[idx].reviewed = true;
        _writeJsonStorage(MOCK_ORDERS_KEY, stored);
      }
    },

    awardPointsIfCompleted: async (order) => {
      // 正式模式的點數與訂單狀態只能由後端交易處理。
      if (!_useMockApi()) return;
      if (!order || order.status !== 'completed' || order.pointsAwarded) return;
      if (order.points > 0 && order.customerId) {
        await customersApi.addPoints(order.customerId, order.points);
      }
      const stored = _getStoredOrders();
      const idx = stored.findIndex((o) => o.id === order.id);
      if (idx >= 0) {
        stored[idx].pointsAwarded = true;
        _writeJsonStorage(MOCK_ORDERS_KEY, stored);
      }
    },
  },

  customers: customersApi,
  users: customersApi,
  shippingAddresses: memberShippingAddressesApi,

  coupons: {
    getAll: async () => _loadMockOrRest('coupons', '/coupons'),

    // 正式模式讀取登入會員已領取的優惠券；Mock 維持既有前端試算流程。
    getMine: async () => {
      if (_useMockApi()) return [];

      return window.ApiClient._restRequest('/me/coupons', {
        auth: 'required',
      });
    },

    // 正式模式依優惠券主檔 ID 領券，取得 Checkout 所需的 couponClaimId。
    claim: async (couponId) => {
      const normalizedCouponId = Number(couponId);
      if (!Number.isInteger(normalizedCouponId) || normalizedCouponId <= 0) {
        throw new window.ApiRequestError(
          'VALIDATION_ERROR',
          'couponId must be a positive integer',
          [],
          400
        );
      }
      if (_useMockApi()) {
        throw new window.ApiRequestError(
          'COUPON_BACKEND_ONLY',
          'Coupon claims are only available in Backend mode'
        );
      }

      return window.ApiClient._restRequest('/me/coupons/claims', {
        method: 'POST',
        auth: 'required',
        body: { couponId: normalizedCouponId },
      });
    },

    // 會員中心正式模式顯示本人 claims；Mock 才沿用前端資格篩選。
    getMemberCenter: async (customerId) => {
      if (_useMockApi()) {
        return window.API.coupons.getAvailable(customerId);
      }

      const claims = await window.API.coupons.getMine();

      return (claims || []).map(_toMemberCouponCard);
    },

    // 會員中心列表：僅 birthday + firstPurchase（promotion 活動碼只在結帳輸入）
    // Member center list: birthday + firstPurchase only (promotion codes are checkout-entry)
    getAvailable: async (customerId) => {
      const [coupons, customer] = await Promise.all([
        window.API.coupons.getAll(),
        customersApi.getById(customerId),
      ]);
      const now = new Date();
      return coupons.filter((c) => {
        if (c.status !== 'active') return false;
        if (c.category === 'birthday') {
          const bMonth = parseInt(String(customer.birthday).slice(5, 7), 10);
          return bMonth === now.getMonth() + 1;
        }
        if (c.category === 'firstPurchase') return !customer.firstPurchaseUsed;
        // 排除 promotion 等其他類別 / Exclude promotion and other categories
        return false;
      });
    },
  },

  reviews: {
    getAll: async () => {
      if (!_useMockApi()) {
        return window.ApiClient._restRequest('/me/reviews', { auth: 'required' });
      }
      return _loadReviews();
    },

    create: async (payload) => {
      if (!_useMockApi()) {
        return window.ApiClient._restRequest('/me/reviews', {
          method: 'POST',
          auth: 'required',
          body: {
            orderItemId: payload.orderItemId,
            rating: payload.rating,
            comment: payload.comment || null,
            photoUrls: Array.isArray(payload.photoUrls) ? payload.photoUrls : [],
          },
        });
      }
      const orderItemId = Number(payload.orderItemId);
      if (!Number.isInteger(orderItemId) || orderItemId <= 0) {
        throw new Error('orderItemId is required');
      }
      const orders = await _loadOrdersSeed();
      let purchase = null;
      for (const order of orders) {
        const item = (order.items || []).find((candidate) => candidate.orderItemId === orderItemId);
        if (item) {
          if (purchase) throw new Error('orderItemId is ambiguous');
          purchase = { order, item };
        }
      }
      if (!purchase) throw new Error('orderItemId does not identify a purchased item');
      const existing = await _loadReviews();
      if (existing.some((review) => Number(review.orderItemId) === orderItemId)) {
        throw new Error('This order item was already reviewed');
      }
      const review = {
        id: 'REV-M-' + Date.now(),
        orderItemId,
        customerId: purchase.order.customerId,
        productId: purchase.item.productId,
        variantId: purchase.item.variantId,
        sku: purchase.item.sku,
        orderId: purchase.order.id,
        buyerName: purchase.order.buyerName,
        productName: purchase.item.name,
        rating: payload.rating,
        comment: payload.comment || '',
        photos: Array.isArray(payload.photoUrls) ? payload.photoUrls : [],
        createdAt: _formatLocalDateTime(),
        verifiedPurchase: true,
      };
      const mock = _readJsonStorage(MOCK_REVIEWS_KEY, []);
      mock.push(review);
      _writeJsonStorage(MOCK_REVIEWS_KEY, mock);
      reviewsCache = null;
      await window.API.orders.markReviewed(purchase.order.id);
      return review;
    },

    uploadPhotos: async (orderItemId, files) => {
      if (_useMockApi()) {
        return Array.from(files || []).map((file) => URL.createObjectURL(file));
      }
      const form = new FormData();
      Array.from(files || []).forEach((file) => form.append('files', file));
      const result = await window.ApiClient._restRequest(
        `/me/reviews/photos?orderItemId=${encodeURIComponent(orderItemId)}`,
        { method: 'POST', auth: 'required', body: form }
      );
      return result?.urls || [];
    },

    update: async (reviewId, payload) => {
      if (!_useMockApi()) {
        return window.ApiClient._restRequest(`/me/reviews/${encodeURIComponent(reviewId)}`, {
          method: 'PATCH',
          auth: 'required',
          body: {
            rating: payload.rating,
            comment: payload.comment || null,
            photoUrls: Array.isArray(payload.photoUrls) ? payload.photoUrls : [],
          },
        });
      }
      const mock = _readJsonStorage(MOCK_REVIEWS_KEY, []);
      const index = mock.findIndex((review) => review.id === reviewId);
      if (index < 0) throw new Error('Review not found');
      mock[index] = {
        ...mock[index],
        rating: payload.rating,
        comment: payload.comment || '',
        photos: Array.isArray(payload.photoUrls) ? payload.photoUrls : [],
      };
      _writeJsonStorage(MOCK_REVIEWS_KEY, mock);
      reviewsCache = null;
      return mock[index];
    },

    delete: async (reviewId) => {
      if (!_useMockApi()) {
        return window.ApiClient._restRequest(`/me/reviews/${encodeURIComponent(reviewId)}`, {
          method: 'DELETE',
          auth: 'required',
        });
      }
      const mock = _readJsonStorage(MOCK_REVIEWS_KEY, []);
      _writeJsonStorage(
        MOCK_REVIEWS_KEY,
        mock.filter((review) => review.id !== reviewId)
      );
      reviewsCache = null;
      return null;
    },
  },

  articles: {
    getAll: async () => _loadMockOrRest('articles', '/articles'),
    getById: async (id) => {
      const articles = await window.API.articles.getAll();
      const article = articles.find((a) => a.id === id);
      if (!article) throw new Error('Article not found');
      return article;
    },
  },

  branches: {
    getAll: async () => _loadMockOrRest('branches', '/branches'),
  },

  marketing: {
    // 合作品牌是公開內容，不附帶登入 Token，避免失效 Session 阻斷首頁。
    getBrands: async () => {
      if (_useMockApi()) {
        return _fetchJson(_path('brands'));
      }

      return window.ApiClient._restRequest('/brands', { auth: 'none' });
    },
  },

  handleError: (error) => ({
    success: false,
    message: error.message || 'An error occurred',
    status: error.status || 500,
  }),
};

console.log('✓ Mock API 層已初始化（整合版）');
