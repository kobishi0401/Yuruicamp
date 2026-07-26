import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const partialHtml = readFileSync(join(rootDir, 'admin/partials/permissions.html'), 'utf8');
const permissionsSource = readFileSync(join(rootDir, 'admin/js/permissions.js'), 'utf8');

assert.match(partialHtml, /<th>姓名<\/th>/);
assert.match(partialHtml, /<th>Email<\/th>/);
assert.doesNotMatch(partialHtml, /員工編號/);
assert.doesNotMatch(partialHtml, /empIdDisplay/);
assert.match(partialHtml, /id="empCreatedAtDisplay"/);

const storage = new Map();
const localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
};

const window = { localStorage };
vm.runInNewContext(
  permissionsSource +
    '\nwindow.formatAdminUserCreatedDate = formatAdminUserCreatedDate;' +
    '\nwindow.formatEmployeeEmailCell = formatEmployeeEmailCell;',
  { window, localStorage, console },
  { filename: 'permissions.js' }
);

assert.equal(window.formatAdminUserCreatedDate('2026-07-27T08:30:00Z'), '2026-07-27');
assert.equal(window.formatAdminUserCreatedDate('2026-06-14'), '2026-06-14');
assert.equal(window.formatAdminUserCreatedDate(null), '—');
assert.equal(window.formatEmployeeEmailCell('boss@demo.test'), 'boss@demo.test');
assert.equal(window.formatEmployeeEmailCell(''), '—');

console.log('admin-permissions-ui: ok');
