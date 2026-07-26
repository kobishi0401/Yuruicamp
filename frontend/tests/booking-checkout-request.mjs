import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const cartSource = readFileSync(join(rootDir, 'booking/js/booking-cart.js'), 'utf8');
const checkoutSource = readFileSync(join(rootDir, 'booking/js/booking-checkout.js'), 'utf8');
const cartPageSource = readFileSync(join(rootDir, 'booking/pages/booking-cart.html'), 'utf8');
const checkoutPageSource = readFileSync(join(rootDir, 'booking/pages/booking-checkout.html'), 'utf8');
const sessionValues = new Map();
let createCalls = 0;
let ecpayContact = null;

const chain = new Proxy(
  {},
  {
    get: () => () => chain,
  }
);
const jquery = () => chain;
jquery.fn = {};

const sessionStorage = {
  getItem: (key) => sessionValues.get(key) ?? null,
  setItem: (key, value) => sessionValues.set(key, value),
  removeItem: (key) => sessionValues.delete(key),
};

const window = {
  crypto: {
    randomUUID: () => 'c8475d58-52fa-4df5-9c99-125468651ccc',
  },
  BookingAPI: {
    createBooking: async (request) => {
      createCalls += 1;
      return { bookingId: 'B001', displayNo: 'BK-0001', request };
    },
    createEcpayForm: async (bookingId, contact) => {
      ecpayContact = contact;
      return { actionUrl: 'https://payment.example/ecpay', fields: { MerchantTradeNo: 'T1' } };
    },
    cancelBooking: async () => ({}),
  },
  addEventListener: () => {},
};

const document = {
  createElement: (tag) => ({
    tagName: tag,
    method: '',
    action: '',
    hidden: false,
    appendChild: () => {},
    submit: () => {},
  }),
  body: { appendChild: () => {} },
};

const context = vm.createContext({
  window,
  document,
  localStorage: { removeItem: () => {}, getItem: () => null },
  sessionStorage,
  $: jquery,
  console,
  Date,
  Math,
  JSON,
  Number,
  String,
  Promise,
});

vm.runInContext(checkoutSource, context, { filename: 'booking-checkout.js' });

const cart = {
  bookingInfo: {
    campgroundId: 'C002',
    campgroundName: '不可送出的顯示快照',
    region: '北部',
    checkIn: '2026-08-01',
    checkOut: '2026-08-03',
    guestCount: 2,
  },
  selectedZones: [{ zoneId: 'Z001', zoneType: '草地區', quantity: 1, subtotal: 2000 }],
  selectedRentals: [
    {
      equipmentId: 'RL001',
      rentalListingId: 'RL001',
      rentalSkuVariantId: 'RSV001',
      name: '不可送出的裝備快照',
      quantity: 2,
      subtotal: 400,
    },
  ],
  summary: { zoneTotal: 2000, rentalTotal: 400, finalAmount: 2400 },
};

const request = context.buildBookingPayload(cart, 'ecpay-credit');
assert.deepEqual(
  Object.keys(request).sort(),
  [
    'campgroundId',
    'checkIn',
    'checkOut',
    'guestCount',
    'zones',
    'rentals',
    'couponClaimId',
    'paymentMethod',
    'idempotencyKey',
  ].sort()
);
assert.deepEqual(JSON.parse(JSON.stringify(request.zones)), [{ zoneId: 'Z001', quantity: 1 }]);
assert.equal(request.paymentMethod, 'ecpay-credit');

await context.createPreparedBookingSession(cart, 0);
assert.equal(createCalls, 1, 'booking-checkout should create booking on entry (B3)');
assert.equal(JSON.parse(sessionStorage.getItem('lastCheckoutBooking')).displayNo, 'BK-0001');

await context.launchEcpayPayment({ bookingId: 'B001' }, { name: '王小明', phone: '0911222333', email: 'a@b.c' });
assert.deepEqual(ecpayContact, { name: '王小明', phone: '0911222333', email: 'a@b.c' });

assert(!cartSource.includes('BookingAPI.createBooking'), 'booking-cart must not create booking (B3)');
assert(!cartSource.includes('prepareBookingCheckoutSession'));
assert(cartSource.includes('initBookingCartCheckoutLink'));
assert(checkoutSource.includes('BookingAPI.createBooking'));
assert(checkoutSource.includes('BookingAPI.createEcpayForm(bookingId, contact)'));

assert(cartPageSource.includes('沒有預約營地、租賃裝備請前往預約首頁預約。'));
assert(checkoutPageSource.includes('id="confirmPayBtn"'));
assert(checkoutPageSource.includes('前往 ECPay'));

console.log('Booking Checkout Request checks passed');
