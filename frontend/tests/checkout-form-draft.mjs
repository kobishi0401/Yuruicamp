import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../storefront/js/pages/checkout.js', import.meta.url), 'utf8');

const createField = (value = '') => ({
  value,
  addEventListener() {},
});

const fields = new Map([
  ['buyerName', createField('王小明')],
  ['buyerPhone', createField('0912345678')],
  ['buyerEmail', createField('buyer@example.test')],
  ['buyerNote', createField('管理室代收')],
  [
    'checkoutPickupBranch',
    {
      ...createField('branch-002'),
      options: [{ value: '' }, { value: 'branch-001' }, { value: 'branch-002' }],
    },
  ],
]);

const shippingRadios = [
  { value: 'delivery', checked: false, disabled: false },
  { value: 'pickup', checked: true, disabled: false },
];
const paymentRadios = [
  { value: 'credit', checked: false, disabled: false },
  { value: 'cod', checked: true, disabled: false },
];
const storageValues = new Map([
  ['checkoutCartFingerprint', '[{"variantId":"V001","quantity":1}]'],
  ['checkoutCompletedOrderId', 'O-DRAFT'],
]);
const sessionStorage = {
  getItem: (key) => storageValues.get(key) ?? null,
  setItem: (key, value) => storageValues.set(key, String(value)),
  removeItem: (key) => storageValues.delete(key),
};

let currentAddress = {
  recipientName: '王小明',
  phone: '0912345678',
  postalCode: '100',
  city: '臺北市',
  district: '中正區',
  addressLine: '測試路 1 號',
};
const document = {
  readyState: 'loading',
  addEventListener() {},
  getElementById: (id) => fields.get(id) || null,
  querySelector: (selector) => {
    if (selector === 'input[name="paymentMethod"]:checked') {
      return paymentRadios.find((radio) => radio.checked) || null;
    }
    return null;
  },
  querySelectorAll: (selector) => {
    if (selector === 'input[name="shippingMethod"]') return shippingRadios;
    if (selector === 'input[name="paymentMethod"]') return paymentRadios;
    return [];
  },
};
const window = {
  AppState: {
    currentUser: { id: 'U001' },
    cart: [{ variantId: 'V001', quantity: 1 }],
  },
  YuruiShippingAddressUI: {
    getAddress: () => ({ ...currentAddress }),
    setAddress: (address) => {
      currentAddress = { ...address };
    },
  },
  formatShippingAddressLine: () => '',
};
const context = vm.createContext({
  Array,
  console,
  document,
  JSON,
  sessionStorage,
  window,
});
window.document = document;
window.sessionStorage = sessionStorage;
window.window = window;

vm.runInContext(source, context, { filename: 'checkout.js' });

vm.runInContext("selectedShippingMethod = 'pickup'", context);
context._saveCheckoutFormDraft();

const savedDraft = JSON.parse(sessionStorage.getItem('checkoutFormDraft'));
assert.equal(savedDraft.customerId, 'U001');
assert.equal(savedDraft.orderId, 'O-DRAFT');
assert.equal(savedDraft.buyerName, '王小明');
assert.equal(savedDraft.shippingMethod, 'pickup');
assert.equal(savedDraft.pickupBranchId, 'branch-002');
assert.equal(savedDraft.paymentMethod, 'cod');
assert.equal(savedDraft.shippingAddress.addressLine, '測試路 1 號');
assert.equal('cardNumber' in savedDraft, false);
assert.equal('cvv' in savedDraft, false);

fields.get('buyerName').value = '';
fields.get('buyerPhone').value = '';
fields.get('buyerEmail').value = '';
fields.get('buyerNote').value = '';
fields.get('checkoutPickupBranch').value = '';
shippingRadios[0].checked = true;
shippingRadios[1].checked = false;
paymentRadios[0].checked = true;
paymentRadios[1].checked = false;
currentAddress = {};

assert.equal(context._restoreCheckoutFormDraft(), true);
assert.equal(fields.get('buyerName').value, '王小明');
assert.equal(fields.get('buyerPhone').value, '0912345678');
assert.equal(fields.get('buyerEmail').value, 'buyer@example.test');
assert.equal(fields.get('buyerNote').value, '管理室代收');
assert.equal(fields.get('checkoutPickupBranch').value, 'branch-002');
assert.equal(shippingRadios[1].checked, true);
assert.equal(paymentRadios[1].checked, true);
assert.equal(currentAddress.addressLine, '測試路 1 號');

window.AppState.currentUser.id = 'U002';
assert.equal(context._restoreCheckoutFormDraft(), false);
assert.equal(sessionStorage.getItem('checkoutFormDraft'), null);

console.log('checkout form draft checks passed');
