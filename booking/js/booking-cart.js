/**
 * booking-cart.js
 * 功能：預約背包確認頁（步驟 4）
 *   ① 讀取 LocalStorage（camelCase），渲染住宿 + 裝備項目（含數量調整器）
 *   ② 「修改日期」連結帶入正確 campgroundId
 *   ③ 住宿：調整營位數量，即時重算小計
 *   ④ 裝備：調整數量 / 刪除項目，即時重算小計
 *   ⑤ 右側摘要隨數量變化同步更新
 *   ⑥ 所有變更即時寫回 localStorage（camelCase）
 */

// 目前操作中的 bookingCart（camelCase），初始從 localStorage 讀取
var bookingCart = null;

function notifyBookingCartChanged(action) {
  window.dispatchEvent(
    new CustomEvent('yurui:booking-cart-changed', {
      detail: { action: action || 'update' },
    })
  );
}

$(document).ready(function () {
  bookingCart =
    typeof window.readBookingCart === 'function' ? window.readBookingCart() : null;

  if (!bookingCart || !bookingCart.bookingInfo) {
    showEmptyState();
    return;
  }

  // 舊 snake_case 讀進來後立刻寫回 camelCase
  if (typeof window.writeBookingCart === 'function') {
    bookingCart = window.writeBookingCart(bookingCart);
  }

  normalizeBookingCart();
  renderAll();

  // 清除背包
  $('#bookingCartClearButton').on('click', function () {
    showConfirmToast('確定清除背包中的所有預約資料？', function () {
      localStorage.removeItem('bookingCart');
      notifyBookingCartChanged('clear');
      bookingCart = null;
      showToast('背包已清除', 'info');
      $('#bookingCartContent').removeClass('isVisible');
      showEmptyState();
    });
  });

  // 住宿數量調整
  $('#bookingCartStayBody').on('click', '.quantityButtonBooking', function () {
    var $btn = $(this);
    var action = $btn.data('action');
    var idx = parseInt($btn.data('idx'), 10);
    var zone = bookingCart.selectedZones[idx];
    if (!zone) return;

    var unitPrice = zone.subtotal / zone.quantity;
    var newQty = zone.quantity + (action === 'inc' ? 1 : -1);
    if (newQty < 1 || newQty > 10) return;

    zone.quantity = newQty;
    zone.subtotal = Math.round(unitPrice * newQty);

    recalcSummary();
    saveCart();
    renderStayBody();
    renderSummary();
  });

  // 裝備數量調整
  $('#bookingCartRentalBody').on('click', '.quantityButtonBooking', function () {
    var $btn = $(this);
    var action = $btn.data('action');
    var idx = parseInt($btn.data('idx'), 10);
    var rental = bookingCart.selectedRentals[idx];
    if (!rental) return;

    var newQty = rental.quantity + (action === 'inc' ? 1 : -1);
    if (newQty < 1 || newQty > 20) return;

    rental.quantity = newQty;
    rental.subtotal = Math.round(getRentalFinalUnitPrice(rental) * newQty);

    recalcSummary();
    saveCart('rental-quantity');
    renderRentalBody();
    renderSummary();
  });

  // 裝備刪除
  $('#bookingCartRentalBody').on('click', '.cartRemoveButtonBooking', function () {
    var idx = parseInt($(this).data('idx'), 10);
    bookingCart.selectedRentals.splice(idx, 1);

    recalcSummary();
    saveCart('rental-remove');
    renderRentalBody();
    renderSummary();

    if (bookingCart.selectedRentals.length === 0) {
      showToast('裝備已全部移除', 'info');
    }
  });
});

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

function renderStayBody() {
  var info = bookingCart.bookingInfo || {};
  var zones = bookingCart.selectedZones || [];

  if (zones.length === 0) {
    $('#bookingCartStayCard').hide();
    return;
  }

  var html = zones
    .map(function (z) {
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
          <div class="cartItemPrice cartItemPriceBooking">NT$${z.subtotal.toLocaleString()}</div>
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
      var finalUnitPrice = getRentalFinalUnitPrice(r);
      return `
      <div class="cartItem cartItemBooking">
        <div class="cartItemInfo cartItemInfoBooking">
          <div class="cartItemTitle cartItemTitleBooking">${esc(r.name || '')}</div>
          ${r.specLabel ? `<div class="rentalCartItemSpec rentalCartItemSpecBooking">${esc(r.specLabel)}</div>` : ''}
          <div class="cartItemMeta cartItemMetaBooking">
            <span>折扣後單價 NT$${Math.round(finalUnitPrice).toLocaleString()}</span>
          </div>
        </div>
        <div class="cartItemActions cartItemActionsBooking">
          <div class="quantityStepper quantityStepperBooking">
            <button class="quantityButton quantityButtonBooking" data-action="dec" data-idx="${idx}">−</button>
            <span class="quantityValue quantityValueBooking">${r.quantity}</span>
            <button class="quantityButton quantityButtonBooking" data-action="inc" data-idx="${idx}"${atMax ? ' disabled' : ''}>+</button>
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
  var rentalOriginalTotal = Number(s.rental_original_total || s.rental_total || 0);
  var rentalDiscountTotal = Number(s.rental_discount_total || s.applied_discount || 0);
  var rentalTotal = Number(s.rental_total || 0);

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
    return s + Number(r.subtotal || 0);
  }, 0);
  var rentalOriginalTotal = rentals.reduce(function (s, r) {
    return s + getRentalOriginalUnitPrice(r) * Number(r.quantity || 0);
  }, 0);
  var rentalDiscountTotal = rentals.reduce(function (s, r) {
    return s + getRentalUnitDiscount(r) * Number(r.quantity || 0);
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

function normalizeBookingCart() {
  var zones = bookingCart.selected_zones || [];
  if (zones.length > 0) {
    var firstZone = zones[0];
    var originalQuantity = Math.max(Number(firstZone.quantity || 1), 1);
    firstZone.subtotal = Math.round(Number(firstZone.subtotal || 0) / originalQuantity);
    firstZone.quantity = 1;
    bookingCart.selected_zones = [firstZone];
  }

  (bookingCart.selected_rentals || []).forEach(function (rental) {
    var quantity = Math.max(Number(rental.quantity || 1), 1);
    var subtotal = Number(rental.subtotal || 0);
    var legacyDiscount = Number(rental.unit_discount || 0);
    var finalUnit = Number(rental.unit_final_price || 0);

    if (!finalUnit && subtotal > 0) finalUnit = subtotal / quantity;
    rental.unit_final_price = Math.max(finalUnit, 0);
    rental.unit_discount = Math.max(legacyDiscount, 0);
    rental.unit_original_price = Math.max(
      Number(rental.unit_original_price || 0),
      rental.unit_final_price + rental.unit_discount
    );
    rental.subtotal = Math.round(rental.unit_final_price * quantity);
  });
  recalcSummary();
}

function getRentalOriginalUnitPrice(rental) {
  return (
    Number(rental.unit_original_price || 0) || getRentalFinalUnitPrice(rental) + getRentalUnitDiscount(rental)
  );
}

function getRentalUnitDiscount(rental) {
  return Number(rental.unit_discount || 0);
}

function getRentalFinalUnitPrice(rental) {
  var stored = Number(rental.unit_final_price || 0);
  if (stored > 0) return stored;
  return Number(rental.subtotal || 0) / Math.max(Number(rental.quantity || 1), 1);
}

function updateItemCount() {
  var zones = bookingCart.selectedZones || [];
  var rentals = bookingCart.selectedRentals || [];
  var total =
    zones.reduce(function (s) {
      return s + 1;
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
