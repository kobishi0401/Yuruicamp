import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const apiSource = readFileSync(join(rootDir, 'storefront/js/api-mock.js'), 'utf8');
const calls = [];
const product = {
  id: 'P001',
  itemId: 'E001',
  status: 'active',
  name: '測試帳篷',
  category: '帳篷',
  brand: 'Yuruicamp',
  description: null,
  image: '/assets/images/products/P001-1.jpg',
  price: '3200.00',
  rating: '4.5',
  reviewCount: 10,
  variants: [
    {
      id: 'V001',
      sku: 'TENT-001',
      color: null,
      size: null,
      specification: '標準',
      price: '3200.00',
      availableQuantity: 5,
      inStock: true,
    },
  ],
};
const window = {
  AppConfig: { USE_MOCK_API: false },
  ApiClient: {
    _restRequest: async (path, options) => {
      calls.push({ path, options });
      if (path.startsWith('/products/bestsellers')) return [product];
      if (path.startsWith('/products?') && options?.includeMeta) {
        return {
          data: [product],
          meta: { page: 0, size: 12, totalElements: 1, totalPages: 1 },
        };
      }
      if (path.startsWith('/products?')) return [product];
      throw new Error(`不應呼叫 ${path}`);
    },
  },
  enrichProductForDisplay: value => ({ ...value }),
  computeProductSales: () => 0,
};
const fetch = async () => ({
  ok: true,
  json: async () => ({}),
});

// 驗證首頁正式模式由後端處理最新上架與熱銷排序，不在前端猜測排序依據。
vm.runInNewContext(
  apiSource,
  {
    window,
    fetch,
    console,
    URLSearchParams,
    localStorage: {
      getItem: () => null,
      setItem: () => {},
    },
  },
  { filename: 'api-mock.js' },
);

const newest = await window.API.products.getNewest(12);
const bestsellers = await window.API.products.getBestsellers(6);
await window.API.products.getAll();

assert.equal(newest[0].id, 'P001');
assert.equal(bestsellers[0].id, 'P001');
const newestCall = calls.find(call => call.path.startsWith('/products?page='));
const bestsellerCall = calls.find(call => call.path.startsWith('/products/bestsellers'));
assert.equal(newestCall.path, '/products?page=0&size=12&sort=createdAt%2Cdesc');
assert.equal(newestCall.options.includeMeta, true);
assert.equal(bestsellerCall.path, '/products/bestsellers?limit=6');
assert.equal(bestsellerCall.options.auth, 'none');
assert.equal(calls.some(call => call.path === '/orders'), false);

console.log('Home newest and bestseller facade checks passed');
