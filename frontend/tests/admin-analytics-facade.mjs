/**
 * AdminAPI.analytics 路徑／方法 smoke test（ADM-W4-06）。
 * Run: node tests/admin-analytics-facade.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const apiSource = readFileSync(join(rootDir, 'admin/js/admin-api.js'), 'utf8');
const runtimeSource = readFileSync(join(rootDir, 'admin/js/admin-runtime.js'), 'utf8');
const calls = [];
const window = {
  AppConfig: { API_BASE_URL: 'http://localhost:8080/api', ADMIN: { USE_BACKEND: true } },
  ApiClient: {
    _restRequest: async (path, options) => {
      calls.push({ path, options });
      return { data: {} };
    },
  },
  console,
};

vm.runInNewContext(apiSource, { window, console, URLSearchParams }, { filename: 'admin-api.js' });
vm.runInNewContext(runtimeSource, { window, console, URLSearchParams }, { filename: 'admin-runtime.js' });
window.AdminAPI.configure({ useBackend: true });

await window.AdminAPI.analytics.shopSummary('2026-01-01', '2026-01-31');
await window.AdminAPI.analytics.bookingSummary('2026-02-01', '2026-02-28');

assert.deepEqual(
  calls.map((call) => [call.options.method, call.path]),
  [
    ['GET', '/analytics/shop-summary?from=2026-01-01&to=2026-01-31'],
    ['GET', '/analytics/booking-summary?from=2026-02-01&to=2026-02-28'],
  ],
);
assert.equal(calls.every((call) => call.options.auth === 'required'), true);
assert.equal(window.AdminRuntime.isFeatureReady('analytics.summary'), true);

console.log('admin-analytics-facade: OK');
