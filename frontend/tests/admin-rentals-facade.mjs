import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/**
 * ADM-W2-03／04：rentals／equipmentItems facade 與 products.rentalWrite readiness。
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
      if (path.startsWith('/rentals') && options.method === 'GET' && path.includes('/listings')) {
        return [];
      }
      if (path.startsWith('/rentals') && options.includeMeta) {
        return { data: [{ id: 'R001', itemId: 'E001', name: 'Demo' }], meta: { page: 0 } };
      }
      if (path.startsWith('/equipment-items')) {
        return path.endsWith('/tags')
          ? { itemId: 'E001', tags: ['輕量'] }
          : { itemId: 'E001', specs: [{ key: 'weight', value: '1kg' }] };
      }
      return { id: 'R001' };
    },
  },
  console,
};
const context = { window, console, URLSearchParams };

vm.runInNewContext(apiSource, context, { filename: 'admin-api.js' });
vm.runInNewContext(runtimeSource, context, { filename: 'admin-runtime.js' });
window.AdminAPI.configure({ useBackend: true });

assert.equal(window.AdminRuntime.isFeatureReady('products.rentalWrite'), true);

await window.AdminAPI.rentals.list({ page: 0, size: 100 });
await window.AdminAPI.rentals.listListings('R001');
await window.AdminAPI.rentals.replaceListings('R001', {
  listings: [{
    campgroundId: 'C002',
    rentalSkuVariantId: 'RSV-R001-01',
    pricePerDayWeekday: '100.00',
    pricePerDayHoliday: '120.00',
    discount: '0',
    active: true,
  }],
});
await window.AdminAPI.equipmentItems.getSpecs('E001');
await window.AdminAPI.equipmentItems.replaceSpecs('E001', {
  specs: [{ key: 'weight', value: '1kg' }],
});
await window.AdminAPI.equipmentItems.getTags('E001');
await window.AdminAPI.equipmentItems.replaceTags('E001', { tags: ['輕量'] });

assert.deepEqual(
  calls.map((call) => [call.options.method, call.path]),
  [
    ['GET', '/rentals?page=0&size=100'],
    ['GET', '/rentals/R001/listings'],
    ['PUT', '/rentals/R001/listings'],
    ['GET', '/equipment-items/E001/specs'],
    ['PUT', '/equipment-items/E001/specs'],
    ['GET', '/equipment-items/E001/tags'],
    ['PUT', '/equipment-items/E001/tags'],
  ],
);

console.log('Admin rentals / equipment-items facade tests passed.');
