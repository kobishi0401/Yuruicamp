import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../storefront/js/pages/checkout.js', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../storefront/pages/checkout.html', import.meta.url), 'utf8');

const createClassList = () => {
  const values = new Set();

  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    toggle: (name, force) => {
      if (force === true) values.add(name);
      else if (force === false) values.delete(name);
      else if (values.has(name)) values.delete(name);
      else values.add(name);
    },
    contains: (name) => values.has(name),
  };
};

const createElement = () => ({
  attributes: new Map(),
  children: [],
  classList: createClassList(),
  dataset: {},
  disabled: false,
  hidden: false,
  textContent: '',
  focus() {},
  querySelector() {
    return null;
  },
  appendChild(child) {
    this.children.push(child);
  },
  replaceChildren() {
    this.children = [];
  },
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  },
  removeAttribute(name) {
    this.attributes.delete(name);
  },
});

const elementIds = [
  'checkoutSessionPanel',
  'checkoutSessionIcon',
  'checkoutSessionBadge',
  'checkoutSessionTitle',
  'checkoutSessionMessage',
  'checkoutSessionDetails',
  'checkoutSessionTimer',
  'checkoutCountdown',
  'returnToCartBtn',
  'confirmOrderBtn',
  'checkoutSubtotal',
  'checkoutShipping',
  'checkoutDiscountRow',
  'checkoutDiscount',
  'checkoutTotal',
  'buyerName',
  'buyerPhone',
  'buyerEmail',
  'checkoutPickupBranch',
  'checkoutShippingAddressDisplay',
  'checkoutShippingAddressEditBtn',
  'panelPayment',
];
const elements = new Map(elementIds.map((id) => [id, createElement()]));
const storageValues = new Map();
const sessionStorage = {
  getItem: (key) => storageValues.get(key) ?? null,
  setItem: (key, value) => storageValues.set(key, String(value)),
  removeItem: (key) => storageValues.delete(key),
};

let openedModal = '';
let clearedCart = 0;
let assignedLocation = '';
let toastMessage = '';
const window = {
  AppConfig: { USE_MOCK_API: false },
  AppState: { cart: [{ variantId: 'V001', quantity: 1 }] },
  API: {
    checkout: {
      confirmCod: async (orderId) => ({
        orderId,
        paymentMethod: 'cod',
        checkoutStep: 'completed',
      }),
    },
  },
  clearCart: () => {
    clearedCart += 1;
    window.AppState.cart = [];
  },
  clearInterval() {},
  formatCurrency: (value) => `NT$${Number(value).toFixed(2)}`,
  openModal: (modalId) => {
    openedModal = modalId;
  },
  showToast: (message) => {
    toastMessage = message;
  },
  isValidEmail: () => false,
  isValidMobile: () => false,
  location: {
    assign: (url) => {
      assignedLocation = url;
    },
  },
  setInterval: () => 7,
};
const document = {
  readyState: 'loading',
  addEventListener() {},
  createElement,
  getElementById: (id) => elements.get(id) || null,
  querySelector: () => ({ value: 'credit' }),
  querySelectorAll: () => [],
};
const context = vm.createContext({
  console,
  Date,
  document,
  JSON,
  Math,
  Number,
  sessionStorage,
  String,
  window,
});
window.document = document;
window.sessionStorage = sessionStorage;
window.window = window;

vm.runInContext(source, context, { filename: 'checkout.js' });

const pricing = {
  subtotal: '3200.00',
  shippingFee: '0.00',
  discount: '0.00',
  total: '3200.00',
};
const confirmButton = elements.get('confirmOrderBtn');

context._renderCheckoutSessionState(
  {
    orderId: 'O-DRAFT',
    checkoutStep: 'draft',
    checkoutExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    paymentMethod: null,
    pricing,
  },
  confirmButton
);
assert.equal(elements.get('checkoutSessionPanel').hidden, true);

assert.equal(
  context._validateCheckoutForm({
    buyerName: '',
    buyerPhone: '',
    buyerEmail: '',
    shippingAddress: null,
    pickupBranchId: '',
    paymentMethod: 'credit',
  }),
  false
);
assert.equal(elements.get('buyerName').classList.contains('isInvalid'), true);
assert.equal(elements.get('buyerName').attributes.get('aria-invalid'), 'true');
assert.equal(toastMessage, '請完成紅色標記的必填資料');
assert.equal(elements.get('checkoutSessionPanel').dataset.state, '');
assert.equal(elements.get('checkoutSessionTimer').hidden, true);
assert.equal(confirmButton.disabled, false);
assert.equal(confirmButton.textContent, '結帳並前往付款');

context._renderCheckoutSessionState(
  {
    orderId: 'O-READY',
    checkoutStep: 'ready_to_pay',
    checkoutExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    paymentMethod: 'ecpay-credit',
    pricing,
  },
  confirmButton
);
// M2：ECPay ready_to_pay 不顯示 Ready 大面板，只保留倒數
assert.equal(elements.get('checkoutSessionPanel').hidden, true);
assert.equal(elements.get('checkoutSessionPanel').dataset.state, '');
assert.equal(elements.get('checkoutSessionTimer').hidden, false);
assert.match(elements.get('checkoutCountdown').textContent, /^1[45]:[0-5][0-9]$/);
assert.equal(confirmButton.disabled, false);
assert.equal(confirmButton.textContent, '結帳並前往付款');
assert.equal(elements.get('checkoutTotal').textContent, 'NT$3200.00');

storageValues.set('checkoutIdempotencyKey', 'COD-KEY');
storageValues.set('checkoutCompletedOrderId', 'O-COD');
storageValues.set('lastCheckoutSession', JSON.stringify({ orderId: 'O-COD' }));
window.AppState.cart = [{ variantId: 'V001', quantity: 1 }];
await context._continueReadyCheckout(
  {
    orderId: 'O-COD',
    paymentMethod: 'cod',
    checkoutStep: 'ready_to_pay',
  },
  confirmButton
);
assert.equal(clearedCart, 1);
assert.equal(window.AppState.cart.length, 0);
assert.equal(storageValues.has('checkoutIdempotencyKey'), false);
assert.equal(storageValues.has('checkoutCompletedOrderId'), false);
assert.equal(storageValues.has('lastCheckoutSession'), false);
assert.equal(assignedLocation, '/storefront/pages/checkout-success.html?orderId=O-COD');

window.AppState.cart = [{ variantId: 'V001', quantity: 1 }];
storageValues.set('checkoutIdempotencyKey', 'KEY-1');
storageValues.set('checkoutCompletedOrderId', 'O-READY');
storageValues.set('lastCheckoutSession', '{}');
context._handleCheckoutExpired();
assert.equal(storageValues.has('checkoutIdempotencyKey'), false);
assert.equal(storageValues.has('checkoutCompletedOrderId'), false);
assert.equal(elements.get('checkoutSessionPanel').dataset.state, 'isExpired');
assert.match(elements.get('checkoutSessionMessage').textContent, /庫存已釋放/);
assert.equal(window.AppState.cart.length, 1);
assert.equal(confirmButton.textContent, '請先返回確認背包');
assert.equal(confirmButton.disabled, true);

context._handleCheckoutError({ code: 'UNAUTHORIZED' }, confirmButton);
assert.equal(openedModal, 'loginModal');
assert.equal(elements.get('checkoutSessionTitle').textContent, '請先登入');

context._handleCheckoutError(
  {
    code: 'STOCK_INSUFFICIENT',
    message: '商品庫存不足',
    details: [{ field: 'stock', reason: '測試商品商品數量剩餘: 2' }],
  },
  confirmButton
);
assert.equal(elements.get('checkoutSessionDetails').children[0].textContent, '測試商品商品數量剩餘: 2');
assert.equal(confirmButton.textContent, '商品剩餘數量不足請重新調整數量');
assert.equal(elements.get('returnToCartBtn').hidden, false);

context._handleCheckoutError(
  {
    code: 'VALIDATION_ERROR',
    details: [{ field: 'shipping.phone', reason: 'must not be blank' }],
  },
  confirmButton
);
assert.equal(elements.get('buyerPhone').classList.contains('isInvalid'), true);
assert.equal(elements.get('buyerPhone').attributes.get('aria-invalid'), 'true');
assert.equal(elements.get('checkoutSessionPanel').hidden, true);

storageValues.set('checkoutIdempotencyKey', 'CONFLICT-KEY');
context._handleCheckoutError(
  {
    code: 'CONFLICT',
    message: 'Idempotency key was already used with a different checkout request',
  },
  confirmButton
);
assert.equal(storageValues.has('checkoutIdempotencyKey'), false);
assert.equal(confirmButton.textContent, '請先返回確認背包');
assert.equal(confirmButton.disabled, true);

context._handleCheckoutError({ code: 'INTERNAL_ERROR' }, confirmButton);
assert.match(elements.get('checkoutSessionMessage').textContent, /稍後再試/);

assert(source.includes('API.checkout.updateSession('));
assert(source.includes('_buildCheckoutUpdateRequest'));
assert(!source.includes('更新結帳資料'));
assert(pageSource.includes('class="checkoutStepItem isCompleted"'));
assert(pageSource.includes('class="checkoutStepItem isSelected"'));

for (const panelName of ['Buyer', 'Shipping', 'Payment']) {
  assert.match(pageSource, new RegExp(`<section class="checkoutPanel isOpen" id="panel${panelName}"`));
  assert.match(pageSource, new RegExp(`aria-expanded="true"[\\s\\S]*?aria-controls="panel${panelName}Body"`));
  assert.match(pageSource, new RegExp(`<div class="checkoutPanelBody" id="panel${panelName}Body">`));
}

console.log('checkout session UI checks passed');
