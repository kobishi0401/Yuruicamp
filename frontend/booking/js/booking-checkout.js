/**
 * booking-checkout.js
 * 功能：預約結帳頁邏輯
 *   B3：進頁 createBooking hard lock；N3 自動帶入聯絡資料
 */

const BOOKING_SESSION_KEY = 'lastCheckoutBooking';
const BOOKING_SESSION_FINGERPRINT_KEY = 'lastCheckoutBookingFingerprint';
const BOOKING_IDEMPOTENCY_KEY = 'bookingCheckoutIdempotencyKey';
const BOOKING_FINGERPRINT_KEY = 'bookingCheckoutFingerprint';

let preparedBookingSession = null;
let bookingCheckoutSessionRevision = 0;

$(document).ready(function () {
  const bookingCart = typeof window.readBookingCart === 'function' ? window.readBookingCart() : null;

  if (!bookingCart || !bookingCart.bookingInfo) {
    showToast('購物車資料為空，請重新選擇。', 'warning');
    window.location.href = './booking-cart.html';
    return;
  }

  if (typeof window.writeBookingCart === 'function') {
    window.writeBookingCart(bookingCart);
  }

  renderCheckoutPage(bookingCart);
  initAccordionPanels();
  initPaymentMethod();
  initFillProfileBtn();
  prefillBookingContactFields();
  initPreparedBookingSession(bookingCart);

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

/**
 * 取得目前登入會員（優先 YuruiAuth，其次 localStorage）。
 * 必須有真實 id（customerId）；不再接受只有 name 的殘缺物件。
 */
function getLoggedInUser() {
  if (window.YuruiAuth && typeof window.YuruiAuth.getUser === 'function') {
    var authUser = window.YuruiAuth.getUser();
    if (authUser && authUser.id) return authUser;
  }
  try {
    var user = JSON.parse(localStorage.getItem('yuruiUser') || 'null');
    if (user && user.id) return user;
  } catch {
    // ignore
  }
  return null;
}

/** 將會員姓名、電話、Email 填入訂購人欄位（備註不帶入） */
function fillContactFields(user) {
  if (!user) return;
  if (user.name) $('#contactName').val(user.name);
  if (user.phone) $('#contactPhone').val(user.phone);
  if (user.email) $('#contactEmail').val(user.email);
}

/** 進 checkout 頁自動帶入 name/email/phone（N3） */
async function prefillBookingContactFields() {
  if ($('#contactName').val().trim()) return;

  var user = getLoggedInUser();
  if (!user) return;

  var shippingAddr = null;
  try {
    shippingAddr = await window.API?.shippingAddresses?.getDefault?.();
  } catch (error) {
    console.warn('[booking-checkout] 無法讀取預設配送地址', error);
  }

  var profile = {};
  try {
    profile = JSON.parse(localStorage.getItem('yurui_profile') || '{}');
  } catch {
    profile = {};
  }

  var resolvedName =
    (shippingAddr &&
      `${shippingAddr.lastName || ''}${shippingAddr.firstName || ''}`.trim()) ||
    user.name ||
    profile.name ||
    '';
  var resolvedPhone = shippingAddr?.phone || user.phone || profile.phone || '';
  var resolvedEmail = shippingAddr?.email || user.email || profile.email || '';

  if (resolvedName) $('#contactName').val(resolvedName);
  if (resolvedPhone) $('#contactPhone').val(resolvedPhone);
  if (resolvedEmail) $('#contactEmail').val(resolvedEmail);
}

/** 綁定「帶入會員資料」按鈕 */
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
}

// ============================================================
// 登入守衛
// ============================================================

window.onBookingHeaderReady = function () {
  initLoginGuard();
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
  $('#payOptEcpay').addClass('isSelected');
}

// ============================================================
// 送出結帳
// ============================================================

function initPreparedBookingSession(cart) {
  var revision = ++bookingCheckoutSessionRevision;
  $('#confirmPayBtn').prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> 正在保留庫存...');

  var stored = readPreparedBookingSession(cart);
  if (stored) {
    preparedBookingSession = stored;
    resetConfirmPayButton();
    return;
  }

  createPreparedBookingSession(cart, revision).catch(function (error) {
    console.error('[booking-checkout] 建立預約保留失敗', error);
    var message = error && error.message ? error.message : '暫時無法保留庫存，請返回背包重試。';
    showToast(message, 'error');
    $('#confirmPayBtn').prop('disabled', true).html('<i class="bi bi-exclamation-octagon"></i> 無法保留庫存');
  });
}

function createPreparedBookingSession(cart, revision) {
  if (!window.BookingAPI || typeof window.BookingAPI.createBooking !== 'function') {
    return Promise.reject(new Error('BookingAPI 未載入，請重新整理頁面。'));
  }

  var fingerprint = getBookingCartFingerprint(cart);
  var request = buildBookingPayload(cart, 'ecpay-credit');

  return window.BookingAPI.createBooking(request, cart).then(function (booking) {
    if (revision !== bookingCheckoutSessionRevision) {
      return cancelBookingResult(booking);
    }
    sessionStorage.setItem(BOOKING_SESSION_KEY, JSON.stringify(booking));
    sessionStorage.setItem(BOOKING_SESSION_FINGERPRINT_KEY, fingerprint);
    preparedBookingSession = booking;
    resetConfirmPayButton();
    return booking;
  });
}

function buildBookingPayload(cart, paymentMethod) {
  var info = cart.bookingInfo || {};
  return {
    campgroundId: info.campgroundId,
    checkIn: info.checkIn,
    checkOut: info.checkOut,
    guestCount: Number(info.guestCount) || 1,
    zones: (cart.selectedZones || []).map(function (zone) {
      return { zoneId: zone.zoneId, quantity: Number(zone.quantity) || 1 };
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

function cancelBookingResult(booking) {
  var bookingId = booking && (booking.bookingId || booking.id);
  if (!bookingId || !window.BookingAPI || typeof window.BookingAPI.cancelBooking !== 'function') {
    return Promise.resolve();
  }
  return window.BookingAPI.cancelBooking(bookingId).catch(function (error) {
    console.warn('[booking-checkout] 無法釋放舊的庫存保留：', error);
  });
}

function handleCheckout(cart) {
  var u = getLoggedInUser();
  if (!u) {
    if (typeof window.openModal === 'function') window.openModal('loginModal');
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

  var booking = preparedBookingSession || readPreparedBookingSession(cart);
  if (!booking) {
    showToast('預約保留尚未建立，請重新整理此頁或返回預約背包。', 'warning');
    return;
  }

  $('#confirmPayBtn').prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> 正在前往 ECPay...');

  if (!window.BookingAPI) {
    showToast('BookingAPI 未載入，請重新整理頁面。', 'error');
    resetConfirmPayButton();
    return;
  }

  // 進頁已建立 pending booking；此按鈕帶 contact 快照並取得 ECPay 表單。
  launchEcpayPayment(booking, { name: name, phone: phone, email: email }).catch(function (err) {
    console.error('[booking-checkout] ECPay 導向失敗 / Failed:', err);
    showToast(err && err.message ? err.message : 'ECPay 尚未啟用，請稍後再試。', 'error');
    resetConfirmPayButton();
  });
}

// 將按鈕恢復為可再次嘗試的 ECPay 導向狀態。
function resetConfirmPayButton() {
  $('#confirmPayBtn').prop('disabled', false).html('<i class="bi bi-lock-fill"></i> 前往 ECPay');
}

// 帶 contact 快照向後端取得 ECPay 導向表單。
function launchEcpayPayment(booking, contact) {
  var bookingId = booking && (booking.bookingId || booking.id);
  if (!bookingId) {
    return Promise.reject(new Error('預約已建立，但後端未回傳 bookingId'));
  }
  if (!window.BookingAPI || typeof window.BookingAPI.createEcpayForm !== 'function') {
    return Promise.reject(new Error('ECPay 導向功能尚未載入'));
  }

  return window.BookingAPI.createEcpayForm(bookingId, contact).then(function (launch) {
    submitEcpayForm(launch);
  });
}

// 只提交後端產生的 ECPay 欄位，前端不保存金鑰或產生 CheckMacValue。
function submitEcpayForm(launch) {
  if (!launch || !launch.actionUrl || !launch.fields || typeof launch.fields !== 'object') {
    throw new Error('ECPay 導向資料格式不完整');
  }

  var form = document.createElement('form');
  form.method = 'POST';
  form.action = launch.actionUrl;
  form.hidden = true;

  Object.entries(launch.fields).forEach(function (entry) {
    var input = document.createElement('input');
    input.type = 'hidden';
    input.name = entry[0];
    input.value = String(entry[1]);
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}

// ============================================================
// 讀取預約背包頁建立的 Checkout Session
// ============================================================

function readPreparedBookingSession(cart) {
  try {
    var booking = JSON.parse(sessionStorage.getItem(BOOKING_SESSION_KEY) || 'null');
    var savedFingerprint = sessionStorage.getItem(BOOKING_SESSION_FINGERPRINT_KEY);
    var expiresAt = booking && booking.checkoutExpiresAt;
    var currentFingerprint = JSON.stringify({
      bookingInfo: cart.bookingInfo,
      selectedZones: cart.selectedZones,
      selectedRentals: cart.selectedRentals,
    });

    return booking &&
      (!expiresAt || Date.parse(expiresAt) > Date.now()) &&
      savedFingerprint === currentFingerprint
      ? booking
      : null;
  } catch {
    return null;
  }
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
