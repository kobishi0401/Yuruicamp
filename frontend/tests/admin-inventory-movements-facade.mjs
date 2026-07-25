import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const apiSource = readFileSync(join(rootDir, 'admin/js/admin-api.js'), 'utf8');
const movementSource = readFileSync(join(rootDir, 'admin/js/movement.js'), 'utf8');
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

await window.AdminAPI.movement.list({ page: 1, size: 20, status: 'draft' });
await window.AdminAPI.movement.getById(12);
await window.AdminAPI.movement.getLookups();
await window.AdminAPI.movement.createDraft({ inventoryDomain: 'store' });
await window.AdminAPI.movement.addItem(12, { variantId: 'V001', quantity: 2 });
await window.AdminAPI.movement.post(12);
await window.AdminAPI.movement.cancel(12);
await window.AdminAPI.movement.updateReason(12, { reason: '改原因' });
await window.AdminAPI.movement.updateItemLineReason(12, 99, {
  lineReason: '備註',
  lineNature: 'stocktake'
});

assert.deepEqual(
  calls.map((call) => [call.options.method, call.path]),
  [
    ['GET', '/inventory-movements?page=1&size=20&status=draft'],
    ['GET', '/inventory-movements/12'],
    ['GET', '/inventory-movements/lookups'],
    ['POST', '/inventory-movements'],
    ['POST', '/inventory-movements/12/items'],
    ['POST', '/inventory-movements/12/post'],
    ['POST', '/inventory-movements/12/cancel'],
    ['PATCH', '/inventory-movements/12'],
    ['PATCH', '/inventory-movements/12/items/99'],
  ],
);
assert.equal(calls.every((call) => call.options.auth === 'required'), true);

const movementContext = { window: {}, console };
vm.runInNewContext(movementSource, movementContext, { filename: 'movement.js' });
const normalized = movementContext.normalizeMovementRecord({
  id: 12,
  movementNo: 'MOV-20260722-TEST',
  inventoryDomain: 'store',
  movementType: 'transfer',
  status: 'draft',
  sourceLocationId: 'MAIN',
  sourceLocationName: '主倉',
  destinationLocationId: 'BRANCH',
  destinationLocationName: '台北門市',
  employeeId: 'ADMIN',
  reason: '測試調撥',
  occurredAt: '2026-07-22T04:00:00Z',
  items: [{
    id: 1,
    inventoryDomain: 'store',
    variantId: 'V001',
    sku: 'SKU-001',
    productName: '測試商品',
    quantity: 2,
    sourceLocationId: 'MAIN',
    destinationLocationId: 'BRANCH',
    sourceLocationName: '主倉',
    destinationLocationName: '台北門市'
  }],
});

assert.equal(normalized.status, 'draft');
// 方案 B：無 lineNature 時依 from／to 推導 → 店→店＝移轉（transfer）
assert.equal(normalized.items[0].lineNature, 'transfer');
assert.equal(normalized.items[0].type, '移轉');
assert.equal(normalized.items[0].fromStore, '主倉');
assert.equal(normalized.items[0].toStore, '台北門市');
assert.match(movementSource, /AdminAPI\.movement\.updateReason/);
assert.match(movementSource, /AdminAPI\.movement\.updateItemLineReason/);
assert.match(movementSource, /movement-line-nature-select/);

console.log('Admin Inventory Movements facade and mapping tests passed.');
