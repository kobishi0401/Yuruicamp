// ========================================
// mock-storage-merge.js — localStorage overlay 合併（前台 + 後台共用）
// TEMPORARY LAYER / 暫時層：
//   串接真實後端後，改以 DB transaction 取代 seed + localStorage overlay。
//   語意對照：mockCustomerOverlay ≈ 未來 PATCH /customers/:id
// ========================================

(function (global) {
  'use strict';

  function readJsonStorage(key, fallback) {
    try {
      return JSON.parse(global.localStorage.getItem(key) || JSON.stringify(fallback));
    } catch (e) {
      return fallback;
    }
  }

  /** 依 id 合併 seed 與 overlay（同 id 以 overlay 為準） */
  function mergeById(seed, overlay, idKey) {
    idKey = idKey || 'id';
    var map = new Map();
    (seed || []).forEach(function (item) {
      if (item && item[idKey] != null) map.set(String(item[idKey]), item);
    });
    (overlay || []).forEach(function (item) {
      if (item && item[idKey] != null) map.set(String(item[idKey]), item);
    });
    return Array.from(map.values());
  }

  global.MockStorageMerge = {
    readJsonStorage: readJsonStorage,
    mergeById: mergeById,
    MOCK_ORDERS_KEY: 'mockOrders',
    MOCK_BOOKINGS_KEY: 'mockBookings',
    MOCK_REVIEWS_KEY: 'mockReviews',
    MOCK_CLOSURES_KEY: 'mockCampgroundClosures',
    LEGACY_ADMIN_REVIEWS_KEY: 'adminReviews',
  };
})(typeof window !== 'undefined' ? window : this);
