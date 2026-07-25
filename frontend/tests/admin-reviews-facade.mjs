import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/**
 * ADM-W1-06：驗證 reviews facade 路徑與 readiness。
 * Facade tests for review list／getById／remove + reviews.manage readiness.
 */
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const apiSource = readFileSync(join(rootDir, 'admin/js/admin-api.js'), 'utf8');
const runtimeSource = readFileSync(join(rootDir, 'admin/js/admin-runtime.js'), 'utf8');
const calls = [];
const window = {
  AppConfig: {
    USE_MOCK_API: false,
    API_BASE_URL: 'http://localhost:8080/api',
    ADMIN: { USE_BACKEND: true },
  },
  ApiRequestError: class ApiRequestError extends Error {
    constructor(code, message, details, status) {
      super(message);
      this.code = code;
      this.details = details;
      this.status = status;
    }
  },
  ApiClient: {
    _restRequest: async (path, options) => {
      calls.push({ path, options });
      if (path.startsWith('/reviews/') && options.method === 'GET') {
        return {
          id: 'REV001',
          buyerName: '測試買家',
          productName: '帳篷',
          rating: 5,
          comment: '很好',
          photos: [],
          createdAt: '2026-07-01T00:00:00Z',
        };
      }
      if (path.startsWith('/reviews')) {
        return {
          data: [{ id: 'REV001', rating: 5 }],
          meta: { page: 0, size: 20, totalElements: 1 },
        };
      }
      return {};
    },
  },
  console,
};
const context = { window, console, URLSearchParams };

vm.runInNewContext(apiSource, context, { filename: 'admin-api.js' });
vm.runInNewContext(runtimeSource, context, { filename: 'admin-runtime.js' });
window.AdminAPI.configure({ useBackend: true });

assert.equal(window.AdminRuntime.isSectionReady('reviews'), true);
assert.equal(window.AdminRuntime.isFeatureReady('reviews.manage'), true);
assert.match(window.AdminRuntime.getReadiness('reviews').note, /硬刪|列表/);

const listResult = await window.AdminAPI.reviews.list({
  page: 0,
  size: 20,
  productId: 'P001',
  rating: 5,
  sort: 'createdAt,desc',
});
assert.equal(listResult.data[0].id, 'REV001');
assert.equal(listResult.meta.totalElements, 1);

await window.AdminAPI.reviews.getById('REV001');
await window.AdminAPI.reviews.remove('REV001');

assert.deepEqual(
  calls.map((call) => [call.options.method, call.path]),
  [
    ['GET', '/reviews?page=0&size=20&productId=P001&rating=5&sort=createdAt%2Cdesc'],
    ['GET', '/reviews/REV001'],
    ['DELETE', '/reviews/REV001'],
  ],
);
assert.equal(calls.every((call) => call.options.auth === 'required'), true);

console.log('Admin reviews facade tests passed.');
