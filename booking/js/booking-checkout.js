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

  let bookingCart;
  try {
    bookingCart = normalizeBookingCart(JSON.parse(stored));
  } catch (error) {
    console.warn('[booking-checkout] bookingCart 解析失敗:', error);
    showToast('購物車資料異常，請重新選擇。', 'warning');
    window.location.href = './booking-cart.html';
    return;
  }

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
  const summary = recalcBookingSummary(cart);

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
  `;

  if (summary.rental_original_total > 0) {
    breakdownHTML += `
      <div class="bookingCostRow">
        <span>裝備租借原價</span>
        <span>NT$${summary.rental_original_total.toLocaleString()}</span>
      </div>
    `;
  }

  if (summary.rental_discount_total > 0) {
    breakdownHTML += `
      <div class="bookingCostRow bookingCostRowDiscount">
        <span><i class="bi bi-tag"></i> 租借折扣優惠</span>
        <span>-NT$${summary.rental_discount_total.toLocaleString()}</span>
      </div>
    `;
  }

  if (summary.rental_original_total > 0) {
    breakdownHTML += `
      <div class="bookingCostRow">
        <span>裝備租借小計</span>
        <span>NT$${summary.rental_total.toLocaleString()}</span>
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
    // 登入提示判斷：booking 與主站共用 YuruiAuth/currentUser 作為唯一會員來源。
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
    if (e.key === 'currentUser' || e.key === 'isLoggedIn') {
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

async function handleCheckout(cart) {
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

  let normalizedCart;
  try {
    normalizedCart = await verifyBookingCheckoutCart(cart);
    if (!normalizedCart) return;
  } catch (error) {
    showToast(error.message || '預約資料異常，請重新確認背包內容。', 'warning');
    return;
  }

  const payload = {
    ...normalizedCart,
    contact: { name, phone, email },
    payment_method: paymentMethod,
    submitted_at: new Date().toISOString(),
  };

  $('#confirmPayBtn').prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> 送出中...');

  // TODO: 未來替換為 fetch Java 後端 API
  // POST /api/bookings → { success: true, booking_id: 'BK202606110001' }
  console.log('[booking-checkout] 預約送出資料:', payload);

  setTimeout(function () {
    onCheckoutSuccess(normalizedCart, payload);
  }, 1000);
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

function onCheckoutSuccess(cart, payload) {
  const bookingOrder = createBookingOrderSnapshot(cart, payload);
  syncBookingRentalOrder(bookingOrder);
  localStorage.setItem('lastBookingCheckoutOrder', JSON.stringify(bookingOrder));
  localStorage.setItem('lastCheckoutOrder', JSON.stringify(bookingOrder));
  localStorage.removeItem('bookingCart');
  window.dispatchEvent(
    new CustomEvent('yurui:booking-cart-changed', { detail: { action: 'checkout-complete' } })
  );
  console.log('[booking-checkout] bookingCart 已清除');

  const orderNum = String(bookingOrder.orderNumber || bookingOrder.id).replace(/^#/, '');
  window.location.href =
    '../../pages/checkout-success.html?type=booking&mode=booking&orderNum=' + encodeURIComponent(orderNum);
}

function syncBookingRentalOrder(order) {
  const orders = readBookingMockOrders()
    .filter(function (item) {
      return item && item.id !== order.id && item.orderNumber !== order.orderNumber;
    })
    .concat(order);
  localStorage.setItem('mockOrders', JSON.stringify(orders));
}

function recalcBookingSummary(cart) {
  var zones = cart.selected_zones || [];
  var rentals = cart.selected_rentals || [];
  var zoneTotal = zones.reduce(function (sum, zone) {
    return sum + Number(zone.subtotal || 0);
  }, 0);
  var rentalOriginalTotal = rentals.reduce(function (sum, rental) {
    return sum + getRentalOriginalUnitPrice(rental) * Number(rental.quantity || 0);
  }, 0);
  var rentalDiscountTotal = rentals.reduce(function (sum, rental) {
    return sum + getRentalUnitDiscount(rental) * Number(rental.quantity || 0);
  }, 0);
  var rentalTotal = rentals.reduce(function (sum, rental) {
    return sum + Number(rental.subtotal || 0);
  }, 0);

  cart.summary = {
    zone_total: zoneTotal,
    rental_original_total: rentalOriginalTotal,
    rental_discount_total: rentalDiscountTotal,
    rental_total: rentalTotal,
    applied_discount: rentalDiscountTotal,
    final_amount: zoneTotal + rentalTotal,
  };
  return cart.summary;
}

function normalizeBookingCart(cart) {
  // 兼容舊 bookingCart：補齊單件原價/折扣/折扣後單價，讓 checkout 不依賴舊 summary。
  (cart.selected_rentals || []).forEach(function (rental) {
    var quantity = Math.max(Number(rental.quantity || 1), 1);
    var subtotal = Number(rental.subtotal || 0);
    var finalUnit = Number(rental.unit_final_price || 0);

    if (!finalUnit && subtotal > 0) finalUnit = subtotal / quantity;
    rental.unit_final_price = Math.max(finalUnit, 0);
    rental.unit_discount = Math.max(Number(rental.unit_discount || 0), 0);
    rental.unit_original_price = Math.max(
      Number(rental.unit_original_price || 0),
      rental.unit_final_price + rental.unit_discount
    );
    rental.subtotal = Math.round(rental.unit_final_price * quantity);
  });
  recalcBookingSummary(cart);
  return cart;
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

function readBookingMockOrders() {
  try {
    const orders = JSON.parse(localStorage.getItem('mockOrders') || '[]');
    return Array.isArray(orders) ? orders : [];
  } catch (error) {
    console.warn('[booking-checkout] mockOrders 解析失敗，改用空陣列。', error);
    return [];
  }
}

function createBookingOrderSnapshot(cart, payload) {
  const info = cart.booking_info || {};
  const summary = recalcBookingSummary(cart);
  const rentals = cart.selected_rentals || [];
  const zones = cart.selected_zones || [];
  const now = new Date();
  const orderNumber = createBookingOrderNumber(now);
  // 回饋點數只依「折扣後裝備租借小計」計算，不把住宿費納入點數規則。
  const rewardPoints = Math.round(Number(summary.rental_total || 0) * 0.1);

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
          productId: rental.equipment_id || rental.id || rental.rental_id || rental.name,
          name: rental.name,
          price: getRentalFinalUnitPrice(rental),
          quantity: Number(rental.quantity || 1),
          image: rental.image || '',
          subtotal: Number(rental.subtotal || 0),
        };
      }),
    ],
    subtotal: Number(summary.zone_total || 0) + Number(summary.rental_original_total || 0),
    discount: Number(summary.rental_discount_total || summary.applied_discount || 0),
    total: Number(summary.final_amount || 0),
    rewardPoints,
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
    campgroundImage:
      'https://picsum.photos/seed/' +
      encodeURIComponent(info.campground_id || info.campground_name || 'booking') +
      '/400/250',
    bookingInfo: {
      campgroundId: info.campground_id || '',
      campgroundName: info.campground_name || '',
      region: info.region || '',
      checkIn: info.check_in || '',
      checkOut: info.check_out || '',
      totalDays: Number(info.total_days || 0),
      weekdayCount: Number(info.weekday_count || 0),
      holidayCount: Number(info.holiday_count || 0),
      guestCount: Number(info.guest_count || 0),
    },
    bookingSummary: {
      zoneTotal: Number(summary.zone_total || 0),
      rentalOriginalTotal: Number(summary.rental_original_total || 0),
      rentalDiscountTotal: Number(summary.rental_discount_total || summary.applied_discount || 0),
      rentalTotal: Number(summary.rental_total || 0),
      finalAmount: Number(summary.final_amount || 0),
    },
    selectedZones: zones,
    selectedRentals: rentals,
  };
}

function createBookingOrderNumber(date) {
  var yyyy = date.getFullYear();
  var mm = String(date.getMonth() + 1).padStart(2, '0');
  var dd = String(date.getDate()).padStart(2, '0');
  var datePart = String(yyyy) + mm + dd;
  var prefix = '#RENT-' + datePart + '-';
  var serial =
    readBookingMockOrders().reduce(function (max, order) {
      var match = String((order && order.orderNumber) || '').match(
        new RegExp('^#?RENT-' + datePart + '-(\\d{4})$')
      );
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;

  // 預約編號使用日期加流水號，避免同一分鐘建立多筆時撞號。
  return prefix + String(serial).padStart(4, '0');
}

function getBookingCheckoutUserId() {
  const user = readBookingCheckoutUser();
  return user && (user.id || user.userId) ? user.id || user.userId : 'user-001';
}

function readBookingCheckoutUser() {
  if (localStorage.getItem('isLoggedIn') === 'false') return null;

  try {
    const rawValue = localStorage.getItem('currentUser');
    const user = rawValue ? JSON.parse(rawValue) : null;
    if (user && user.name) return user;
  } catch (error) {
    console.warn('[booking-checkout] 會員資料解析失敗:', 'currentUser', error);
  }
  return null;
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
