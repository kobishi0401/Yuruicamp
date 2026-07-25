import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/**
 * ADM-W2-05：inventory-conversions facade 與 movement.conversion readiness。
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
      if (options.method === 'POST' && path === '/inventory-conversions') {
        return { id: 42, status: 'draft' };
      }
      return { id: 42, status: 'posted' };
    },
  },
  console,
};
const context = { window, console, URLSearchParams };

vm.runInNewContext(apiSource, context, { filename: 'admin-api.js' });
vm.runInNewContext(runtimeSource, context, { filename: 'admin-runtime.js' });
window.AdminAPI.configure({ useBackend: true });

assert.equal(window.AdminRuntime.isFeatureReady('movement.conversion'), true);

const draftBody = {
  sourceLocationId: 'main',
  destinationLocationId: 'RENTAL-C002',
  sourceVariantId: 'V001',
  destinationRentalVariantId: 'RSV-R001-01',
  quantity: 2,
  reason: '商店調撥至租借',
  occurredAt: null,
  idempotencyKey: 'test-key-1',
};

await window.AdminAPI.inventoryConversions.createDraft(draftBody);
await window.AdminAPI.inventoryConversions.post(42);
await window.AdminAPI.inventoryConversions.cancel(42);

assert.deepEqual(
  calls.map((call) => [call.options.method, call.path]),
  [
    ['POST', '/inventory-conversions'],
    ['POST', '/inventory-conversions/42/post'],
    ['POST', '/inventory-conversions/42/cancel'],
  ],
);
assert.deepEqual(calls[0].options.body, draftBody);

console.log('Admin inventory-conversions facade tests passed.');
