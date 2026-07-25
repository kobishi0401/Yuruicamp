import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const apiSource = readFileSync(join(rootDir, 'admin/js/admin-api.js'), 'utf8');
const productSource = readFileSync(join(rootDir, 'admin/js/products.js'), 'utf8');
const calls = [];
const window = {
  AppConfig: { API_BASE_URL: 'http://localhost:8080/api' },
  ApiClient: {
    _restRequest: async (path, options) => {
      calls.push({ path, options });
      return {};
    },
  },
  console,
};

vm.runInNewContext(apiSource, { window, console, URLSearchParams }, { filename: 'admin-api.js' });
window.AdminAPI.configure({ useBackend: true });

await window.AdminAPI.products.list({ page: 1, size: 20, status: 'inactive', sort: 'name,asc' });
await window.AdminAPI.products.getById('P / 1');
await window.AdminAPI.products.getLookups();
await window.AdminAPI.products.create({ name: '商品' });
await window.AdminAPI.products.update('P-1', { name: '更新商品' });
await window.AdminAPI.products.activate('P-1');
await window.AdminAPI.products.deactivate('P-1');

assert.deepEqual(
  calls.map((call) => [call.options.method, call.path]),
  [
    ['GET', '/products?page=1&size=20&status=inactive&sort=name%2Casc'],
    ['GET', '/products/P%20%2F%201'],
    ['GET', '/products/lookups'],
    ['POST', '/products'],
    ['PUT', '/products/P-1'],
    ['POST', '/products/P-1/activate'],
    ['POST', '/products/P-1/deactivate'],
  ],
);
assert.equal(calls.every((call) => call.options.auth === 'required'), true);
assert.equal(calls.some((call) => call.path.startsWith('/api/')), false);

const productContext = { window: {}, console };
vm.runInNewContext(productSource, productContext, { filename: 'products.js' });
const mapped = productContext.mapAdminProductResponse({
  id: 'P001',
  itemId: 'E001',
  status: 'active',
  name: '測試帳篷',
  categoryId: 1,
  category: '帳篷',
  brandId: 'coleman',
  brand: 'Coleman',
  description: '<p>測試</p>',
  image: '/assets/test.jpg',
  images: [{ sortOrder: 0, url: '/assets/test.jpg', altText: '測試帳篷' }],
  price: '3200.00',
  variants: [{
    id: 'V001',
    sku: 'TEST-001',
    color: '綠色',
    size: null,
    specification: '綠色',
    price: '3200.00',
    status: 'active',
    onHandQuantity: 10,
    availableQuantity: 8,
    stockLocations: [{
      locationId: 'main',
      locationType: 'main',
      branchId: null,
      onHandQuantity: 10,
    }],
  }],
});

assert.equal(mapped.branch.main, 10);
assert.equal(mapped.totalStock, 10);
assert.equal(mapped.variants[0].sku, 'TEST-001');
assert.equal(mapped.rentalEnabled, undefined);
assert.equal(mapped.camp, undefined);

const requestFunction = productSource.slice(
  productSource.indexOf('function buildAdminProductRequestFromForm'),
  productSource.indexOf('/** 正式後端商品送出流程'),
);
assert.equal(requestFunction.includes('totalStock:'), false);
assert.equal(requestFunction.includes('rentalEnabled:'), false);
assert.equal(requestFunction.includes('camp:'), false);
// ADM-W2-08：允許 stockLocations；仍禁止把前端 branch map 整包送出
assert.match(requestFunction, /stockLocations/);
assert.equal(requestFunction.includes('branch: newBranch'), false);
assert.equal(requestFunction.includes('branch: variant.branch'), false);
assert.match(productSource, /operation\.then\(function \(response\)/);
assert.equal(/AdminAPI\.products\.update\(product\.id,\s*product\)/.test(productSource), false);
assert.match(productSource, /product_stock_update/);

console.log('Admin Products facade and mapping tests passed.');
