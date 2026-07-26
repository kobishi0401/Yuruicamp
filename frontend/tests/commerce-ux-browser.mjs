/**
 * Commerce UX browser QA（靜態原始碼檢查）
 * Static source checks for displayNo, B3 lock timing, M2, stock UX, O2 contact.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function read(relativePath) {
  return readFileSync(join(rootDir, relativePath), 'utf8');
}

// ── B3：cart 不鎖、checkout 才鎖 ──
const cartJs = read('storefront/js/pages/cart.js');
const checkoutJs = read('storefront/js/pages/checkout.js');
const bookingCartJs = read('booking/js/booking-cart.js');
const bookingCheckoutJs = read('booking/js/booking-checkout.js');

assert(!cartJs.includes('API.checkout.createSession'), 'cart.js must not hard-lock via createSession');
assert.match(cartJs, /soft 驗量|soft validation/i);
assert(checkoutJs.includes('_initCheckoutSessionOnEntry'));
assert(checkoutJs.includes('API.checkout.createSession'));
assert(!bookingCartJs.includes('initBookingCheckoutSession'));
assert(!bookingCartJs.includes('prepareBookingCheckoutSession'));
assert(bookingCheckoutJs.includes('BookingAPI.createBooking'));
assert(bookingCheckoutJs.includes('initPreparedBookingSession'));

// ── M2：ECPay 一次跳轉 + 按鈕文案 ──
assert(checkoutJs.includes('結帳並前往付款'));
assert.match(
  checkoutJs,
  /checkoutStep === 'ready_to_pay'[\s\S]*_continueReadyCheckout/,
  'ECPay should continue immediately after ready_to_pay'
);

// ── O2：租借 ECPay 帶 contact body ──
const bookingApiJs = read('storefront/js/booking-api.js');
assert(bookingApiJs.includes('body: { contact'));
assert(bookingCheckoutJs.includes('createEcpayForm(bookingId, contact)'));

// ── displayNo formatters ──
const formattersJs = read('storefront/js/formatters.js');
const idUtilsJs = read('admin/js/id-utils.js');
const formattersContext = vm.createContext({ window: {}, console });
vm.runInContext(formattersJs, formattersContext, { filename: 'formatters.js' });
assert.equal(formattersContext.window.formatOrderDisplayId({ displayNo: 'ORD-0018' }), 'ORD-0018');
assert.equal(formattersContext.window.formatBookingDisplayId({ displayNo: 'BK-0042' }), 'BK-0042');
assert.equal(formattersContext.window.formatOrderDisplayId(3), 'ORD-0003');
assert.match(idUtilsJs, /displayNo/);

// ── 成功頁無 # ──
const checkoutSuccessJs = read('storefront/js/pages/checkout-success.js');
const bookingSuccessHtml = read('booking/pages/booking-success.html');
assert(!checkoutSuccessJs.includes("'#' +"));
assert(bookingSuccessHtml.includes("params.get('bookingId')"));
assert(!bookingSuccessHtml.includes("'#--'"));

// ── 庫存 UX ──
const productListJs = read('storefront/js/pages/product-list.js');
const productDetailJs = read('storefront/js/pages/product-detail.js');
const cartComponentJs = read('storefront/js/components/cart.js');
assert.match(productListJs, /剩餘.*件|availableQuantity/);
assert.match(productDetailJs, /剩餘.*件|availableQuantity/);
assert.match(cartComponentJs, /僅剩.*件/);

// ── N3 自動帶入 ──
assert(checkoutJs.includes('_prefillCheckoutContactFields'));
assert(bookingCheckoutJs.includes('prefillBookingContactFields'));

// ── Admin history label ──
const bookingsAdminJs = read('admin/js/bookings.js');
const ordersAdminJs = read('admin/js/orders.js');
assert.match(bookingsAdminJs, /entry\.label|label/);
assert.match(bookingsAdminJs, /detail\.contact|contact\./);
assert.match(ordersAdminJs, /entry\.label|label/);

console.log('Commerce UX browser static QA passed');
