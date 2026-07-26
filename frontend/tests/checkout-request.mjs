import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const cartSource = readFileSync(join(rootDir, 'storefront/js/pages/cart.js'), 'utf8');
const checkoutSource = readFileSync(join(rootDir, 'storefront/js/pages/checkout.js'), 'utf8');
const cartPageSource = readFileSync(join(rootDir, 'storefront/pages/cart.html'), 'utf8');
const sessionValues = new Map();
let uuidSequence = 0;
let createSessionCalls = 0;

const sessionStorage = {
  getItem: (key) => sessionValues.get(key) ?? null,
  setItem: (key, value) => sessionValues.set(key, String(value)),
  removeItem: (key) => sessionValues.delete(key),
};

const window = {
  AppState: {
    cart: [
      {
        id: 'P001',
        variantId: 'V001',
        name: 'Coleman 六人帳篷',
        price: 3200,
        quantity: 1,
      },
    ],
    isLoggedIn: true,
    currentUser: { id: 'C001', name: 'Tester', email: 't@example.test', phone: '0912345678' },
  },
  AppConfig: { USE_MOCK_API: false, CART: { MAX_QUANTITY: 999 } },
  crypto: {
    randomUUID: () =>
      uuidSequence++ === 0 ? '8ca3d465-1111-4111-8111-111111111111' : '8ca3d465-2222-4222-8222-222222222222',
  },
  API: {
    checkout: {
      createSession: async (request) => {
        createSessionCalls += 1;
        return {
          orderId: `O-${createSessionCalls}`,
          displayNo: `ORD-000${createSessionCalls}`,
          checkoutStep: 'draft',
          checkoutExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          pricing: {
            subtotal: String(request.items[0].quantity * 3200),
            shippingFee: '0.00',
            discount: '0.00',
            total: String(request.items[0].quantity * 3200),
          },
          request,
        };
      },
    },
    products: {
      getCatalog: async () => ({
        products: [{ id: 'P001', variants: [{ id: 'V001', availableQuantity: 10, inStock: true }] }],
      }),
    },
  },
  calculateCartTotal: (cart) => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
  calculateShippingFee: () => 0,
  formatCurrency: (value) => `NT$${Number(value).toFixed(2)}`,
  showToast: () => {},
  addEventListener: () => {},
};

const document = {
  body: { dataset: {} },
  readyState: 'loading',
  addEventListener: () => {},
  createElement: (tag) => ({
    tagName: tag,
    method: '',
    action: '',
    hidden: false,
    appendChild: () => {},
  }),
  getElementById: (id) => (id === 'confirmOrderBtn' ? { disabled: false, classList: { remove: () => {}, add: () => {} }, textContent: '' } : null),
};

const context = vm.createContext({
  window,
  document,
  sessionStorage,
  console,
  Date,
  JSON,
  Math,
  Number,
  String,
  Promise,
});

vm.runInContext(checkoutSource, context, { filename: 'checkout.js' });

const items = context._buildCheckoutRequestItems(window.AppState.cart);
assert.deepEqual(JSON.parse(JSON.stringify(items)), [{ variantId: 'V001', quantity: 1 }]);

sessionStorage.setItem('checkoutCartFingerprint', JSON.stringify(items));
const idempotencyKey = context._getCheckoutIdempotencyKey(window.AppState.cart);
assert.equal(idempotencyKey, '8ca3d465-1111-4111-8111-111111111111');

const session = await window.API.checkout.createSession({
  items,
  idempotencyKey,
});
assert.equal(createSessionCalls, 1, 'checkout entry should call createSession (B3 contract)');
assert.equal(session.displayNo, 'ORD-0001');

assert(!cartSource.includes('API.checkout.createSession'), 'cart must not create session (B3)');
assert(cartSource.includes('_runStorefrontCartSoftValidation'));
assert(checkoutSource.includes('API.checkout.createSession'));
assert(checkoutSource.includes('API.checkout.updateSession'));
assert(cartPageSource.includes('id="storefrontCartCheckoutLink"'));

console.log('Storefront Cart Checkout Request checks passed');
