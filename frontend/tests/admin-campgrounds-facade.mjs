/**
 * AdminAPI.campgrounds 路徑／方法 smoke test（ADM-W4-01）。
 * Run: node tests/admin-campgrounds-facade.mjs
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

await window.AdminAPI.campgrounds.list();
await window.AdminAPI.campgrounds.getById('C / 2');
await window.AdminAPI.campgrounds.create({ id: 'C010', name: '新營區', region: '東部' });
await window.AdminAPI.campgrounds.update('C010', { active: false });
await window.AdminAPI.campgrounds.remove('C010');

await window.AdminAPI.campgrounds.listZones('C002');
await window.AdminAPI.campgrounds.createZone('C002', {
  id: 'C002-Z-NEW',
  type: '草皮區',
  capacityPerSite: 4,
  priceWeekday: '1000.00',
  priceHoliday: '1500.00',
  totalSites: 2,
});
await window.AdminAPI.campgrounds.updateZone('C002', 'C002-Z-NEW', { totalSites: 3 });
await window.AdminAPI.campgrounds.removeZone('C002', 'C002-Z-NEW');
await window.AdminAPI.campgrounds.getAvailability('C002', { from: '2026-07-01', to: '2026-07-31' });
await window.AdminAPI.campgrounds.getAvailability('C002', {
  from: '2026-07-01',
  to: '2026-07-31',
  zoneId: 'Z001',
});
await window.AdminAPI.campgrounds.getBookingsForNight('C002', { date: '2026-07-29' });
await window.AdminAPI.campgrounds.getBookingsForNight('C002', {
  date: '2026-07-29',
  zoneId: 'Z001',
});

assert.deepEqual(
  calls.map((call) => [call.options.method, call.path]),
  [
    ['GET', '/campgrounds'],
    ['GET', '/campgrounds/C%20%2F%202'],
    ['POST', '/campgrounds'],
    ['PATCH', '/campgrounds/C010'],
    ['DELETE', '/campgrounds/C010'],
    ['GET', '/campgrounds/C002/zones'],
    ['POST', '/campgrounds/C002/zones'],
    ['PATCH', '/campgrounds/C002/zones/C002-Z-NEW'],
    ['DELETE', '/campgrounds/C002/zones/C002-Z-NEW'],
    ['GET', '/campgrounds/C002/availability?from=2026-07-01&to=2026-07-31'],
    ['GET', '/campgrounds/C002/availability?from=2026-07-01&to=2026-07-31&zoneId=Z001'],
    ['GET', '/campgrounds/C002/bookings-for-night?date=2026-07-29'],
    ['GET', '/campgrounds/C002/bookings-for-night?date=2026-07-29&zoneId=Z001'],
  ],
);
assert.equal(calls.every((call) => call.options.auth === 'required'), true);
assert.equal(calls.some((call) => call.path.startsWith('/api/')), false);

console.log('admin-campgrounds-facade: OK');
