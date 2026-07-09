/**
 * booking-checkout.js
 * 功能：預約結帳頁邏輯
 *   ① 讀取 LocalStorage 取得完整 bookingCart
 *   ② 渲染住宿明細、裝備明細、費用加總
 *   ③ 聯絡資訊表單驗證
 *   ④ 模擬送出結帳（未來對接 Java 後端）
 *   ⑤ 結帳成功後清除 LocalStorage，跳轉預約成功頁
 */

$(document).ready(function () {
  // 讀取並正規化 bookingCart（camelCase；相容舊 snake_case）
  const bookingCart =
    typeof window.readBookingCart === 'function' ? window.readBookingCart() : null;

  if (!bookingCart || !bookingCart.bookingInfo) {
    showToast('購物車資料為空，請重新選擇。', 'warning');
    window.location.href = './booking-cart.html';
    return;
  }

  // 舊格式立刻寫回 camelCase
  if (typeof window.writeBookingCart === 'function') {
    window.writeBookingCart(bookingCart);
  }

  renderCheckoutPage(bookingCart);
  initAccordionPanels();
  initPaymentMethod();
  initFillProfileBtn();

  $('#confirmPayBtn').on('click', function () {
    handleCheckout(bookingCart);
  });
});

// ============================================================
// 渲染整頁預約明細
// ============================================================

function renderCheckoutPage(cart) {
  const info = cart.bookingInfo || {};
  const zones = cart.selectedZones || [];
  const rentals = cart.selectedRentals || [];
  const summary = cart.summary || {};

  // 住宿資訊
  const zoneRowsHTML = zones
    .map(
      (z) => `
    <div class="bookingSummaryRow">
      <span>
        <strong>${info.campgroundName}</strong>・${z.zoneType}・×${z.quantity} 個營位
      </span>
      <span><strong>NT$${z.subtotal.toLocaleString()}</strong></span>
    </div>
  `
    )
    .join('');

  $('#stayDetail').html(`
    <div class="bookingSummaryRow bookingSummaryRowMeta">
      <i class="bi bi-calendar3"></i>
      ${info.checkIn} ～ ${info.checkOut}
      （${info.totalDays} 晚｜平日 ${info.weekdayCount} 晚、假日 ${info.holidayCount} 晚）
    </div>
    <div class="bookingSummaryRow bookingSummaryRowMeta">
      <i class="bi bi-geo-alt"></i> ${info.region}
      &nbsp;&nbsp;
      <i class="bi bi-people"></i> ${info.guestCount} 人
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
        <span>${r.name}${r.specLabel ? ` <small class="bookingRentalSpec">(${r.specLabel})</small>` : ''} ×${r.quantity}</span>
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
      <span>NT$${(summary.zoneTotal || 0).toLocaleString()}</span>
    </div>
    <div class="bookingCostRow">
      <span>裝備租借費</span>
      <span>NT$${(summary.rentalTotal || 0).toLocaleString()}</span>
    </div>
  `;

  if (summary.appliedDiscount > 0) {
    breakdownHTML += `
      <div class="bookingCostRow bookingCostRowDiscount">
        <span><i class="bi bi-tag"></i> 租借折扣優惠</span>
        <span>-NT$${summary.appliedDiscount.toLocaleString()}</span>
      </div>
    `;
  }

  $('#costBreakdown').html(breakdownHTML);
  $('#finalAmount').text(`NT$${(summary.finalAmount || 0).toLocaleString()}`);
}

// ============================================================
// 會員資料帶入 / Fill member profile
// ============================================================

/** 取得目前登入會員（優先 YuruiAuth，fallback localStorage） */
function getLoggedInUser() {
  if (window.YuruiAuth && typeof window.YuruiAuth.getUser === 'function') {
    return window.YuruiAuth.getUser();
  }
  try {
    var user = JSON.parse(localStorage.getItem('yuruiUser'));
    return user && user.name ? user : null;
  } catch {
    return null;
  }
}

/** 將會員姓名、電話、Email 填入訂購人欄位（備註不帶入） */
function fillContactFields(user) {
  if (!user) return;
  if (user.name) $('#contactName').val(user.name);
  if (user.phone) $('#contactPhone').val(user.phone);
  if (user.email) $('#contactEmail').val(user.email);
}

/** 已登入時自動帶入；未登入則略過 */
function tryAutoFillContactFields() {
  var user = getLoggedInUser();
  if (user) fillContactFields(user);
}

/** 綁定「帶入會員資料」按鈕與登入後自動填入 */
function initFillProfileBtn() {
  $('#fillProfileBtn').on('click', function () {
    var user = getLoggedInUser();
    if (!user) {
      showToast('請先登入後再帶入會員資料', 'info');
      if (typeof window.openModal === 'function') {
        window.openModal('loginModal');
      }
      return;
    }
    fillContactFields(user);
    showToast('已帶入會員資料', 'success');
  });

  window.addEventListener('yurui:auth-changed', function (e) {
    if (e.detail && e.detail.type === 'login' && e.detail.user) {
      fillContactFields(e.detail.user);
    }
  });
}

// ============================================================
// 登入守衛
// ============================================================

window.onBookingHeaderReady = function () {
  initLoginGuard();
  tryAutoFillContactFields();
};

function initLoginGuard() {
  function showNotice() {
    $('#loginNotice').addClass('isVisible');
  }
  function hideNotice() {
    $('#loginNotice').removeClass('isVisible');
  }

  if (!getLoggedInUser()) {
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
    if (e.key === 'yuruiUser' || e.key === 'currentUser') {
      getLoggedInUser() ? hideNotice() : showNotice();
    }
  });

  window.addEventListener('yurui:auth-changed', function (e) {
    if (e.detail && e.detail.type === 'login') {
      hideNotice();
    } else if (e.detail && e.detail.type === 'logout') {
      showNotice();
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

function openCheckoutPanel(panelId) {
  const $panel = $('#' + panelId);
  if (!$panel.length || $panel.hasClass('isOpen')) return;
  $panel.addClass('isOpen');
  $panel.find('> .checkoutPanelBodyBooking').slideDown(200);
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
  var u = getLoggedInUser();
  if (!u) {
    if (typeof window.openModal === 'function') window.openModal('loginModal');
    $('#loginNotice').addClass('isVisible');
    return;
  }

  const name = $('#contactName').val().trim();
  const phone = $('#contactPhone').val().trim();
  const email = $('#contactEmail').val().trim();

  if (!name) {
    highlightError('#contactName', '請填寫訂購人姓名', 'panelContact');
    return;
  }
  if (!phone || !/^[0-9]{8,12}$/.test(phone)) {
    highlightError('#contactPhone', '請填寫正確的手機號碼（8-12 位數字）', 'panelContact');
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    highlightError('#contactEmail', '請填寫有效的電子信箱格式', 'panelContact');
    return;
  }

  const paymentMethod = $('input[name="paymentMethod"]:checked').val();
  if (paymentMethod === 'credit') {
    const cardNum = $('#cardNumber').val().replace(/\s/g, '');
    const cardExpiry = $('#cardExpiry').val().trim();
    const cardCvv = $('#cardCvv').val().trim();
    if (cardNum.length < 16) {
      highlightError('#cardNumber', '請填寫完整的信用卡卡號（16 位）', 'panelPayment');
      return;
    }
    if (!/^\d{2} \/ \d{2}$/.test(cardExpiry)) {
      highlightError('#cardExpiry', '請填寫正確的到期日格式（MM / YY）', 'panelPayment');
      return;
    }
    if (cardCvv.length < 3) {
      highlightError('#cardCvv', '請填寫 CVV（3-4 位數字）', 'panelPayment');
      return;
    }
  }

  const payload = buildBookingPayload(cart, { name: name, phone: phone, email: email }, u, paymentMethod);

  $('#confirmPayBtn').prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> 送出中...');

  if (!window.BookingAPI) {
    showToast('BookingAPI 未載入，請重新整理頁面。', 'error');
    $('#confirmPayBtn').prop('disabled', false).html('<i class="bi bi-lock-fill"></i> 確認預約並送出');
    return;
  }

  // 透過 BookingAPI 寫入 mockBookings（localStorage）並合併 seed 資料
  // Persist booking via BookingAPI → localStorage mockBookings
  window.BookingAPI.createBooking(payload)
    .then(function (booking) {
      console.log('[booking-checkout] 預約成功 / Booking created:', booking);
      onCheckoutSuccess(booking);
    })
    .catch(function (err) {
      console.error('[booking-checkout] 預約失敗 / Failed:', err);
      showToast('預約送出失敗，請稍後再試。', 'error');
      $('#confirmPayBtn')
        .prop('disabled', false)
        .html('<i class="bi bi-lock-fill"></i> 確認預約並送出');
    });
}

// ============================================================
// 組裝 createBooking payload（bookingCart 已是 camelCase，幾乎直接沿用）
// ============================================================

/**
 * 將 localStorage bookingCart（camelCase）組成 createBooking 需要的 payload
 * 只補結帳當下才有的欄位：contact / paymentMethod / history / customerNote
 * （3-13：不再做 snake_case → camelCase 轉換）
 */
function buildBookingPayload(cart, contact, user, paymentMethod) {
  var info = cart.bookingInfo || {};
  var summary = cart.summary || {};
  var now = new Date();
  var timeStr =
    now.getFullYear() +
    '-' +
    String(now.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(now.getDate()).padStart(2, '0') +
    ' ' +
    String(now.getHours()).padStart(2, '0') +
    ':' +
    String(now.getMinutes()).padStart(2, '0') +
    ':' +
    String(now.getSeconds()).padStart(2, '0');

  var paidLabel = paymentMethod === 'cod' ? '現場付款（待確認）' : '已付款';

  return {
    customerId: user.id || user.customerId || 'U001',
    bookingInfo: {
      campgroundId: info.campgroundId,
      campgroundName: info.campgroundName,
      region: info.region,
      checkIn: info.checkIn,
      checkOut: info.checkOut,
      totalDays: info.totalDays,
      weekdayCount: info.weekdayCount,
      holidayCount: info.holidayCount,
      guestCount: info.guestCount,
    },
    selectedZones: (cart.selectedZones || []).map(function (z) {
      return {
        zoneId: z.zoneId,
        zoneType: z.zoneType,
        quantity: z.quantity,
        subtotal: z.subtotal,
      };
    }),
    selectedRentals: (cart.selectedRentals || []).map(function (r) {
      return {
        equipmentId: r.equipmentId,
        rentalSkuId: r.rentalSkuId,
        productId: r.productId,
        variantId: r.variantId,
        sku: r.sku,
        name: r.name,
        specLabel: r.specLabel || '',
        quantity: r.quantity,
        subtotal: r.subtotal,
      };
    }),
    summary: {
      zoneTotal: summary.zoneTotal || 0,
      rentalTotal: summary.rentalTotal || 0,
      appliedDiscount: summary.appliedDiscount || 0,
      finalAmount: summary.finalAmount || 0,
    },
    contact: contact,
    customerNote: $('#buyerNote').val().trim() || '',
    paymentMethod: paymentMethod,
    equipmentReturned: false,
    history: [
      { time: timeStr, action: '預約單已送出' },
      { time: timeStr, action: paidLabel },
    ],
  };
}

// 送出前重新讀取營地與裝備正式資料，避免 localStorage summary 或折扣被手動竄改。
async function verifyBookingCheckoutCart(cart) {
  const rebuiltCart = await rebuildBookingCartFromSource(cart);
  if (isBookingCartPricingChanged(cart, rebuiltCart)) {
    Object.assign(cart, rebuiltCart);
    localStorage.setItem('bookingCart', JSON.stringify(rebuiltCart));
    renderCheckoutPage(cart);
    showToast('預約金額或庫存資料已更新，請確認後再送出。', 'warning');
    return null;
  }
  Object.assign(cart, rebuiltCart);
  return cart;
}

// 用 campground / rentals 資料重建 bookingCart，正式金額只從資料來源推導。
async function rebuildBookingCartFromSource(cart) {
  const campgrounds = await readBookingJson('../data/campgrounds.json');
  const rentals = await readBookingJson('../data/rentals.json');
  const info = cart.booking_info || {};
  const camp = campgrounds.find(function (item) {
    return item && item.campground_id === info.campground_id;
  });
  if (!camp) throw new Error('找不到營地資料，請重新選擇營地。');

  const days = calculateBookingDateCounts(info.check_in, info.check_out);
  const rebuiltZones = (cart.selected_zones || []).map(function (zone) {
    const sourceZone = (camp.zones || []).find(function (item) {
      return item.zone_id === zone.zone_id || item.type === zone.zone_type;
    });
    if (!sourceZone) throw new Error('部分營位已無法預約，請重新選擇。');

    const quantity = Math.floor(Number(zone.quantity || 1));
    if (quantity < 1) throw new Error('營位數量異常，請重新選擇。');
    if (quantity > Number(sourceZone.total_sites || 0)) {
      throw new Error(`${sourceZone.type} 剩餘 ${sourceZone.total_sites} 個營位，請調整數量。`);
    }

    const unitSubtotal =
      sourceZone.price_weekday * days.weekday_count + sourceZone.price_holiday * days.holiday_count;
    return {
      zone_id: sourceZone.zone_id,
      zone_type: sourceZone.type,
      capacity_per_site: sourceZone.capacity_per_site,
      quantity,
      subtotal: unitSubtotal * quantity,
    };
  });

  const rebuiltRentals = (cart.selected_rentals || []).map(function (rental) {
    const sourceRental = rentals.find(function (item) {
      return item && item.equipment_id === rental.equipment_id && item.campground_id === camp.campground_id;
    });
    if (!sourceRental) throw new Error('部分租借裝備已無法租借，請重新選擇。');

    const quantity = Math.floor(Number(rental.quantity || 1));
    if (quantity < 1) throw new Error('租借裝備數量異常，請重新選擇。');
    if (quantity > Number(sourceRental.stock || 0)) {
      throw new Error(`${sourceRental.name} 庫存不足，最多可租借 ${sourceRental.stock} 件。`);
    }

    const price = buildRentalPriceSnapshot(sourceRental, days);
    return {
      equipment_id: sourceRental.equipment_id,
      name: sourceRental.name,
      image: sourceRental.image_url || rental.image || '',
      quantity,
      unit_original_price: price.unit_original_price,
      unit_discount: price.unit_discount,
      unit_final_price: price.unit_final_price,
      subtotal: price.unit_final_price * quantity,
    };
  });

  const rebuiltCart = {
    ...cart,
    booking_info: {
      ...info,
      campground_id: camp.campground_id,
      campground_name: camp.name,
      region: camp.region,
      check_in: info.check_in,
      check_out: info.check_out,
      weekday_count: days.weekday_count,
      holiday_count: days.holiday_count,
      total_days: days.total_days,
    },
    selected_zones: rebuiltZones,
    selected_rentals: rebuiltRentals,
  };
  recalcBookingSummary(rebuiltCart);
  return rebuiltCart;
}

// 讀取 booking JSON 資料；未來接後端時只需要替換這個資料入口。
async function readBookingJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error('資料讀取失敗，請稍後再試。');
  return response.json();
}

// 依入住日到退房日前一晚計算平日/假日晚數，與 camp-detail 的規則保持一致。
function calculateBookingDateCounts(checkIn, checkOut) {
  const start = parseBookingDate(checkIn);
  const end = parseBookingDate(checkOut);
  if (!start || !end || start >= end) throw new Error('預約日期異常，請重新選擇日期。');

  let weekdayCount = 0;
  let holidayCount = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    const day = cursor.getDay();
    if (day === 5 || day === 6) holidayCount++;
    else weekdayCount++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return {
    weekday_count: weekdayCount,
    holiday_count: holidayCount,
    total_days: weekdayCount + holidayCount,
  };
}

// 以本地日期解析 YYYY-MM-DD，避免瀏覽器把日期當 UTC 造成跨日。
function parseBookingDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

// 依正式裝備價格與天數建立單件原價、折扣與折扣後價格。
function buildRentalPriceSnapshot(rental, days) {
  const pricing = rental.pricing || {};
  const original =
    Number(pricing.price_per_day_weekday || 0) * days.weekday_count +
    Number(pricing.price_per_day_holiday || 0) * days.holiday_count;
  const discount = Math.max(0, Math.min(Number(pricing.discount || 0), original));
  return {
    unit_original_price: original,
    unit_discount: discount,
    unit_final_price: Math.max(original - discount, 0),
  };
}

// 比對正式重建後的關鍵欄位，若不同就要求使用者重新確認金額。
function isBookingCartPricingChanged(currentCart, rebuiltCart) {
  return (
    JSON.stringify(buildBookingComparableSnapshot(currentCart)) !==
    JSON.stringify(buildBookingComparableSnapshot(rebuiltCart))
  );
}

function buildBookingComparableSnapshot(cart) {
  const summary = cart.summary || {};
  return {
    booking_info: cart.booking_info,
    selected_zones: cart.selected_zones,
    selected_rentals: cart.selected_rentals,
    summary: {
      zone_total: summary.zone_total,
      rental_original_total: summary.rental_original_total,
      rental_discount_total: summary.rental_discount_total,
      rental_total: summary.rental_total,
      final_amount: summary.final_amount,
    },
  };
}

// ============================================================
// 結帳成功後處理
// ============================================================

/**
 * 將 booking id 轉成顯示用編號，格式化失敗時回退原始 id
 * Format booking id for display; fall back to raw id when formatter returns empty
 */
function toBookingDisplayNum(id) {
  if (id == null || id === '') return '';
  var formatted = window.formatBookingDisplayId ? window.formatBookingDisplayId(id) : '';
  return formatted || String(id);
}

/**
 * 清除預約背包並跳轉成功頁（對應商城 checkout-success 流程）
 * Clear booking cart and redirect to booking success page
 */
function onCheckoutSuccess(booking) {
  // 防呆：確保 booking.id 是有效數字（NaN 也會被攔下）
  // Guard: ensure booking.id is a finite number (NaN is rejected too)
  if (!booking || booking.id == null || !Number.isFinite(Number(booking.id))) {
    console.error('[booking-checkout] 缺少有效 booking.id / Invalid booking.id:', booking);
    showToast('預約已送出，但編號異常，請至會員中心查看', 'warning');
    localStorage.removeItem('bookingCart');
    window.location.href = './member-center.html';
    return;
  }

  localStorage.removeItem('bookingCart');
  localStorage.setItem('lastCheckoutBooking', JSON.stringify(booking));
  // 同分頁跳轉備援，比 localStorage 更可靠
  // Same-tab handoff fallback; more reliable than localStorage alone
  sessionStorage.setItem('lastCheckoutBooking', JSON.stringify(booking));

  var bookingNum = toBookingDisplayNum(booking.id) || String(booking.id);

  window.location.href =
    './booking-success.html?bookingNum=' + encodeURIComponent(bookingNum);
}

// ============================================================
// 工具函式
// ============================================================

function highlightError(selector, message, panelId) {
  const $input = $(selector);
  // 欄位藏在收合面板時，先展開面板再 focus，讓使用者知道錯誤在哪裡。
  if (panelId) openCheckoutPanel(panelId);
  $input.addClass('isInvalid');
  setTimeout(function () {
    $input.focus();
  }, 220);
  setTimeout(() => $input.removeClass('isInvalid'), 2000);
  showToast(message, 'warning');
}
