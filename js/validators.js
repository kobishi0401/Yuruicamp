// ========================================
// Yuruicamp Validators
// ========================================

/**
 * Validates a basic email address format before form submission.
 * @param {string} email - Email input.
 * @returns {boolean} Whether email is valid.
 */
window.isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));

/**
 * Validates Taiwan-style phone numbers after removing visual separators.
 * @param {string} phone - Phone input.
 * @returns {boolean} Whether phone is valid.
 */
window.isValidPhone = (phone) => {
  const normalizedPhone = String(phone || '').replace(/[\s\-()]/g, '');
  return /^(\+886|886|0)[1-9]\d{1,9}$/.test(normalizedPhone);
};

/**
 * 台灣手機：09 開頭 10 碼純數字（例：0988744144）
 * Taiwan mobile: 09 + 8 digits
 */
window.isValidMobile = (phone) => {
  const normalized = String(phone || '').replace(/[\s\-()]/g, '');
  return /^09\d{8}$/.test(normalized);
};

/**
 * 台灣郵遞區號：3 碼或 5 碼數字（例：701 或 70156）
 * TW postal code: 3 or 5 digits
 */
window.isValidPostalCode = (code) => /^\d{3}$|^\d{5}$/.test(String(code || '').trim());

/** 正規化手機為純數字 / Normalize mobile to digits only */
window.normalizeMobile = (phone) => String(phone || '').replace(/[\s\-()]/g, '').trim();

console.log('✓ Validators 已初始化');
