/**
 * Booking 共用腳本同步注入器（步驟：補齊 AppConfig／ApiClient 等）
 * Sync injector for booking core scripts.
 *
 * 用法（放在頁面專屬 JS 之前）：
 *   <script src="/booking/js/booking-core-scripts.js"></script>
 *
 * 清單必須與 booking/partials/booking-core-scripts.partial 保持一致。
 * Must stay in sync with booking/partials/booking-core-scripts.partial.
 *
 * 使用 document.write：僅在 HTML 解析階段執行，才能保證後續 script 已有 AppConfig。
 */
(function () {
  'use strict';

  if (window.__bookingCoreScriptsInjected) {
    return;
  }
  window.__bookingCoreScriptsInjected = true;

  /**
   * 與 layout.js loadBookingCoreScripts 的 flag 對齊，避免 DOMContentLoaded 時重複載入。
   * Align flags with layout.js so loadScriptOnce skips already-injected files.
   *
   * 順序：config → api-client → formatters → api-mock → booking-api
   * （api-mock／booking-api 依賴 window.ApiClient）
   */
  var BOOKING_CORE_SCRIPTS = [
    { src: '/yurui-env.js', flag: '__bookingCoreYuruiEnvLoaded' },
    { src: '/storefront/js/config.js', flag: '__bookingCoreConfigLoaded' },
    { src: '/storefront/js/api-client.js', flag: '__bookingCoreApiClientLoaded' },
    { src: '/storefront/js/formatters.js', flag: '__bookingCoreFormattersLoaded' },
    { src: '/storefront/js/api-mock.js', flag: '__bookingCoreApiMockLoaded' },
    { src: '/storefront/js/booking-api.js', flag: '__bookingCoreBookingApiLoaded' },
  ];

  for (var i = 0; i < BOOKING_CORE_SCRIPTS.length; i++) {
    window[BOOKING_CORE_SCRIPTS[i].flag] = true;
    document.write('<script src="' + BOOKING_CORE_SCRIPTS[i].src + '"><\/script>');
  }
})();
