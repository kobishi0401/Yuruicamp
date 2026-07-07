/**
 * booking-checkout.js
 * 功能：預約結帳頁邏輯
 *   ① 讀取 LocalStorage 取得完整 bookingCart
 *   ② 渲染住宿明細、裝備明細、費用加總
 *   ③ 聯絡資訊表單驗證
 *   ④ 模擬送出結帳（未來對接 Java 後端）
 *   ⑤ 結帳成功後清除 LocalStorage，顯示導購橫幅
 */

$(document).ready(function () {
  const stored = localStorage.getItem('bookingCart');

  if (!stored) {
    showToast('購物車資料為空，請重新選擇。', 'warning');
    window.location.href = './booking-cart.html';
    return;
  }

  const bookingCart = JSON.parse(stored);

  renderCheckoutPage(bookingCart);
  initAccordionPanels();
  initPaymentMethod();

  $('#confirmPayBtn').on('click', function () {
    handleCheckout(bookingCart);
  });
});

// ============================================================
// 渲染整頁預約明細
// ============================================================

function renderCheckoutPage(cart) {
  const info = cart.booking_info;
  const zones = cart.selected_zones;
  const rentals = cart.selected_rentals;
  const summary = cart.summary;

  // 住宿資訊
  const zoneRowsHTML = zones
    .map(
      (z) => `
    <div class="bookingSummaryRow">
      <span>
        <strong>${info.campground_name}</strong>・${z.zone_type}・×${z.quantity} 個營位
      </span>
      <span><strong>NT$${z.subtotal.toLocaleString()}</strong></span>
    </div>
  `
    )
    .join('');

  $('#stayDetail').html(`
    <div class="bookingSummaryRow bookingSummaryRowMeta">
      <i class="bi bi-calendar3"></i>
      ${info.check_in} ～ ${info.check_out}
      （${info.total_days} 晚｜平日 ${info.weekday_count} 晚、假日 ${info.holiday_count} 晚）
    </div>
    <div class="bookingSummaryRow bookingSummaryRowMeta">
      <i class="bi bi-geo-alt"></i> ${info.region}
      &nbsp;&nbsp;
      <i class="bi bi-people"></i> ${info.guest_count} 人
    </div>
    ${zoneRowsHTML}
  `);

  // 租借裝備
  if (!rentals || rentals.length === 0) {
    $('#rentalDetail').html('<p class="bookingNoRental">本次未選擇租借裝備。</p>');
  } else {
    const rentalRowsHTML = rentals
      .map(
        (r) => `
      <div class="bookingSummaryRow">
        <span>${r.name} ×${r.quantity}</span>
        <span><strong>NT$${r.subtotal.toLocaleString()}</strong></span>
      </div>
    `
      )
      .join('');
    $('#rentalDetail').html(rentalRowsHTML);
  }

  // 費用明細
  let breakdownHTML = `
    <div class="bookingCostRow">
      <span>住宿費</span>
      <span>NT$${summary.zone_total.toLocaleString()}</span>
    </div>
    <div class="bookingCostRow">
      <span>裝備租借費</span>
      <span>NT$${summary.rental_total.toLocaleString()}</span>
    </div>
  `;

  if (summary.applied_discount > 0) {
    breakdownHTML += `
      <div class="bookingCostRow bookingCostRowDiscount">
        <span><i class="bi bi-tag"></i> 租借折扣優惠</span>
        <span>-NT$${summary.applied_discount.toLocaleString()}</span>
      </div>
    `;
  }

  $('#costBreakdown').html(breakdownHTML);
  $('#finalAmount').text(`NT$${summary.final_amount.toLocaleString()}`);
}

// ============================================================
// 登入守衛
// ============================================================

window.onBookingHeaderReady = function () {
  initLoginGuard();
};

function initLoginGuard() {
  function isLoggedIn() {
    if (window.YuruiAuth && typeof window.YuruiAuth.getUser === 'function') {
      return Boolean(window.YuruiAuth.getUser());
    }
    // 登入提示判斷：booking 與主站共用登入資料，因此 currentUser / yuruiUser 任一存在都視為已登入。
    var user = readBookingCheckoutUser();
    return !!(user && user.name);
  }

  function showNotice() {
    $('#loginNotice').addClass('isVisible');
  }
  function hideNotice() {
    $('#loginNotice').removeClass('isVisible');
  }

  // 登入提示同步：同分頁登入不會觸發 storage event，需監聽共用 auth 事件即時隱藏提示。
  function syncLoginNotice() {
    isLoggedIn() ? hideNotice() : showNotice();
  }

  if (!isLoggedIn()) {
    setTimeout(function () {
      if (typeof window.openModal === 'function') {
        window.openModal('loginModal');
      }
      showNotice();
    }, 400);
  }

  $('#loginNoticeBtn').on('click', function () {
    if (typeof window.openModal === 'function') {
      window.openModal('loginModal');
    }
  });

  window.addEventListener('storage', function (e) {
    if (e.key === 'yuruiUser') {
      syncLoginNotice();
    }
  });

  window.addEventListener('yurui:auth-changed', syncLoginNotice);
  syncLoginNotice();
}

// ============================================================
// 手風琴面板
// ============================================================

function initAccordionPanels() {
  // 手風琴互動：使用 checkoutPanel* 語意 class，讓 JS hook 與版型命名解耦。
  $('.checkoutPanelHeaderBooking').on('click', function () {
    const $panel = $(this).closest('.checkoutPanelBooking');
    const $body = $panel.find('> .checkoutPanelBodyBooking');
    const isOpen = $panel.hasClass('isOpen');

    if (isOpen) {
      $body.slideUp(200);
      $panel.removeClass('isOpen');
    } else {
      $body.slideDown(200);
      $panel.addClass('isOpen');
    }
  });
}

// ============================================================
// 付款方式互動
// ============================================================

function initPaymentMethod() {
  $('input[name="paymentMethod"]').on('change', function () {
    const val = $(this).val();

    $('#payOptCredit').toggleClass('isSelected', val === 'credit');
    $('#payOptLine').toggleClass('isSelected', val === 'linepay');

    if (val === 'credit') {
      $('#creditCardSection').slideDown(200);
    } else {
      $('#creditCardSection').slideUp(200);
    }
  });

  $('#cardNumber').on('input', function () {
    let v = $(this).val().replace(/\D/g, '').substring(0, 16);
    v = v.replace(/(.{4})/g, '$1 ').trim();
    $(this).val(v);
  });

  $('#cardExpiry').on('input', function () {
    let v = $(this).val().replace(/\D/g, '').substring(0, 4);
    if (v.length >= 3) v = v.slice(0, 2) + ' / ' + v.slice(2);
    $(this).val(v);
  });

  $('#cardCvv').on('input', function () {
    $(this).val($(this).val().replace(/\D/g, '').substring(0, 4));
  });
}

// ============================================================
// 送出結帳
// ============================================================

function handleCheckout(cart) {
  var u = readBookingCheckoutUser();
  if (!u || !u.name) {
    if (typeof window.openModal === 'function') window.openModal('loginModal');
    $('#loginNotice').addClass('isVisible');
    return;
  }

  const name = $('#contactName').val().trim();
  const phone = $('#contactPhone').val().trim();
  const email = $('#contactEmail').val().trim();

  if (!name) {
    highlightError('#contactName', '請填寫訂購人姓名');
    return;
  }
  if (!phone || !/^[0-9]{8,12}$/.test(phone)) {
    highlightError('#contactPhone', '請填寫正確的手機號碼（8-12 位數字）');
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    highlightError('#contactEmail', '請填寫有效的電子信箱格式');
    return;
  }

  const paymentMethod = $('input[name="paymentMethod"]:checked').val();
  if (paymentMethod === 'credit') {
    const cardNum = $('#cardNumber').val().replace(/\s/g, '');
    const cardExpiry = $('#cardExpiry').val().trim();
    const cardCvv = $('#cardCvv').val().trim();
    if (cardNum.length < 16) {
      highlightError('#cardNumber', '請填寫完整的信用卡卡號（16 位）');
      return;
    }
    if (!/^\d{2} \/ \d{2}$/.test(cardExpiry)) {
      highlightError('#cardExpiry', '請填寫正確的到期日格式（MM / YY）');
      return;
    }
    if (cardCvv.length < 3) {
      highlightError('#cardCvv', '請填寫 CVV（3-4 位數字）');
      return;
    }
  }

  const payload = {
    ...cart,
    contact: { name, phone, email },
    payment_method: paymentMethod,
    submitted_at: new Date().toISOString(),
  };

  $('#confirmPayBtn').prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> 送出中...');

  // TODO: 未來替換為 fetch Java 後端 API
  // POST /api/bookings → { success: true, booking_id: 'BK202606110001' }
  console.log('[booking-checkout] 預約送出資料:', payload);

  setTimeout(function () {
    onCheckoutSuccess(cart, payload);
  }, 1000);
}

// ============================================================
// 結帳成功後處理
// ============================================================

function onCheckoutSuccess(cart, payload) {
  const bookingOrder = createBookingOrderSnapshot(cart, payload);
  localStorage.setItem('lastBookingCheckoutOrder', JSON.stringify(bookingOrder));
  localStorage.setItem('lastCheckoutOrder', JSON.stringify(bookingOrder));
  localStorage.removeItem('bookingCart');
  console.log('[booking-checkout] bookingCart 已清除');

  const orderNum = String(bookingOrder.orderNumber || bookingOrder.id).replace(/^#/, '');
  window.location.href =
    '../../pages/checkout-success.html?type=booking&orderNum=' + encodeURIComponent(orderNum);
}

function createBookingOrderSnapshot(cart, payload) {
  const info = cart.booking_info || {};
  const summary = cart.summary || {};
  const rentals = cart.selected_rentals || [];
  const zones = cart.selected_zones || [];
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timePart = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
  const orderNumber = 'RENT-' + datePart + timePart;

  // 預約成功快照：共用 checkout-success.html 讀取 lastCheckoutOrder 顯示成立編號。
  return {
    id: 'rent-local-' + Date.now(),
    type: 'booking',
    orderNumber,
    userId: getBookingCheckoutUserId(),
    buyerName: payload.contact.name,
    buyerPhone: payload.contact.phone,
    buyerEmail: payload.contact.email,
    items: [
      ...zones.map(function (zone) {
        return {
          productId: zone.zone_id || zone.zone_type,
          name: info.campground_name + '・' + zone.zone_type,
          price: Number(zone.subtotal || 0) / Math.max(Number(zone.quantity || 1), 1),
          quantity: Number(zone.quantity || 1),
          subtotal: Number(zone.subtotal || 0),
        };
      }),
      ...rentals.map(function (rental) {
        return {
          productId: rental.id || rental.rental_id || rental.name,
          name: rental.name,
          price: Number(rental.subtotal || 0) / Math.max(Number(rental.quantity || 1), 1),
          quantity: Number(rental.quantity || 1),
          image: rental.image || '',
          subtotal: Number(rental.subtotal || 0),
        };
      }),
    ],
    subtotal: Number(summary.zone_total || 0) + Number(summary.rental_total || 0),
    discount: Number(summary.applied_discount || 0),
    total: Number(summary.final_amount || 0),
    status: 'confirmed',
    paymentStatus: 'paid',
    payment: payload.payment_method === 'linepay' ? 'line-pay' : 'credit-card',
    createdAt: now.toISOString(),
    rentalStart: info.check_in || '',
    rentalEnd: info.check_out || '',
    pickupStore: info.campground_name || '營地現場',
    returnStore: info.campground_name || '營地現場',
    campgroundName: info.campground_name || '',
    region: info.region || '',
  };
}

function getBookingCheckoutUserId() {
  const user = readBookingCheckoutUser();
  return user && (user.id || user.userId) ? user.id || user.userId : 'user-001';
}

function readBookingCheckoutUser() {
  const keys = ['yuruiUser', 'currentUser'];
  for (const key of keys) {
    try {
      const rawValue = localStorage.getItem(key);
      const user = rawValue ? JSON.parse(rawValue) : null;
      if (user && user.name) return user;
    } catch (error) {
      console.warn('[booking-checkout] 會員資料解析失敗:', key, error);
    }
  }
  return null;
}

// ============================================================
// 工具函式
// ============================================================

function highlightError(selector, message) {
  const $input = $(selector);
  $input.addClass('isInvalid');
  $input.focus();
  setTimeout(() => $input.removeClass('isInvalid'), 2000);
  showToast(message, 'warning');
}
