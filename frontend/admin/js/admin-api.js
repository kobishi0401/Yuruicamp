/**
 * admin/js/admin-api.js
 * 後台 REST API 抽象層；正式開關由 admin-runtime.js 依 AppConfig 統一設定。
 *
 * 使用方式：
 *   1. AppConfig.USE_MOCK_API=true：保留 Mock adapter。
 *   2. AppConfig.USE_MOCK_API=false：由 AdminRuntime 啟用正式後端與 readiness gate。
 *
 * 各模組在修改 cache 後呼叫對應方法，例如：
 *   AdminAPI.orders.updateStatus(orderId, payload).catch(handleApiError);
 */

(function (global) {
  'use strict';

  var config = {
    /** true 時才真的 fetch；false 僅保留接口、方便之後替換 */
    useBackend: false,
    baseUrl: '/api/admin',
    /** Mock 模式下是否在 console 記錄（開發除錯用） */
    logMockCalls: false
  };

  /**
   * 通用 HTTP 請求
   * @param {string} method
   * @param {string} path - 例如 '/orders/1'
   * @param {Object|null} body
   * @returns {Promise<Object>}
   */
  function request(method, path, body, includeMeta) {
    if (!config.useBackend) {
      if (config.logMockCalls && global.console && global.console.debug) {
        global.console.debug('[AdminAPI mock]', method, path, body || '');
      }
      return Promise.resolve({
        ok: true,
        mock: true,
        data: body || null
      });
    }

    var backendBase = config.baseUrl;
    if (backendBase === '/api/admin' && global.AppConfig && global.AppConfig.API_BASE_URL) {
      backendBase = global.AppConfig.API_BASE_URL.replace(/\/$/, '') + '/admin';
    }

    // 走 main 的 ApiClient（Bearer 由 AppAuth / Firebase 注入提供）
    return global.ApiClient._restRequest(path, {
      method: method,
      auth: 'required',
      baseUrl: backendBase,
      credentials: 'same-origin',
      body: body !== undefined && body !== null && method !== 'GET' && method !== 'HEAD'
        ? body
        : undefined,
      includeMeta: includeMeta === true
    }).then(function (data) {
      if (includeMeta === true) {
        return { ok: true, data: data.data, meta: data.meta };
      }
      return { ok: true, data: data };
    });
  }

  /** 正式模式遇到未實作功能時直接拒絕，不發出必然 404 的請求。 */
  function unsupported(feature, message, mockCall) {
    if (!config.useBackend && typeof mockCall === 'function') {
      return mockCall();
    }
    var error = global.ApiRequestError
      ? new global.ApiRequestError('ADMIN_FEATURE_NOT_READY', message, [{ field: 'feature', reason: feature }], 501)
      : new Error(message);
    return Promise.reject(error);
  }

  /** 統一錯誤提示（各模組可選用） */
  function handleError(err, fallbackMessage) {
    var msg = (err && err.message) || fallbackMessage || '操作失敗，請稍後再試';
    if (typeof global.showAdminToast === 'function') {
      global.showAdminToast(msg, 'danger');
    }
    if (global.console && global.console.error) {
      global.console.error('[AdminAPI]', err);
    }
  }

  var AdminAPI = {
    configure: function (opts) {
      if (!opts || typeof opts !== 'object') {
        return;
      }
      if (typeof opts.useBackend === 'boolean') {
        config.useBackend = opts.useBackend;
      }
      if (typeof opts.baseUrl === 'string' && opts.baseUrl) {
        config.baseUrl = opts.baseUrl;
      }
      if (typeof opts.logMockCalls === 'boolean') {
        config.logMockCalls = opts.logMockCalls;
      }
    },

    isBackendEnabled: function () {
      return config.useBackend === true;
    },

    handleError: handleError,

    auth: {
      /** 使用 Firebase ID Token 建立或刷新後台 Session 與有效權限。 */
      establishSession: function (idToken) {
        return global.ApiClient._restRequest('/admin/auth/firebase/session', {
          method: 'POST',
          auth: 'none',
          body: { idToken: idToken },
        }).then(function (data) {
          return { ok: true, data: data };
        });
      }
    },

    // ── 管理員與細權限 / Admin users and RBAC ──
    users: {
      list: function (page, size) {
        return request('GET', '/users?page=' + (page || 0) + '&size=' + (size || 100));
      },
      getById: function (adminUserId) {
        return request('GET', '/users/' + encodeURIComponent(adminUserId));
      },
      create: function (payload) {
        return request('POST', '/users', payload);
      },
      update: function (adminUserId, payload) {
        return request('PATCH', '/users/' + encodeURIComponent(adminUserId), payload);
      },
      updatePermissions: function (adminUserId, permissions) {
        return request('PUT', '/users/' + encodeURIComponent(adminUserId) + '/permissions', {
          permissions: permissions
        });
      }
    },

    permissions: {
      list: function () {
        return request('GET', '/permissions');
      }
    },

    // ── 客戶 / Customers ──
    customers: {
      /** GET /api/admin/customers */
      list: function (query) {
        var params = new URLSearchParams(query || {});
        var suffix = params.toString() ? '?' + params.toString() : '';
        return request('GET', '/customers' + suffix);
      },
      /** GET /api/admin/customers/:id */
      getById: function (customerId) {
        return request('GET', '/customers/' + encodeURIComponent(customerId));
      },
      /** POST /api/admin/customers */
      create: function (customer) {
        return unsupported('customers.create', '正式後端尚未開放由管理員建立會員', function () {
          return request('POST', '/customers', customer);
        });
      },
      /** PATCH /api/admin/customers/:id */
      update: function (customerId, changes) {
        return request('PATCH', '/customers/' + encodeURIComponent(customerId), changes);
      },
      /** POST /api/admin/customers/:id/suspend */
      suspend: function (customerId) {
        return request('POST', '/customers/' + encodeURIComponent(customerId) + '/suspend');
      },
      /** POST /api/admin/customers/:id/reactivate */
      reactivate: function (customerId) {
        return request('POST', '/customers/' + encodeURIComponent(customerId) + '/reactivate');
      },
      /**
       * PUT /api/admin/customers/:id/tags — 完整集合取代標籤指派（W1-03）
       * @param {string} customerId
       * @param {number[]} tagIds
       */
      replaceTags: function (customerId, tagIds) {
        return request('PUT', '/customers/' + encodeURIComponent(customerId) + '/tags', {
          tagIds: Array.isArray(tagIds) ? tagIds : []
        });
      },
      /**
       * PUT /api/admin/customers/:id/default-shipping-address — 覆寫預設收件地址（W1-04）
       * Overwrite default shipping address; never touches order snapshots.
       */
      updateDefaultShippingAddress: function (customerId, address) {
        return request(
          'PUT',
          '/customers/' + encodeURIComponent(customerId) + '/default-shipping-address',
          address
        );
      },
      /**
       * PUT /api/admin/customers/:id/preferences — 完整集合取代偏好（W1-05）
       * @param {string} customerId
       * @param {number[]} optionIds
       */
      replacePreferences: function (customerId, optionIds) {
        return request('PUT', '/customers/' + encodeURIComponent(customerId) + '/preferences', {
          optionIds: Array.isArray(optionIds) ? optionIds : []
        });
      }
    },

    // ── 偏好選項 lookup（W1-05：唯讀；本季不做 CRUD）──
    preferenceOptions: {
      /** GET /api/admin/preference-options */
      list: function (query) {
        var params = new URLSearchParams();
        if (query && query.includeInactive) {
          params.set('includeInactive', 'true');
        }
        var suffix = params.toString() ? '?' + params.toString() : '';
        return request('GET', '/preference-options' + suffix);
      }
    },

    // ── 標籤池 / Tag pool（W1-02：/customer-tags；指派見 W1-03）──
    tags: {
      /** GET /api/admin/customer-tags */
      list: function (query) {
        var params = new URLSearchParams();
        if (query && query.includeInactive) {
          params.set('includeInactive', 'true');
        }
        var suffix = params.toString() ? '?' + params.toString() : '';
        return request('GET', '/customer-tags' + suffix);
      },
      /** GET /api/admin/customer-tags/:id */
      getById: function (tagId) {
        return request('GET', '/customer-tags/' + encodeURIComponent(tagId));
      },
      /** POST /api/admin/customer-tags */
      create: function (payload) {
        return request('POST', '/customer-tags', payload);
      },
      /** PATCH /api/admin/customer-tags/:id */
      update: function (tagId, payload) {
        return request('PATCH', '/customer-tags/' + encodeURIComponent(tagId), payload);
      },
      /** DELETE /api/admin/customer-tags/:id — 有指派時後端回 409 */
      remove: function (tagId) {
        return request('DELETE', '/customer-tags/' + encodeURIComponent(tagId));
      },
      /**
       * @deprecated Mock 整包覆寫；正式模式請改用 list／create／update／remove
       * Deprecated mock bulk save; use CRUD in backend mode.
       */
      savePool: function (tagColorMap) {
        return unsupported('customers.tagPool', '正式後端請改用 tags.create／update／remove', function () {
          return request('PUT', '/tag-pool', { tagColorMap: tagColorMap });
        });
      }
    },

    // ── 訂單 / Orders ──
    orders: {
      /** GET /api/admin/orders */
      list: function (query) {
        var search = new URLSearchParams();
        Object.keys(query || {}).forEach(function (key) {
          var value = query[key];
          (Array.isArray(value) ? value : [value]).forEach(function (item) {
            if (item !== undefined && item !== null && item !== '') search.append(key, item);
          });
        });
        var suffix = search.toString() ? '?' + search.toString() : '';
        return request('GET', '/orders' + suffix, null, true);
      },
      /** GET /api/admin/orders/:id */
      getById: function (orderId) {
        return request('GET', '/orders/' + encodeURIComponent(orderId));
      },
      /** PATCH /api/admin/orders/:id/internal-note — 內部備註覆寫 */
      updateInternalNote: function (orderId, internalNote) {
        return request('PATCH', '/orders/' + encodeURIComponent(orderId) + '/internal-note', {
          internalNote: internalNote == null ? '' : String(internalNote)
        });
      },
      /** @deprecated 請改用 updateInternalNote；Mock 模式仍接受 sellerNote payload */
      update: function (orderId, payload) {
        if (!config.useBackend) {
          return request('PATCH', '/orders/' + encodeURIComponent(orderId), payload);
        }
        var note = payload && Object.prototype.hasOwnProperty.call(payload, 'internalNote')
          ? payload.internalNote
          : (payload && payload.sellerNote);
        return request('PATCH', '/orders/' + encodeURIComponent(orderId) + '/internal-note', {
          internalNote: note == null ? '' : String(note)
        });
      },
      /** 語意化捷徑：出貨 */
      ship: function (orderId, payload) {
        return request('POST', '/orders/' + encodeURIComponent(orderId) + '/ship', payload || {});
      },
      /** 語意化捷徑：完成 */
      complete: function (orderId, payload) {
        return request('POST', '/orders/' + encodeURIComponent(orderId) + '/complete', payload || {});
      },
      /** W3-01／W3-02：未出貨取消（已付款線上單同交易退款） */
      cancel: function (orderId, payload) {
        return request('POST', '/orders/' + encodeURIComponent(orderId) + '/cancel', payload || {});
      }
    },

    // ── 預約 / Bookings ──
    bookings: {
      /** GET /api/admin/bookings */
      list: function (query) {
        var search = new URLSearchParams();
        Object.keys(query || {}).forEach(function (key) {
          var value = query[key];
          (Array.isArray(value) ? value : [value]).forEach(function (item) {
            if (item !== undefined && item !== null && item !== '') search.append(key, item);
          });
        });
        var suffix = search.toString() ? '?' + search.toString() : '';
        return request('GET', '/bookings' + suffix, null, true);
      },
      /** GET /api/admin/bookings/:id */
      getById: function (bookingId) {
        return request('GET', '/bookings/' + encodeURIComponent(bookingId));
      },
      /** PATCH /api/admin/bookings/:id/internal-note — 內部備註覆寫 */
      updateInternalNote: function (bookingId, internalNote) {
        return request('PATCH', '/bookings/' + encodeURIComponent(bookingId) + '/internal-note', {
          internalNote: internalNote == null ? '' : String(internalNote)
        });
      },
      /** @deprecated 請改用 updateInternalNote；Mock 模式仍接受 sellerNote payload */
      update: function (bookingId, payload) {
        if (!config.useBackend) {
          return request('PATCH', '/bookings/' + encodeURIComponent(bookingId), payload);
        }
        var note = payload && Object.prototype.hasOwnProperty.call(payload, 'internalNote')
          ? payload.internalNote
          : (payload && payload.sellerNote);
        return request('PATCH', '/bookings/' + encodeURIComponent(bookingId) + '/internal-note', {
          internalNote: note == null ? '' : String(note)
        });
      },
      /** POST /api/admin/bookings/:id/confirm */
      confirm: function (bookingId, payload) {
        return request('POST', '/bookings/' + encodeURIComponent(bookingId) + '/confirm', payload || {});
      },
      /** POST /api/admin/bookings/:id/complete */
      complete: function (bookingId, payload) {
        return request('POST', '/bookings/' + encodeURIComponent(bookingId) + '/complete', payload || {});
      },
      /** W3-03：已付款預約取消＋同交易退款 */
      cancel: function (bookingId, payload) {
        return request('POST', '/bookings/' + encodeURIComponent(bookingId) + '/cancel', payload || {});
      }
    },

    // ── 商品 / Products ──
    products: {
      /** GET /api/admin/products */
      list: function (query) {
        var params = new URLSearchParams(query || { page: 0, size: 100, sort: 'id,asc' });
        var suffix = params.toString() ? '?' + params.toString() : '';
        return request('GET', '/products' + suffix);
      },
      /** GET /api/admin/products/:id */
      getById: function (productId) {
        return request('GET', '/products/' + encodeURIComponent(productId));
      },
      /** GET /api/admin/products/lookups */
      getLookups: function () {
        return request('GET', '/products/lookups');
      },
      /** POST /api/admin/products */
      create: function (product) {
        return request('POST', '/products', product);
      },
      /** PUT /api/admin/products/:id */
      update: function (productId, product) {
        return request('PUT', '/products/' + encodeURIComponent(productId), product);
      },
      /** POST /api/admin/products/:id/activate */
      activate: function (productId) {
        return request('POST', '/products/' + encodeURIComponent(productId) + '/activate', {});
      },
      /** POST /api/admin/products/:id/deactivate */
      deactivate: function (productId) {
        return request('POST', '/products/' + encodeURIComponent(productId) + '/deactivate', {});
      },
      /**
       * Mock 專用：舊版租借庫存寫入。
       * 正式模式請改用 AdminAPI.rentals.*／inventoryConversions／listings。
       */
      updateRental: function (rentalId, rental) {
        return unsupported('products.rentalWrite', '正式模式請改用 AdminAPI.rentals 與 listings', function () {
          return request('PUT', '/rentals/' + encodeURIComponent(rentalId), rental);
        });
      }
    },

    // ── 分類主檔 / Categories（W2-01）──
    categories: {
      list: function () {
        return request('GET', '/categories');
      },
      getById: function (categoryId) {
        return request('GET', '/categories/' + encodeURIComponent(categoryId));
      },
      create: function (payload) {
        return request('POST', '/categories', payload);
      },
      update: function (categoryId, payload) {
        return request('PATCH', '/categories/' + encodeURIComponent(categoryId), payload);
      },
      remove: function (categoryId) {
        return request('DELETE', '/categories/' + encodeURIComponent(categoryId));
      }
    },

    // ── 品牌主檔 / Brands（W2-02）──
    brands: {
      list: function () {
        return request('GET', '/brands');
      },
      getById: function (brandId) {
        return request('GET', '/brands/' + encodeURIComponent(brandId));
      },
      create: function (payload) {
        return request('POST', '/brands', payload);
      },
      update: function (brandId, payload) {
        return request('PATCH', '/brands/' + encodeURIComponent(brandId), payload);
      },
      remove: function (brandId) {
        return request('DELETE', '/brands/' + encodeURIComponent(brandId));
      }
    },

    // ── 租借 SKU／上架 / Rentals（W2-03／04）──
    rentals: {
      /** GET /api/admin/rentals */
      list: function (query) {
        var params = new URLSearchParams(query || { page: 0, size: 100, sort: 'id,asc' });
        var suffix = params.toString() ? '?' + params.toString() : '';
        return request('GET', '/rentals' + suffix, null, true);
      },
      /** GET /api/admin/rentals/:id */
      getById: function (rentalId) {
        return request('GET', '/rentals/' + encodeURIComponent(rentalId));
      },
      /** POST /api/admin/rentals */
      create: function (payload) {
        return request('POST', '/rentals', payload);
      },
      /** PUT /api/admin/rentals/:id — SKU／規格主檔（不含庫存、不含定價） */
      update: function (rentalId, payload) {
        return request('PUT', '/rentals/' + encodeURIComponent(rentalId), payload);
      },
      activate: function (rentalId) {
        return request('POST', '/rentals/' + encodeURIComponent(rentalId) + '/activate', {});
      },
      deactivate: function (rentalId) {
        return request('POST', '/rentals/' + encodeURIComponent(rentalId) + '/deactivate', {});
      },
      /** GET /api/admin/rentals/:id/listings */
      listListings: function (rentalId) {
        return request('GET', '/rentals/' + encodeURIComponent(rentalId) + '/listings');
      },
      /** PUT /api/admin/rentals/:id/listings — 整組取代上架／定價 */
      replaceListings: function (rentalId, payload) {
        return request('PUT', '/rentals/' + encodeURIComponent(rentalId) + '/listings', payload);
      }
    },

    // ── 裝備規格／標籤 / Equipment items（W2-04；商城與租借共用 itemId）──
    equipmentItems: {
      getSpecs: function (itemId) {
        return request('GET', '/equipment-items/' + encodeURIComponent(itemId) + '/specs');
      },
      replaceSpecs: function (itemId, payload) {
        return request('PUT', '/equipment-items/' + encodeURIComponent(itemId) + '/specs', payload);
      },
      getTags: function (itemId) {
        return request('GET', '/equipment-items/' + encodeURIComponent(itemId) + '/tags');
      },
      replaceTags: function (itemId, payload) {
        return request('PUT', '/equipment-items/' + encodeURIComponent(itemId) + '/tags', payload);
      }
    },

    // ── 跨領域庫存轉換 / Inventory conversions（W2-05）──
    inventoryConversions: {
      list: function (query) {
        var params = new URLSearchParams(query || { page: 0, size: 100 });
        var suffix = params.toString() ? '?' + params.toString() : '';
        return request('GET', '/inventory-conversions' + suffix, null, true);
      },
      getById: function (conversionId) {
        return request('GET', '/inventory-conversions/' + encodeURIComponent(conversionId));
      },
      /** POST /api/admin/inventory-conversions — 建立草稿（不改庫存） */
      createDraft: function (payload) {
        return request('POST', '/inventory-conversions', payload);
      },
      /** POST /api/admin/inventory-conversions/:id/post — 過帳 */
      post: function (conversionId) {
        return request('POST', '/inventory-conversions/' + encodeURIComponent(conversionId) + '/post', {});
      },
      /** POST /api/admin/inventory-conversions/:id/cancel — 作廢草稿 */
      cancel: function (conversionId) {
        return request('POST', '/inventory-conversions/' + encodeURIComponent(conversionId) + '/cancel', {});
      }
    },

    // ── 庫位主檔 / Inventory locations（W2-06）──
    inventoryLocations: {
      list: function (query) {
        var params = new URLSearchParams(query || {});
        var suffix = params.toString() ? '?' + params.toString() : '';
        return request('GET', '/inventory-locations' + suffix);
      },
      getById: function (locationId) {
        return request('GET', '/inventory-locations/' + encodeURIComponent(locationId));
      },
      create: function (payload) {
        return request('POST', '/inventory-locations', payload);
      },
      update: function (locationId, payload) {
        return request('PATCH', '/inventory-locations/' + encodeURIComponent(locationId), payload);
      },
      remove: function (locationId) {
        return request('DELETE', '/inventory-locations/' + encodeURIComponent(locationId));
      }
    },

    // ── 最低庫存閾值 / Min-stocks（W1-07）──
    minStocks: {
      /**
       * GET /api/admin/min-stocks?inventoryDomain=store|rental
       * 查詢閾值；不回傳 on_hand。
       */
      list: function (query) {
        var params = new URLSearchParams(query || {});
        var suffix = params.toString() ? '?' + params.toString() : '';
        return request('GET', '/min-stocks' + suffix);
      },
      /**
       * PUT /api/admin/min-stocks — 批次 upsert 閾值（不改 on_hand）
       * @param {{ inventoryDomain: string, items: Array }} payload
       */
      upsert: function (payload) {
        return request('PUT', '/min-stocks', payload);
      }
    },

    // ── 評論 / Reviews（W1-06：列表／詳情／硬刪）──
    reviews: {
      /** GET /api/admin/reviews */
      list: function (query) {
        var params = new URLSearchParams();
        Object.keys(query || {}).forEach(function (key) {
          var value = query[key];
          if (value !== undefined && value !== null && value !== '') {
            params.set(key, value);
          }
        });
        var suffix = params.toString() ? '?' + params.toString() : '';
        return request('GET', '/reviews' + suffix, null, true);
      },
      /** GET /api/admin/reviews/:id */
      getById: function (reviewId) {
        return request('GET', '/reviews/' + encodeURIComponent(reviewId));
      },
      /** DELETE /api/admin/reviews/:id — 硬刪整則（photos CASCADE） */
      remove: function (reviewId) {
          return request('DELETE', '/reviews/' + encodeURIComponent(reviewId));
      }
    },

    // ── 優惠券 / Coupons ──
    coupons: {
      list: function (query) {
        var params = new URLSearchParams(query || { page: 0, size: 100, sort: 'createdAt,desc' });
        var suffix = params.toString() ? '?' + params.toString() : '';
        return request('GET', '/coupons' + suffix);
      },
      getById: function (couponId) {
        return request('GET', '/coupons/' + encodeURIComponent(couponId));
      },
      create: function (coupon) {
        return request('POST', '/coupons', coupon);
      },
      update: function (couponId, coupon) {
        return request('PATCH', '/coupons/' + encodeURIComponent(couponId), coupon);
      },
      updateStatus: function (couponId, status) {
        return request('PATCH', '/coupons/' + encodeURIComponent(couponId), { status: status });
      },
      remove: function (couponId) {
        return request('DELETE', '/coupons/' + encodeURIComponent(couponId));
      }
    },

    // ── 庫存異動 / Movement ──
    movement: {
      list: function (query) {
        var params = new URLSearchParams(query || { page: 0, size: 100, sort: 'occurredAt,desc' });
        var suffix = params.toString() ? '?' + params.toString() : '';
        return request('GET', '/inventory-movements' + suffix);
      },
      getById: function (movementId) {
        return request('GET', '/inventory-movements/' + encodeURIComponent(movementId));
      },
      getLookups: function () {
        return request('GET', '/inventory-movements/lookups');
      },
      createDraft: function (record) {
        return request('POST', '/inventory-movements', record);
      },
      addItem: function (movementId, item) {
        return request('POST', '/inventory-movements/' + encodeURIComponent(movementId) + '/items', item);
      },
      post: function (movementId) {
        return request('POST', '/inventory-movements/' + encodeURIComponent(movementId) + '/post', {});
      },
      cancel: function (movementId) {
        return request('POST', '/inventory-movements/' + encodeURIComponent(movementId) + '/cancel', {});
      },
      // ADM-W2-08：改表頭 reason（不更新 employeeId）
      updateReason: function (movementId, payload) {
        return request('PATCH', '/inventory-movements/' + encodeURIComponent(movementId), payload);
      },
      // ADM-W2-08：改列備註 lineReason 與／或異動性質 lineNature
      updateItemLineReason: function (movementId, itemId, payload) {
        return request(
          'PATCH',
          '/inventory-movements/' + encodeURIComponent(movementId)
            + '/items/' + encodeURIComponent(itemId),
          payload
        );
      },
      // Mock 模式保留舊 create 名稱；Backend 模式一律使用 createDraft。
      create: function (record) {
        return request('POST', '/inventory-movements', record);
      }
    },

    // ── 營區主檔 / Campgrounds（W4-01）──
    campgrounds: {
      list: function () {
        return request('GET', '/campgrounds');
      },
      getById: function (campgroundId) {
        return request('GET', '/campgrounds/' + encodeURIComponent(campgroundId));
      },
      create: function (payload) {
        return request('POST', '/campgrounds', payload);
      },
      update: function (campgroundId, payload) {
        return request('PATCH', '/campgrounds/' + encodeURIComponent(campgroundId), payload);
      },
      remove: function (campgroundId) {
        return request('DELETE', '/campgrounds/' + encodeURIComponent(campgroundId));
      },
      /** W4-02：營位列表（含停用） */
      listZones: function (campgroundId) {
        return request('GET', '/campgrounds/' + encodeURIComponent(campgroundId) + '/zones');
      },
      getZone: function (campgroundId, zoneId) {
        return request('GET', '/campgrounds/' + encodeURIComponent(campgroundId)
          + '/zones/' + encodeURIComponent(zoneId));
      },
      createZone: function (campgroundId, payload) {
        return request('POST', '/campgrounds/' + encodeURIComponent(campgroundId) + '/zones', payload);
      },
      updateZone: function (campgroundId, zoneId, payload) {
        return request('PATCH', '/campgrounds/' + encodeURIComponent(campgroundId)
          + '/zones/' + encodeURIComponent(zoneId), payload);
      },
      removeZone: function (campgroundId, zoneId) {
        return request('DELETE', '/campgrounds/' + encodeURIComponent(campgroundId)
          + '/zones/' + encodeURIComponent(zoneId));
      },
      /** Admin UX 03：月曆可用性區間（Backend 模式預約排程面板） */
      getAvailability: function (campgroundId, query) {
        var params = new URLSearchParams({ from: query.from, to: query.to });
        if (query && query.zoneId) {
          params.set('zoneId', query.zoneId);
        }
        return request(
          'GET',
          '/campgrounds/' + encodeURIComponent(campgroundId) + '/availability?' + params.toString()
        );
      }
    },

    // ── 營區公休 / Campground closures ──
    closures: {
      list: function (query) {
        var params = new URLSearchParams(query || { page: 0, size: 100, sort: 'createdAt,desc' });
        var suffix = params.toString() ? '?' + params.toString() : '';
        return request('GET', '/campground-closures' + suffix);
      },
      getById: function (closureId) {
        return request('GET', '/campground-closures/' + encodeURIComponent(closureId));
      },
      create: function (closure) {
        return request('POST', '/campground-closures', closure);
      },
      update: function (id, closure) {
        return request('PATCH', '/campground-closures/' + encodeURIComponent(id), closure);
      },
      remove: function (id) {
        return request('DELETE', '/campground-closures/' + encodeURIComponent(id));
      }
    },

    // ── 特殊節日曆 / Calendar dates（W4-03）──
    calendarDates: {
      /** 區間內每一天一列（含未標記的一般日） */
      listRange: function (from, to) {
        var params = new URLSearchParams({ from: from, to: to });
        return request('GET', '/calendar-dates?' + params.toString());
      },
      /** isHoliday=true 標記；false 刪列恢復一般日 */
      upsert: function (date, payload) {
        return request('PUT', '/calendar-dates/' + encodeURIComponent(date), payload);
      },
      remove: function (date) {
        return request('DELETE', '/calendar-dates/' + encodeURIComponent(date));
      }
    },

    // ── 分析報表彙總 / Analytics summaries（W4-06）──
    analytics: {
      /** 商城 KPI、折線、Top10；query from/to 為 YYYY-MM-DD */
      shopSummary: function (from, to) {
        var params = new URLSearchParams({ from: from, to: to });
        return request('GET', '/analytics/shop-summary?' + params.toString());
      },
      /** 預約 KPI、折線、營地／地區 */
      bookingSummary: function (from, to) {
        var params = new URLSearchParams({ from: from, to: to });
        return request('GET', '/analytics/booking-summary?' + params.toString());
      }
    }
  };

  global.AdminAPI = AdminAPI;
})(typeof window !== 'undefined' ? window : this);
