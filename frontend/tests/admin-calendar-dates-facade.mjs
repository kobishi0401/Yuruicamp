/**
 * AdminAPI.calendarDates 路徑／方法 smoke test（ADM-W4-03）。
 * Run: node tests/admin-calendar-dates-facade.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const apiSource = readFileSync(join(rootDir, 'admin/js/admin-api.js'), 'utf8');
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

await window.AdminAPI.calendarDates.listRange('2026-01-01', '2026-01-31');
await window.AdminAPI.calendarDates.upsert('2026-10-10', { isHoliday: true, holidayName: '國慶日' });
await window.AdminAPI.calendarDates.upsert('2026-10-10', { isHoliday: false });
await window.AdminAPI.calendarDates.remove('2026-10-10');

assert.deepEqual(
  calls.map((call) => [call.options.method, call.path]),
  [
    ['GET', '/calendar-dates?from=2026-01-01&to=2026-01-31'],
    ['PUT', '/calendar-dates/2026-10-10'],
    ['PUT', '/calendar-dates/2026-10-10'],
    ['DELETE', '/calendar-dates/2026-10-10'],
  ],
);
assert.equal(calls.every((call) => call.options.auth === 'required'), true);
assert.equal(calls.some((call) => call.path.startsWith('/api/')), false);

console.log('admin-calendar-dates-facade: OK');
