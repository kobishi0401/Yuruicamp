// ========================================
// Coupon utilities — 讀 promotions/coupons + 資格驗證
// ========================================

(function () {
  const CHECKOUT_COUPON_STORAGE_KEY = 'checkoutCouponCode';

  let couponCache = null;

  function _escapeAttr(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function _formatMoney(amount) {
    return Number(amount || 0).toLocaleString('zh-TW');
  }

  /** 讀取 promotions/coupons.json（含活動碼） */
  async function loadCoupons() {
    if (couponCache) return couponCache;
    if (window.API?.coupons?.getAll) {
      couponCache = await window.API.coupons.getAll();
      return couponCache;
    }
    const path = (window.DataPaths && window.DataPaths.coupons) || '/data/promotions/coupons.json';
    const response = await fetch(path);
    couponCache = await response.json();
    return couponCache;
  }

  /** 會員可用券（生日/首購/活動） */
  async function loadAvailableCoupons(customerId) {
    if (window.API?.coupons?.getAvailable && customerId) {
      return window.API.coupons.getAvailable(customerId);
    }
    return loadCoupons();
  }

  function describeCoupon(coupon) {
    const type = coupon.type || 'fixed';
    const discountText = type === 'percent'
      ? `${coupon.discount}% OFF`
      : `折 NT$ ${coupon.discount}`;
    const minOrderText = coupon.minOrder ? ` / 滿 NT$ ${_formatMoney(coupon.minOrder)}` : '';
    return `${coupon.code} - ${discountText}${minOrderText}`;
  }

  function renderCouponOptions(datalistId, coupons) {
    const datalist = document.getElementById(datalistId);
    if (!datalist) return;

    datalist.innerHTML = (coupons || []).map((coupon) => (
      `<option value="${_escapeAttr(coupon.code)}" label="${_escapeAttr(describeCoupon(coupon))}"></option>`
    )).join('');
  }

  function findCouponByCode(coupons, rawCode) {
    const code = String(rawCode || '').trim().toUpperCase();
    return (coupons || []).find((coupon) => String(coupon.code || '').toUpperCase() === code) || null;
  }

  function calculateDiscount(coupon, subtotal) {
    if (!coupon) return 0;
    const type = coupon.type || 'fixed';
    const discount = type === 'percent'
      ? Math.round(Number(subtotal || 0) * Number(coupon.discount || 0) / 100)
      : Number(coupon.discount || 0);
    return Math.min(discount, Number(subtotal || 0));
  }

  // 用途：判斷 coupon 是否已過期；到期日當天 23:59:59 前仍可使用。
  function isCouponExpired(coupon, today = new Date()) {
    if (!coupon || !coupon.expiry) return false;
    const expiryDate = new Date(`${coupon.expiry}T23:59:59`);
    return Number.isFinite(expiryDate.getTime()) && expiryDate < today;
  }

  // 用途：集中驗證 coupon 的會員、使用狀態、到期日與最低消費，避免 checkout 重算時漏掉規則。
  function getCouponInvalidReason(coupon, subtotal, options = {}) {
    if (!coupon) return 'not-found';
    const userId = options.userId || '';
    if (userId && coupon.userId && coupon.userId !== userId) return 'wrong-user';
    if (!userId && coupon.userId) return 'login-required';
    if (coupon.used === true) return 'used';
    if (isCouponExpired(coupon, options.today || new Date())) return 'expired';
    if (Number(subtotal || 0) < Number(coupon.minOrder || 0)) return 'min-order';
    return '';
  }

  // 用途：將 coupon 驗證原因轉成使用者可理解的錯誤訊息。
  function getCouponInvalidMessage(reason) {
    const messages = {
      'not-found': '折扣碼無效，請確認後再試',
      'wrong-user': '此折扣碼不適用於目前會員',
      'login-required': '請先登入後再使用會員折扣碼',
      used: '此折扣碼已使用',
      expired: '此折扣碼已過期',
      'min-order': '尚未達到此折扣碼的最低消費金額',
    };
    return messages[reason] || '折扣碼無法使用';
  }

  function normalizeCouponCodes(codes) {
    const list = Array.isArray(codes) ? codes : [codes];
    return [...new Set(list
      .map((code) => String(code || '').trim().toUpperCase())
      .filter(Boolean))];
  }

  function calculateAppliedCoupons(coupons, codes, subtotal) {
    let remainingSubtotal = Number(subtotal || 0);
    const items = normalizeCouponCodes(codes)
      .map((code) => findCouponByCode(coupons, code))
      .filter(Boolean)
      .map((coupon) => {
        const discount = Math.min(calculateDiscount(coupon, subtotal), remainingSubtotal);
        remainingSubtotal = Math.max(remainingSubtotal - discount, 0);
        return { code: coupon.code, label: describeCoupon(coupon), discount, coupon };
      });

    return { items, totalDiscount: items.reduce((sum, item) => sum + item.discount, 0) };
  }

  /** 驗證折扣碼（含 YURUIHBD / YRUIFIRST 資格） */
  async function validateCoupon(coupons, rawCode, subtotal, customerId) {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) return { valid: false, message: '請輸入折扣碼' };

    const coupon = findCouponByCode(coupons, code);
    if (!coupon) return { valid: false, message: '折扣碼無效，請確認後再試' };

    if (coupon.status && coupon.status !== 'active') {
      return { valid: false, message: '此折扣碼目前無法使用' };
    }

    if (customerId && window.API?.customers?.getById) {
      try {
        const customer = await window.API.customers.getById(customerId);
        const now = new Date();
        if (coupon.category === 'birthday') {
          const bMonth = parseInt(String(customer.birthday).slice(5, 7), 10);
          if (bMonth !== now.getMonth() + 1) {
            return { valid: false, message: '生日折扣碼僅限生日當月使用' };
          }
        }
        if (coupon.category === 'firstPurchase' && customer.firstPurchaseUsed) {
          return { valid: false, message: '首購優惠已使用過' };
        }
      } catch (error) {
        console.warn('Coupon eligibility check failed', error);
      }
    }

    if (coupon.minOrder && Number(subtotal) < Number(coupon.minOrder)) {
      return { valid: false, message: `需滿 NT$ ${_formatMoney(coupon.minOrder)} 才可使用` };
    }
    const invalidReason = getCouponInvalidReason(coupon, subtotal, options);
    if (invalidReason) {
      return { valid: false, message: getCouponInvalidMessage(invalidReason), reason: invalidReason };
    }

    return {
      valid: true,
      code: coupon.code,
      coupon,
      discount: calculateDiscount(coupon, subtotal),
      label: describeCoupon(coupon),
      message: `折扣碼「${coupon.code}」已套用`,
    };
  }

  function saveAppliedCouponCodes(codes) {
    localStorage.setItem(CHECKOUT_COUPON_STORAGE_KEY, JSON.stringify(normalizeCouponCodes(codes)));
  }

  function saveAppliedCouponCode(code) {
    saveAppliedCouponCodes([code]);
  }

  function getAppliedCouponCode() {
    return getAppliedCouponCodes()[0] || '';
  }

  function getAppliedCouponCodes() {
    const raw = localStorage.getItem(CHECKOUT_COUPON_STORAGE_KEY) || '';
    if (!raw) return [];
    try {
      return normalizeCouponCodes(JSON.parse(raw));
    } catch (error) {
      return normalizeCouponCodes(raw);
    }
  }

  function clearAppliedCouponCode() {
    localStorage.removeItem(CHECKOUT_COUPON_STORAGE_KEY);
  }

  function renderAppliedCouponTexts(containerId, appliedItems) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!appliedItems || appliedItems.length === 0) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    container.style.display = 'block';
    container.innerHTML = appliedItems.map((item) => (
      `<div>已套用：${_escapeAttr(item.code)}（折抵 NT$ ${_formatMoney(item.discount)}）</div>`
    )).join('');
  }

  window.YuruiCoupons = {
    loadCoupons,
    loadAvailableCoupons,
    renderCouponOptions,
    findCouponByCode,
    calculateDiscount,
    calculateAppliedCoupons,
    validateCoupon,
    getCouponInvalidReason,
    normalizeCouponCodes,
    saveAppliedCouponCode,
    saveAppliedCouponCodes,
    getAppliedCouponCode,
    getAppliedCouponCodes,
    clearAppliedCouponCode,
    renderAppliedCouponTexts,
  };
})();
