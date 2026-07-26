/**
 * booking-cart.js
 * 功能：預約背包確認頁（步驟 4）
 *   ① 讀取 LocalStorage（camelCase），渲染住宿 + 裝備項目
 *   ② 「修改日期」連結帶入正確 campgroundId
 *   ③ 住宿：每個已選營位固定為單次預約，不提供數量調整
 *   ④ 裝備：調整數量 / 刪除項目，即時重算小計
 *   ⑤ 右側摘要隨數量變化同步更新
 *   ⑥ 所有變更即時寫回 localStorage（camelCase）
 *   ⑦ 進頁即建立 Booking Checkout Session，先鎖定營位與租借庫存
 */

// 目前操作中的 bookingCart（camelCase），初始從 localStorage 讀取
var bookingCart = null;
var BOOKING_IDEMPOTENCY_KEY = 'bookingCheckoutIdempotencyKey';
var BOOKING_FINGERPRINT_KEY = 'bookingCheckoutFingerprint';
var BOOKING_SESSION_KEY = 'lastCheckoutBooking';
var BOOKING_SESSION_FINGERPRINT_KEY = 'lastCheckoutBookingFingerprint';
var bookingSessionQueue = Promise.resolve();
var bookingSessionRevision = 0;
var bookingSessionNeedsAuthRetry = false;

$(document).ready(function () {
  bookingCart = typeof window.readBookingCart === 'function' ? window.readBookingCart() : null;

  if (!bookingCart || !bookingCart.bookingInfo) {
    showEmptyState();
    return;
  }

  // 舊 snake_case 讀進來後立刻寫回 camelCase
  if (typeof window.writeBookingCart === 'function') {
    bookingCart = window.writeBookingCart(bookingCart);
  }

  normalizeStayQuantity();

  renderAll();
  initBookingCheckoutSession();

  // 清除背包
  $('#bookingCartClearButton').on('click', function () {
    showConfirmToast('確定清除背包中的所有預約資料？', function () {
      cancelPreparedBookingSession();
      localStorage.removeItem('bookingCart');
      bookingCart = null;
      clearPreparedBookingSession();
      clearBookingIdempotencyKey();
      showToast('背包已清除', 'info');
      $('#bookingCartContent').removeClass('isVisible');
      showEmptyState();
    });
  });

  // 裝備數量調整
  $('#bookingCartRentalBody').on('click', '.quantityButtonBooking', function () {
    var $btn = $(this);
    var action = $btn.data('action');
    var idx = parseInt($btn.data('idx'), 10);
    var rental = bookingCart.selectedRentals[idx];
    if (!rental) return;

    var newQty = rental.quantity + (action === 'inc' ? 1 : -1);
    updateRentalQuantity(idx, newQty);
  });

  // 輸入完成後再更新，避免每次鍵入都重建一次庫存保留 Session。
  $('#bookingCartRentalBody').on('change', '.quantityInputBooking', function () {
    var idx = parseInt($(this).data('idx'), 10);
    var newQty = Number($(this).val());
    var rental = bookingCart.selectedRentals[idx];
    if (!rental) return;

    if (!Number.isInteger(newQty) || newQty < 1 || newQty > 20) {
      $(this).val(rental.quantity);
      showToast('請輸入 1 到 20 之間的整數。', 'warning');
      return;
    }

    updateRentalQuantity(idx, newQty);
  });

  // 裝備刪除
  $('#bookingCartRentalBody').on('click', '.cartRemoveButtonBooking', function () {
    var idx = parseInt($(this).data('idx'), 10);
    bookingCart.selectedRentals.splice(idx, 1);

    recalcSummary();
    saveCart();
    renderRentalBody();
    renderSummary();
    prepareBookingCheckoutSession(true);

    if (bookingCart.selectedRentals.length === 0) {
      showToast('裝備已全部移除', 'info');
    }
  });
});

function updateRentalQuantity(idx, newQty) {
  var rental = bookingCart.selectedRentals[idx];
  if (!rental || newQty < 1 || newQty > 20 || newQty === rental.quantity) return;

  var unitPrice = rental.subtotal / rental.quantity;
  rental.quantity = newQty;
  rental.subtotal = Math.round(unitPrice * newQty);

  recalcSummary();
  saveCart();
  renderRentalBody();
  renderSummary();
  prepareBookingCheckoutSession(true);
}

// ============================================================
// 進頁建立 Booking Checkout Session
// ============================================================

function initBookingCheckoutSession() {
  $('#bookingCartCheckoutButton').on('click', function (event) {
    if ($(this).attr('aria-disabled') === 'true') {
      event.preventDefault();
      showToast('請等待庫存確認完成。', 'info');
    }
  });

  // Firebase 登入完成後自動重試，不需要使用者重新整理背包頁。
  window.addEventListener('yurui:auth-changed', function (event) {
    if (event.detail && event.detail.type === 'login' && bookingSessionNeedsAuthRetry) {
      bookingSessionNeedsAuthRetry = false;
      prepareBookingCheckoutSession(false);
    } else if (event.detail && event.detail.type === 'logout') {
      bookingSessionRevision += 1;
      bookingSessionNeedsAuthRetry = true;
      clearPreparedBookingSession();
      clearBookingIdempotencyKey();
      setBookingSessionState('error', '請先登入，登入後系統會自動確認並保留庫存。');
    }
  });

  prepareBookingCheckoutSession(false);
}

/**
 * 依目前背包內容建立 pending/unpaid Session。
 * 數量變更時先取消舊保留，再以新冪等鍵重新鎖位。
 */
function prepareBookingCheckoutSession(replaceExisting) {
  var revision = ++bookingSessionRevision;
  setBookingSessionState('loading', '正在確認營位與租借商品庫存…');

  bookingSessionQueue = bookingSessionQueue
    .catch(function () {
      // 前一次失敗不應阻斷後續數量調整後的重試。
    })
    .then(function () {
      var storedBooking = readStoredBookingSession();
      if (storedBooking && isBookingSessionExpired(storedBooking)) {
        clearPreparedBookingSession();
        clearBookingIdempotencyKey();
      }

      var previousBooking = replaceExisting ? readStoredBookingSession() : null;
      var cancelPromise =
        previousBooking && window.BookingAPI && typeof window.BookingAPI.cancelBooking === 'function'
          ? window.BookingAPI.cancelBooking(previousBooking.bookingId || previousBooking.id)
          : Promise.resolve();

      return cancelPromise.then(function () {
        if (replaceExisting) clearPreparedBookingSession();
        if (!window.BookingAPI || typeof window.BookingAPI.createBooking !== 'function') {
          throw new Error('BookingAPI 未載入，請重新整理頁面。');
        }

        var cartSnapshot = bookingCart;
        var fingerprint = getBookingCartFingerprint(cartSnapshot);
        var request = buildBookingPayload(cartSnapshot, 'ecpay-credit');

        return window.BookingAPI.createBooking(request, cartSnapshot).then(function (booking) {
          return { booking: booking, fingerprint: fingerprint };
        });
      });
    })
    .then(function (result) {
      // 使用者連續調整數量時，舊回應不得覆蓋最新一次 Session。
      if (revision !== bookingSessionRevision) {
        return cancelBookingResult(result.booking);
      }

      sessionStorage.setItem(BOOKING_SESSION_KEY, JSON.stringify(result.booking));
      sessionStorage.setItem(BOOKING_SESSION_FINGERPRINT_KEY, result.fingerprint);
      bookingSessionNeedsAuthRetry = false;
      setBookingSessionState('ready', '庫存已暫時保留，請於 15 分鐘內完成付款。');
    })
    .catch(function (error) {
      if (revision !== bookingSessionRevision) return;

      clearPreparedBookingSession();
      bookingSessionNeedsAuthRetry = isBookingAuthError(error);
      var message = getBookingSessionErrorMessage(error);
      setBookingSessionState('error', message);
      showToast(message, 'error');
      maybeOpenLoginModalForCart();
    });

  return bookingSessionQueue;
}

/**
 * modal.js 是由 layout.js 在頁面載入後才動態注入，晚於 booking-cart.js 的
 * $(document).ready；直接呼叫 window.openModal 常會撲空。改用 booking-header.js
 * 載入完成後呼叫的 window.onBookingHeaderReady 補開，兩種先後順序都能正確開啟。
 */
function maybeOpenLoginModalForCart() {
  if (!bookingSessionNeedsAuthRetry) return;
  if (typeof window.openModal === 'function') {
    window.openModal('loginModal');
  }
}

window.onBookingHeaderReady = function () {
  maybeOpenLoginModalForCart();
};

function setBookingSessionState(state, message) {
  var isReady = state === 'ready';
  var $status = $('#bookingCheckoutSessionStatus');
  var $checkoutButton = $('#bookingCartCheckoutButton');

  $status
    .removeClass('isReady isError')
    .toggleClass('isReady', isReady)
    .toggleClass('isError', state === 'error');
  $status.text(message);
  $checkoutButton.attr('aria-disabled', isReady ? 'false' : 'true');
  $checkoutButton.html(
    isReady
      ? '<i class="bi bi-arrow-right-circle"></i> 前往結帳'
      : '<i class="bi bi-hourglass-split"></i> 正在確認庫存'
  );
}

function getBookingSessionErrorMessage(error) {
  var code = String((error && error.code) || '').toUpperCase();

  if (code === 'RENTAL_STOCK_INSUFFICIENT') {
    return '商品剩餘數量不足請重新調整數量';
  }
  if (code === 'ZONE_UNAVAILABLE') {
    return '營位剩餘數量不足，請重新調整預約內容。';
  }
  if (isBookingAuthError(error)) {
    return '請先登入，登入後系統會自動確認並保留庫存。';
  }

  return error && error.message ? error.message : '暫時無法確認庫存，請稍後再試。';
}

function isBookingAuthError(error) {
  var code = String((error && error.code) || '').toUpperCase();
  return code === 'AUTH_TOKEN_UNAVAILABLE' || code === 'UNAUTHORIZED';
}

function cancelPreparedBookingSession() {
  return cancelBookingResult(readStoredBookingSession());
}

function cancelBookingResult(booking) {
  var bookingId = booking && (booking.bookingId || booking.id);
  if (!bookingId || !window.BookingAPI || typeof window.BookingAPI.cancelBooking !== 'function') {
    return Promise.resolve();
  }

  return window.BookingAPI.cancelBooking(bookingId).catch(function (error) {
    console.warn('[booking-cart] 無法釋放舊的庫存保留：', error);
  });
}

function readStoredBookingSession() {
  try {
    return JSON.parse(sessionStorage.getItem(BOOKING_SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

function clearPreparedBookingSession() {
  sessionStorage.removeItem(BOOKING_SESSION_KEY);
  sessionStorage.removeItem(BOOKING_SESSION_FINGERPRINT_KEY);
}

function clearBookingIdempotencyKey() {
  sessionStorage.removeItem(BOOKING_IDEMPOTENCY_KEY);
  sessionStorage.removeItem(BOOKING_FINGERPRINT_KEY);
}

function isBookingSessionExpired(booking) {
  var expiresAt = booking && booking.checkoutExpiresAt;
  return Boolean(expiresAt && Date.parse(expiresAt) <= Date.now());
}

// 只把後端契約允許的 ID、數量、日期與付款方式送出。
function buildBookingPayload(cart, paymentMethod) {
  var info = cart.bookingInfo || {};

  return {
    campgroundId: info.campgroundId,
    checkIn: info.checkIn,
    checkOut: info.checkOut,
    guestCount: Number(info.guestCount) || 1,
    zones: (cart.selectedZones || []).map(function (zone) {
      return {
        zoneId: zone.zoneId,
        quantity: Number(zone.quantity) || 1,
      };
    }),
    rentals: (cart.selectedRentals || []).map(function (rental) {
      return {
        rentalListingId: rental.rentalListingId || rental.equipmentId,
        rentalSkuVariantId: rental.rentalSkuVariantId || rental.variantId,
        quantity: Number(rental.quantity) || 1,
      };
    }),
    couponClaimId: null,
    paymentMethod: paymentMethod === 'ecpay-credit' ? paymentMethod : 'ecpay-credit',
    idempotencyKey: getBookingIdempotencyKey(cart),
  };
}

function getBookingCartFingerprint(cart) {
  return JSON.stringify({
    bookingInfo: cart && cart.bookingInfo,
    selectedZones: cart && cart.selectedZones,
    selectedRentals: cart && cart.selectedRentals,
  });
}

function getBookingIdempotencyKey(cart) {
  var fingerprint = getBookingCartFingerprint(cart);
  var previousFingerprint = sessionStorage.getItem(BOOKING_FINGERPRINT_KEY);
  var key = sessionStorage.getItem(BOOKING_IDEMPOTENCY_KEY);

  if (!key || previousFingerprint !== fingerprint) {
    key =
      window.crypto && typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : 'booking-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    sessionStorage.setItem(BOOKING_IDEMPOTENCY_KEY, key);
    sessionStorage.setItem(BOOKING_FINGERPRINT_KEY, fingerprint);
  }

  return key;
}

// ============================================================
// 渲染整頁
// ============================================================

function renderAll() {
  var info = bookingCart.bookingInfo || {};

  // 設定「修改日期」連結：帶入 campgroundId
  var campId = info.campgroundId || '';
  $('#bookingCartEditDateLink').attr('href', './camp-detail.html?id=' + encodeURIComponent(campId));

  updateItemCount();
  renderStayBody();
  renderRentalBody();
  renderSummary();

  $('#bookingCartEmpty').removeClass('isVisible');
  $('#bookingCartContent').addClass('isVisible');
}

function normalizeStayQuantity() {
  var changed = false;
  (bookingCart.selectedZones || []).forEach(function (zone) {
    var quantity = Math.max(Number(zone.quantity) || 1, 1);
    if (quantity !== 1) {
      zone.subtotal = Math.round((Number(zone.subtotal) || 0) / quantity);
      changed = true;
    }
    zone.quantity = 1;
  });
  if (!changed) return;
  recalcSummary();
  saveCart();
}

function renderStayBody() {
  var info = bookingCart.bookingInfo || {};
  var zones = bookingCart.selectedZones || [];

  if (zones.length === 0) {
    $('#bookingCartStayCard').hide();
    return;
  }

  var html = zones
    .map(function (z, idx) {
      return `
      <div class="cartItem cartItemBooking">
        <div class="cartItemInfo cartItemInfoBooking">
          <div class="cartItemTitle cartItemTitleBooking">${esc(info.campgroundName || '')} · ${esc(z.zoneType || '')}</div>
          <div class="cartItemMeta cartItemMetaBooking">
            <span><i class="bi bi-calendar3"></i> ${esc(info.checkIn || '')} ～ ${esc(info.checkOut || '')}</span>
            <span><i class="bi bi-moon"></i> ${info.totalDays || 0} 晚</span>
            <span><i class="bi bi-people"></i> ${info.guestCount || ''} 人</span>
          </div>
        </div>
        <div class="cartItemActions cartItemActionsBooking">
          <div class="cartItemPrice cartItemPriceBooking" id="zonePrice${idx}">NT$${z.subtotal.toLocaleString()}</div>
        </div>
      </div>
    `;
    })
    .join('');

  $('#bookingCartStayBody').html(html);
  $('#bookingCartStayCard').show();
}

function renderRentalBody() {
  var rentals = bookingCart.selectedRentals || [];

  if (rentals.length === 0) {
    $('#bookingCartRentalBody').html(
      '<div class="cartEmptyNote cartEmptyNoteBooking">本次未選擇租借裝備。</div>'
    );
    return;
  }

  var html = rentals
    .map(function (r, idx) {
      var atMax = r.quantity >= 20;
      return `
      <div class="cartItem cartItemBooking">
        <div class="cartItemInfo cartItemInfoBooking">
          <div class="cartItemTitle cartItemTitleBooking">${esc(r.name || '')}</div>
          ${r.specLabel ? `<div class="rentalCartItemSpec rentalCartItemSpecBooking">${esc(r.specLabel)}</div>` : ''}
          <div class="cartItemMeta cartItemMetaBooking">
            <span>單價 NT$${Math.round(r.subtotal / r.quantity).toLocaleString()}</span>
          </div>
        </div>
        <div class="cartItemActions cartItemActionsBooking">
          <div class="quantityStepper quantityStepperBooking">
            <button type="button" class="quantityButton quantityButtonBooking" data-action="dec" data-idx="${idx}" aria-label="減少${esc(r.name || '')}數量">−</button>
            <input type="number" class="quantityValue quantityValueBooking quantityInputBooking" value="${r.quantity}" min="1" max="20" step="1" inputmode="numeric" data-idx="${idx}" aria-label="輸入${esc(r.name || '')}租借數量">
            <button type="button" class="quantityButton quantityButtonBooking" data-action="inc" data-idx="${idx}" aria-label="增加${esc(r.name || '')}數量"${atMax ? ' disabled' : ''}>+</button>
          </div>
          <div class="cartItemPrice cartItemPriceBooking">NT$${r.subtotal.toLocaleString()}</div>
          <button class="cartRemoveButton cartRemoveButtonBooking" data-idx="${idx}">
            <i class="bi bi-trash3"></i> 移除
          </button>
        </div>
      </div>
    `;
    })
    .join('');

  $('#bookingCartRentalBody').html(html);
  $('#bookingCartRentalCard').show();
}

function renderSummary() {
  var s = bookingCart.summary || {};

  var html = `
    <div class="bookingCostRow">
      <span>住宿費</span>
      <span>NT$${(s.zoneTotal || 0).toLocaleString()}</span>
    </div>
    <div class="bookingCostRow">
      <span>裝備租借費</span>
      <span>NT$${(s.rentalTotal || 0).toLocaleString()}</span>
    </div>
  `;

  if (s.appliedDiscount > 0) {
    html += `
      <div class="bookingCostRow bookingCostRowDiscount">
        <span><i class="bi bi-tag"></i> 租借折扣優惠</span>
        <span>-NT$${s.appliedDiscount.toLocaleString()}</span>
      </div>
    `;
  }

  $('#bookingCartCostRows').html(html);
  $('#bookingCartFinalAmount').text('NT$' + (s.finalAmount || 0).toLocaleString());
}

// ============================================================
// 工具函式
// ============================================================

function recalcSummary() {
  var zones = bookingCart.selectedZones || [];
  var rentals = bookingCart.selectedRentals || [];

  var zoneTotal = zones.reduce(function (s, z) {
    return s + (z.subtotal || 0);
  }, 0);
  var rentalTotal = rentals.reduce(function (s, r) {
    return s + (r.subtotal || 0);
  }, 0);

  var discount = bookingCart.summary ? bookingCart.summary.appliedDiscount || 0 : 0;

  bookingCart.summary = {
    zoneTotal: zoneTotal,
    rentalTotal: rentalTotal,
    appliedDiscount: discount,
    finalAmount: zoneTotal + rentalTotal - discount,
  };

  updateItemCount();
}

function updateItemCount() {
  var zones = bookingCart.selectedZones || [];
  var rentals = bookingCart.selectedRentals || [];
  var total =
    zones.reduce(function (s, z) {
      return s + (z.quantity || 0);
    }, 0) +
    rentals.reduce(function (s, r) {
      return s + (r.quantity || 0);
    }, 0);
  $('#bookingCartCount').text('共 ' + total + ' 項');
}

function saveCart() {
  if (typeof window.writeBookingCart === 'function') {
    bookingCart = window.writeBookingCart(bookingCart);
  } else {
    localStorage.setItem('bookingCart', JSON.stringify(bookingCart));
  }
}

function showEmptyState() {
  $('#bookingCartEmpty').addClass('isVisible');
  $('#bookingCartContent').removeClass('isVisible');
  $('#bookingCartCount').text('');
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
