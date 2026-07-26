/**
 * Admin UX ticket 03 smoke：月曆 Backend 可用性 wiring。
 * Run: node tests/admin-ux-ticket-03.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const calendarJs = readFileSync(join(rootDir, 'admin/js/booking-calendar.js'), 'utf8');
const calendarHtml = readFileSync(join(rootDir, 'admin/partials/booking-calendar.html'), 'utf8');
const runtimeJs = readFileSync(join(rootDir, 'admin/js/admin-runtime.js'), 'utf8');
const apiJs = readFileSync(join(rootDir, 'admin/js/admin-api.js'), 'utf8');

assert.match(calendarJs, /isAvailabilityBackendReady/);
assert.match(calendarJs, /loadMonthAvailability/);
assert.match(calendarJs, /paintCalendarGrid/);
assert.match(calendarJs, /getAvailability/);
assert.match(calendarJs, /bc-day-remain/);
assert.match(calendarJs, /bc-day-status/);
assert.match(runtimeJs, /booking-calendar\.availability/);
assert.match(apiJs, /getAvailability:\s*function/);
assert.match(calendarHtml, /id="bcCalendarGrid"/);
assert.match(calendarHtml, /id="bcZoneSelect"/);

console.log('admin-ux-ticket-03: ok');
