/**
 * admin/js/admin-api.js
 * 後台 REST API 抽象層（Mock → 未來串接後端 / 資料庫）
 *
 * 使用方式：
 *   1. 預設 useBackend = false：只更新前端 cache，API 回傳 resolved Promise（不發 request）
 *   2. 後端就緒後：AdminAPI.configure({ useBackend: true, baseUrl: '/api/admin' })
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
  function request(method, path, body) {
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

    var options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      credentials: 'same-origin'
    };

    if (body !== undefined && body !== null && method !== 'GET' && method !== 'HEAD') {
      options.body = JSON.stringify(body);
    }

    var url = config.baseUrl.replace(/\/$/, '') + path;

    return fetch(url, options).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (text) {
          var err = new Error('AdminAPI ' + method + ' ' + path + ' failed: ' + res.status);
          err.status = res.status;
          err.body = text;
          throw err;
        });
      }
      if (res.status === 204) {
        return { ok: true, data: null };
      }
      return res.json().then(function (data) {
        return { ok: true, data: data };
      });
    });
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

    // ── 客戶 / Customers ──
    customers: {
      /** GET /api/admin/customers */
      list: function () {
        return request('GET', '/customers');
      },
      /** POST /api/admin/customers */
      create: function (customer) {
        return request('POST', '/customers', customer);
      },
      /** PATCH /api/admin/customers/:id */
      update: function (customerId, changes) {
        return request('PATCH', '/customers/' + encodeURIComponent(customerId), changes);
      }
    },

    // ── 標籤池 / Tag pool ──
    tags: {
      /** PUT /api/admin/tag-pool */
      savePool: function (tagColorMap) {
        return request('PUT', '/tag-pool', { tagColorMap: tagColorMap });
      }
    },

    // ── 訂單 / Orders ──
    orders: {
      /** GET /api/admin/orders */
      list: function () {
        return request('GET', '/orders');
      },
      /** PATCH /api/admin/orders/:id — 狀態、history 等 */
      update: function (orderId, payload) {
        return request('PATCH', '/orders/' + encodeURIComponent(orderId), payload);
      },
      /** 語意化捷徑：出貨 */
      ship: function (orderId, payload) {
        return request('PATCH', '/orders/' + encodeURIComponent(orderId) + '/ship', payload);
      },
      /** 語意化捷徑：完成 */
      complete: function (orderId, payload) {
        return request('PATCH', '/orders/' + encodeURIComponent(orderId) + '/complete', payload);
      }
    },

    // ── 預約 / Bookings ──
    bookings: {
      /** GET /api/admin/bookings */
      list: function () {
        return request('GET', '/bookings');
      },
      /** PATCH /api/admin/bookings/:id — 狀態、備註等 */
      update: function (bookingId, payload) {
        return request('PATCH', '/bookings/' + encodeURIComponent(bookingId), payload);
      }
    },

    // ── 商品 / Products ──
    products: {
      /** GET /api/admin/products */
      list: function () {
        return request('GET', '/products');
      },
      /** POST /api/admin/products */
      create: function (product) {
        return request('POST', '/products', product);
      },
      /** PUT /api/admin/products/:id */
      update: function (productId, product) {
        return request('PUT', '/products/' + encodeURIComponent(productId), product);
      },
      /** PUT /api/admin/rentals/:id — 租借庫存 */
      updateRental: function (rentalId, rental) {
        return request('PUT', '/rentals/' + encodeURIComponent(rentalId), rental);
      }
    },

    // ── 評論 / Reviews ──
    reviews: {
      /** GET /api/admin/reviews */
      list: function () {
        return request('GET', '/reviews');
      },
      /** PUT /api/admin/reviews — 整批或單筆由後端決定 */
      saveAll: function (reviews) {
        return request('PUT', '/reviews', { reviews: reviews });
      },
      /** DELETE /api/admin/reviews/:id — 刪除整則評論 */
      remove: function (reviewId) {
        return request('DELETE', '/reviews/' + encodeURIComponent(reviewId));
      }
    },

    // ── 優惠券 / Coupons ──
    coupons: {
      list: function () {
        return request('GET', '/coupons');
      },
      create: function (coupon) {
        return request('POST', '/coupons', coupon);
      },
      updateStatus: function (code, status) {
        return request('PATCH', '/coupons/' + encodeURIComponent(code), { status: status });
      },
      remove: function (code) {
        return request('DELETE', '/coupons/' + encodeURIComponent(code));
      }
    },

    // ── 庫存異動 / Movement ──
    movement: {
      list: function () {
        return request('GET', '/movement');
      },
      create: function (record) {
        return request('POST', '/movement', record);
      }
    },

    // ── 營區公休 / Campground closures ──
    closures: {
      list: function () {
        return request('GET', '/campground-closures');
      },
      create: function (closure) {
        return request('POST', '/campground-closures', closure);
      },
      update: function (id, closure) {
        return request('PUT', '/campground-closures/' + encodeURIComponent(id), closure);
      },
      remove: function (id) {
        return request('DELETE', '/campground-closures/' + encodeURIComponent(id));
      }
    }
  };

  global.AdminAPI = AdminAPI;
})(typeof window !== 'undefined' ? window : this);
