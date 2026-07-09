/**
 * booking-utils.js
 * 預約系統共用工具函式
 * showToast(message, type) — 取代原生 alert，顯示右上角訊息提示框
 *   type: 'info' | 'warning' | 'error' | 'success'（預設 'info'）
 * normalizeBookingCart(cart) — 將舊 snake_case bookingCart 轉成 camelCase（3-13）
 */
(function () {
  'use strict';

  var ICONS = {
    info: 'bi bi-info-circle-fill',
    warning: 'bi bi-exclamation-triangle-fill',
    error: 'bi bi-x-octagon-fill',
    success: 'bi bi-check-circle-fill',
  };

  /**
   * 讀取 bookingCart 時正規化為 camelCase
   * Normalize legacy snake_case bookingCart → camelCase (one-time compat)
   * 新寫入一律用 camelCase；此函式只為相容瀏覽器裡舊的 localStorage。
   */
  function normalizeBookingCart(cart) {
    if (!cart || typeof cart !== 'object') return cart;

    // 已是新格式：有 bookingInfo 就直接回傳（仍補齊缺漏陣列）
    if (cart.bookingInfo) {
      return {
        bookingInfo: cart.bookingInfo,
        selectedZones: cart.selectedZones || [],
        selectedRentals: cart.selectedRentals || [],
        summary: cart.summary || {
          zoneTotal: 0,
          rentalTotal: 0,
          appliedDiscount: 0,
          finalAmount: 0,
        },
      };
    }

    // 舊格式 snake_case → camelCase
    var info = cart.booking_info || {};
    var summary = cart.summary || {};
    return {
      bookingInfo: {
        campgroundId: info.campground_id,
        campgroundName: info.campground_name,
        region: info.region,
        checkIn: info.check_in,
        checkOut: info.check_out,
        totalDays: info.total_days,
        weekdayCount: info.weekday_count,
        holidayCount: info.holiday_count,
        guestCount: info.guest_count,
      },
      selectedZones: (cart.selected_zones || []).map(function (z) {
        return {
          zoneId: z.zone_id,
          zoneType: z.zone_type,
          quantity: z.quantity,
          subtotal: z.subtotal,
        };
      }),
      selectedRentals: (cart.selected_rentals || []).map(function (r) {
        return {
          equipmentId: r.equipment_id,
          rentalSkuId: r.rental_sku_id,
          productId: r.product_id,
          variantId: r.variant_id,
          sku: r.sku,
          name: r.name,
          specLabel: r.spec_label || '',
          quantity: r.quantity,
          subtotal: r.subtotal,
        };
      }),
      summary: {
        zoneTotal: summary.zone_total != null ? summary.zone_total : summary.zoneTotal || 0,
        rentalTotal: summary.rental_total != null ? summary.rental_total : summary.rentalTotal || 0,
        appliedDiscount:
          summary.applied_discount != null ? summary.applied_discount : summary.appliedDiscount || 0,
        finalAmount: summary.final_amount != null ? summary.final_amount : summary.finalAmount || 0,
      },
    };
  }

  /** 讀 localStorage bookingCart 並正規化；沒有資料回傳 null */
  function readBookingCart() {
    try {
      var raw = localStorage.getItem('bookingCart');
      if (!raw) return null;
      return normalizeBookingCart(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }

  /** 寫入 camelCase bookingCart */
  function writeBookingCart(cart) {
    var normalized = normalizeBookingCart(cart);
    localStorage.setItem('bookingCart', JSON.stringify(normalized));
    return normalized;
  }

  window.normalizeBookingCart = normalizeBookingCart;
  window.readBookingCart = readBookingCart;
  window.writeBookingCart = writeBookingCart;

  function getContainer() {
    var el = document.getElementById('bookingToastContainer');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bookingToastContainer';
      el.className = 'bookingToastContainer';
      document.body.appendChild(el);
    } else {
      el.classList.add('bookingToastContainer');
    }
    return el;
  }

  // Toast 離場：使用 bookingToastHiding 與 isHiding 標記離場動畫狀態。
  function dismiss(toast) {
    toast.classList.add('bookingToastHiding', 'isHiding');
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }

  function showToast(message, type) {
    type = type && ICONS[type] ? type : 'info';
    var container = getContainer();

    var toast = document.createElement('div');
    // Toast class：以 bookingToast + 語意狀態命名，讓通知元件維持單一正式 API。
    toast.className = 'bookingToast bookingToast' + type.charAt(0).toUpperCase() + type.slice(1);

    var icon = document.createElement('i');
    icon.className = ICONS[type];
    icon.setAttribute('aria-hidden', 'true');

    var text = document.createElement('span');
    text.className = 'bookingToastText';
    text.textContent = message;

    var closeBtn = document.createElement('button');
    closeBtn.className = 'bookingToastClose';
    closeBtn.setAttribute('aria-label', '關閉');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', function () {
      dismiss(toast);
    });

    toast.appendChild(icon);
    toast.appendChild(text);
    toast.appendChild(closeBtn);
    container.appendChild(toast);

    var timer = setTimeout(function () {
      dismiss(toast);
    }, 3500);
    toast.addEventListener('mouseenter', function () {
      clearTimeout(timer);
    });
    toast.addEventListener('mouseleave', function () {
      timer = setTimeout(function () {
        dismiss(toast);
      }, 2000);
    });
  }

  window.showToast = showToast;
})();

