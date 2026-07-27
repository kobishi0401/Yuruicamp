import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const loginHtml = readFileSync(join(rootDir, 'admin/login.html'), 'utf8');
const authSource = readFileSync(join(rootDir, 'admin/js/admin-auth.js'), 'utf8');
const idUtilsSource = readFileSync(join(rootDir, 'admin/js/id-utils.js'), 'utf8');
const reviewsSource = readFileSync(join(rootDir, 'admin/js/reviews.js'), 'utf8');

// Ticket 01: login cleanup（Admin UX follow-up）
assert.match(loginHtml, /賣家管理系統/);
assert.doesNotMatch(loginHtml, /Firebase Google 登入/);
assert.doesNotMatch(loginHtml, /id="mockLoginHint"/);
assert.doesNotMatch(loginHtml, /Firebase 已就緒/);
assert.match(authSource, /hideFirebaseStatus/);
assert.match(authSource, /hideFirebaseStatus\(\)/);

// Ticket 01: login hover dev zone
assert.match(loginHtml, /id="devLoginHoverZone"/);
assert.match(loginHtml, /dev-login-hover-zone/);
assert.match(loginHtml, /id="devTokenLoginBtn"/);
assert.match(loginHtml, /id="googleLoginBtn"/);
assert.doesNotMatch(loginHtml, /id="devLoginPanel" class="d-none"/);
assert.match(authSource, /devLoginHoverZone/);
assert.doesNotMatch(authSource, /\$\('#devLoginPanel'\)\.removeClass\('d-none'\)/);

// Ticket 02: shared admin datetime + reviews usage
const window = {};
vm.runInNewContext(idUtilsSource, { window, global: window });
assert.equal(
  window.formatAdminDateTimeDisplay('2026-07-27T06:30:00Z'),
  '2026-07-27 14:30'
);
assert.match(reviewsSource, /formatAdminDateTimeDisplay/);

console.log('admin-ux-tickets-01-02: ok');
