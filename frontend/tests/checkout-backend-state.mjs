import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const checkoutSource = readFileSync(new URL('../storefront/js/pages/checkout.js', import.meta.url), 'utf8');
const checkoutHtml = readFileSync(new URL('../storefront/pages/checkout.html', import.meta.url), 'utf8');

const createClassList = () => {
  const values = new Set();
  return {
    add: (value) => values.add(value),
    remove: (value) => values.delete(value),
    toggle: (value, force) => {
      if (force === true) values.add(value);
      else if (force === false) values.delete(value);
      else if (values.has(value)) values.delete(value);
      else values.add(value);
    },
    contains: (value) => values.has(value),
  };
};

const element = () => ({
  attributes: new Map(),
  classList: createClassList(),
  disabled: false,
  hidden: false,
  innerHTML: '',
  placeholder: '',
  textContent: '',
  value: '',
  addEventListener() {},
  focus() {},
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  },
});

const elements = new Map([
  ['checkoutSubtotal', element()],
  ['checkoutShipping', element()],
  ['checkoutDiscountRow', element()],
  ['checkoutDiscount', element()],
  ['checkoutTotal', element()],
  ['checkoutPricingSource', element()],
  ['checkoutCouponInput', element()],
  ['checkoutApplyCouponBtn', element()],
  ['checkoutCouponPanel', element()],
  ['checkoutCouponMsg', element()],
  ['checkoutAppliedCouponTexts', element()],
  ['ecpayPaymentNotice', element()],
  ['codPaymentNotice', element()],
  ['checkoutActionStatus', element()],
  ['confirmOrderBtn', element()],
]);

let selectedPayment = 'credit';
let couponCatalogLoads = 0;
let renderedCouponCodes = [];
const couponUpdateCalls = [];
const sessionStorage = new Map();
const context = vm.createContext({
  console,
  sessionStorage: {
    getItem: (key) => sessionStorage.get(key) ?? null,
    setItem: (key, value) => sessionStorage.set(key, String(value)),
    removeItem: (key) => sessionStorage.delete(key),
  },
  document: {
    readyState: 'loading',
    addEventListener() {},
    getElementById: (id) => elements.get(id) || null,
    querySelector: (selector) =>
      selector === 'input[name="paymentMethod"]:checked' ? { value: selectedPayment } : null,
  },
  window: {
    AppConfig: { USE_MOCK_API: false },
    AppState: { cart: [], currentUser: { id: 'U001' } },
    API: {
      coupons: {
        getMine: async () => [
          {
            id: 71,
            status: 'claimed',
            coupon: { id: 7, code: 'WELCOME100' },
          },
          {
            id: 72,
            status: 'consumed',
            coupon: { id: 8, code: 'USED200' },
          },
          {
            id: 73,
            status: 'revoked',
            coupon: { id: 9, code: 'REVOKED300' },
          },
          {
            id: 74,
            status: 'expired',
            coupon: { id: 10, code: 'EXPIRED400' },
          },
        ],
        claim: async (couponId) => ({
          id: 71,
          couponId,
          status: 'claimed',
          coupon: { id: couponId, code: 'WELCOME100' },
        }),
      },
      checkout: {
        updateSession: async (orderId, request) => {
          couponUpdateCalls.push({ orderId, request });
          const removing = Object.keys(request).length === 0;
          return {
            orderId,
            status: 'unshipped',
            checkoutStep: 'draft',
            checkoutExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            couponClaimId: removing ? null : request.couponClaimId,
            pricing: {
              subtotal: '3200.00',
              shippingFee: '100.00',
              discount: removing ? '0.00' : '200.00',
              total: removing ? '3300.00' : '3100.00',
            },
          };
        },
      },
    },
    YuruiCoupons: {
      loadCoupons: async () => {
        couponCatalogLoads += 1;
        return [
          { id: 7, code: 'WELCOME100' },
          { id: 8, code: 'USED200' },
          { id: 9, code: 'REVOKED300' },
          { id: 10, code: 'EXPIRED400' },
          { id: 11, code: 'AVAILABLE500' },
        ];
      },
      renderCouponOptions: (_id, coupons) => {
        renderedCouponCodes = coupons.map((coupon) => coupon.code);
      },
      findCouponByCode: (coupons, code) => coupons.find((coupon) => coupon.code === code) || null,
    },
    formatCurrency: (value) => `NT$${Number(value).toFixed(2)}`,
    showToast() {},
    setInterval: () => 1,
    clearInterval() {},
  },
});
context.window.window = context.window;
context.window.sessionStorage = context.sessionStorage;
context.window.document = context.document;

vm.runInContext(checkoutSource, context, { filename: 'checkout.js' });

context._applyCheckoutSessionPricing({
  subtotal: '3200.00',
  shippingFee: '100.00',
  discount: '200.00',
  total: '3100.00',
});
assert.equal(elements.get('checkoutSubtotal').textContent, 'NT$3200.00');
assert.equal(elements.get('checkoutShipping').textContent, 'NT$100.00');
assert.equal(elements.get('checkoutDiscount').textContent, '-NT$200.00');
assert.equal(elements.get('checkoutTotal').textContent, 'NT$3100.00');
assert.equal(elements.get('checkoutDiscountRow').hidden, false);

sessionStorage.set('checkoutCompletedOrderId', 'O001');
sessionStorage.set(
  'lastCheckoutSession',
  JSON.stringify({
    orderId: 'O001',
    status: 'unshipped',
    checkoutStep: 'draft',
    couponClaimId: null,
    pricing: {
      subtotal: '3200.00',
      shippingFee: '100.00',
      discount: '200.00',
      total: '3100.00',
    },
  })
);
context._updateCheckoutSummary();
assert.equal(elements.get('checkoutTotal').textContent, 'NT$3100.00');

context._initCheckoutCoupon();
await context._initBackendCheckoutCoupon();
assert.equal(elements.get('checkoutCouponInput').disabled, false);
assert.equal(elements.get('checkoutApplyCouponBtn').disabled, false);
assert.equal(elements.get('checkoutCouponInput').placeholder, '輸入或選擇一組折扣碼');
assert.equal(couponCatalogLoads, 1);
assert.deepEqual(renderedCouponCodes, ['WELCOME100', 'AVAILABLE500']);

elements.get('checkoutCouponInput').value = 'welcome100';
await context._applyCheckoutCouponCode({ showToast: false });
assert.deepEqual(JSON.parse(JSON.stringify(couponUpdateCalls[0])), {
  orderId: 'O001',
  request: { couponClaimId: 71 },
});
assert.equal(elements.get('checkoutDiscount').textContent, '-NT$200.00');
assert.equal(elements.get('checkoutTotal').textContent, 'NT$3100.00');
assert.match(elements.get('checkoutAppliedCouponTexts').innerHTML, /WELCOME100/);
assert.match(elements.get('checkoutCouponMsg').textContent, /已套用/);
assert.deepEqual(renderedCouponCodes, ['AVAILABLE500']);

const checkoutUpdateRequest = context._buildCheckoutUpdateRequest({
  buyerName: '測試會員',
  buyerPhone: '0912345678',
  deliveryAddress: '台北市測試路 1 號',
  pickupBranchId: '',
});
assert.equal(
  Object.hasOwn(checkoutUpdateRequest, 'couponClaimId'),
  false,
  '確認結帳不應重送目前 Session 已套用的 couponClaimId'
);

sessionStorage.set(
  'lastCheckoutSession',
  JSON.stringify({
    orderId: 'O001',
    couponClaimId: 72,
  })
);
const switchedCouponUpdateRequest = context._buildCheckoutUpdateRequest({
  buyerName: '測試會員',
  buyerPhone: '0912345678',
  deliveryAddress: '台北市測試路 1 號',
  pickupBranchId: '',
});
assert.equal(switchedCouponUpdateRequest.couponClaimId, 71);

sessionStorage.set(
  'lastCheckoutSession',
  JSON.stringify({
    orderId: 'O001',
    status: 'unshipped',
    checkoutStep: 'draft',
    couponClaimId: 71,
  })
);
await context._removeBackendCheckoutCoupon();
assert.deepEqual(JSON.parse(JSON.stringify(couponUpdateCalls[1])), {
  orderId: 'O001',
  request: {},
});
assert.equal(elements.get('checkoutDiscountRow').hidden, true);
assert.equal(elements.get('checkoutTotal').textContent, 'NT$3300.00');
assert.equal(elements.get('checkoutAppliedCouponTexts').hidden, true);
assert.deepEqual(renderedCouponCodes, ['WELCOME100', 'AVAILABLE500']);

context._showBackendCouponError({ code: 'COUPON_SOLD_OUT' });
assert.equal(elements.get('checkoutCouponMsg').textContent, '此優惠券已領完');

context._syncPaymentNoticeState();
assert.equal(elements.get('ecpayPaymentNotice').hidden, false);
assert.equal(elements.get('codPaymentNotice').hidden, true);
selectedPayment = 'cod';
context._syncPaymentNoticeState();
assert.equal(elements.get('ecpayPaymentNotice').hidden, true);
assert.equal(elements.get('codPaymentNotice').hidden, false);

assert.equal(
  context._shouldConfirmCodImmediately({
    paymentMethod: 'cod',
    checkoutStep: 'ready_to_pay',
  }),
  true
);
assert.equal(
  context._shouldConfirmCodImmediately({
    paymentMethod: 'cod',
    checkoutStep: 'draft',
  }),
  false
);
assert.equal(
  context._shouldConfirmCodImmediately({
    paymentMethod: 'ecpay-credit',
    checkoutStep: 'ready_to_pay',
  }),
  false
);

const confirmButton = element();
context._showCheckoutSessionReady(
  {
    orderId: 'O001',
    paymentMethod: 'ecpay-credit',
    checkoutStep: 'ready_to_pay',
    checkoutExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    pricing: {
      subtotal: '3200.00',
      shippingFee: '100.00',
      discount: '200.00',
      total: '3100.00',
    },
  },
  confirmButton
);
assert.equal(confirmButton.disabled, false);
assert.equal(confirmButton.textContent, '確認結帳');

context._showCheckoutEstimateState();
assert.equal(elements.get('confirmOrderBtn').disabled, true);
assert.equal(elements.get('confirmOrderBtn').textContent, '請先返回確認背包');

assert(!checkoutHtml.includes('id="cardNumber"'));
assert(!checkoutHtml.includes('id="cardExpiry"'));
assert(!checkoutHtml.includes('id="cardCvv"'));
assert(checkoutHtml.includes('下一步將前往 ECPay'));
assert(!checkoutHtml.includes('id="checkoutPricingSource"'));
assert(!checkoutHtml.includes('id="checkoutActionStatus"'));
assert.match(checkoutHtml, /id="checkoutCouponInput"[\s\S]*?autocomplete="off"/);
assert.match(checkoutHtml, /id="checkoutCouponInput"[\s\S]*?name="checkoutCouponCode"/);
assert(!checkoutSource.includes('lastCheckoutOrder'));
assert(!checkoutSource.includes('markFirstPurchaseUsed'));
assert(!checkoutSource.includes('API.orders.create'));

console.log('checkout backend state test passed');
