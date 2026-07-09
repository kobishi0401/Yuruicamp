/**
 * 驗證器 smoke test
 * Run: node tests/smoke-validators.mjs
 */
import assert from 'node:assert/strict';

assert.equal(window_isValidMobile('0988744144'), true);
assert.equal(window_isValidMobile('0912-345-678'), true);
assert.equal(window_isValidMobile('0812345678'), false);
assert.equal(window_isValidPostalCode('701'), true);
assert.equal(window_isValidPostalCode('70156'), true);
assert.equal(window_isValidPostalCode('7015'), false);
assert.equal(window_isValidPostalCode('12'), false);

function window_isValidMobile(phone) {
  const normalized = String(phone || '').replace(/[\s\-()]/g, '');
  return /^09\d{8}$/.test(normalized);
}

function window_isValidPostalCode(code) {
  return /^\d{3}$|^\d{5}$/.test(String(code || '').trim());
}

console.log('Validator smoke test passed');
