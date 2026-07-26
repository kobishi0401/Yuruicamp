/**
 * booking-cart.js
 * 功能：預約背包確認頁（步驟 4）
 *   B3：不在此頁 createBooking；僅 soft 驗量，hard lock 改在 booking-checkout 進頁
 */

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
  initBookingCartCheckoutLink();

  // 清除背包
  $('#bookingCartClearButton').on('click', function () {
    showConfirmToast('確定清除背包中的所有預約資料？', function () {
      localStorage.removeItem('bookingCart');
      bookingCart = null;
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
}

// ============================================================
// Soft 驗量 + 前往結帳（K2）
// ============================================================

function initBookingCartCheckoutLink() {
  setBookingSessionState('ready', '確認無誤後可前往結帳填寫聯絡資料。');

  $('#bookingCartCheckoutButton').on('click', function (event) {
    if (!runBookingCartSoftValidation({ block: true })) {
      event.preventDefault();
      showToast('請依提示調整預約內容後再結帳。', 'warning');
    }
  });
}

/** 不在 cart 頁 hard lock，只做基本數量檢查 / Soft validate before leaving cart */
function runBookingCartSoftValidation({ block }) {
  if (!bookingCart || !bookingCart.bookingInfo) {
    if (block) showToast('背包資料不完整，請重新選擇。', 'warning');
    setBookingSessionState('error', '背包資料不完整，請重新選擇。');
    return false;
  }

  if (!bookingCart.selectedZones || bookingCart.selectedZones.length === 0) {
    if (block) showToast('請至少選擇一個營位。', 'warning');
    setBookingSessionState('error', '請至少選擇一個營位。');
    return false;
  }

  var rentalIssues = (bookingCart.selectedRentals || []).filter(function (rental) {
    var qty = Number(rental.quantity);
    return !Number.isInteger(qty) || qty < 1 || qty > 20;
  });
  if (rentalIssues.length > 0) {
    if (block) showToast('租借數量需在 1 到 20 之間。', 'warning');
    setBookingSessionState('error', '租借數量需在 1 到 20 之間，請調整後再結帳。');
    return false;
  }

  setBookingSessionState('ready', '確認無誤後可前往結帳填寫聯絡資料。');
  return true;
}

function setBookingSessionState(state, message) {
  var isReady = state === 'ready';
  var $status = $('#bookingCheckoutSessionStatus');
  var $checkoutButton = $('#bookingCartCheckoutButton');

  $status
    .removeClass('isReady isError')
    .toggleClass('isReady', isReady)
    .toggleClass('isError', state === 'error');
  $status.text(message);
  $checkoutButton.attr('aria-disabled', state === 'error' ? 'true' : 'false');
  $checkoutButton.html(
    state === 'error'
      ? '<i class="bi bi-exclamation-octagon"></i> 請調整內容'
      : '<i class="bi bi-arrow-right-circle"></i> 前往結帳'
  );
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
