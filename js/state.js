// ========================================
// Yuruicamp Application State
// ========================================

const APP_RESET_STORAGE_KEYS = [
  'isLoggedIn',
  'currentUser',
  // 舊登入 key 只在 reset/logout 清除殘留，不再作為登入資料來源。
  'yuruiUser',
  'cart',
  'preferences',
  'theme',
  'memberProfile',
  'bookingCart',
  'mockOrders',
  'mockUserPointDeltas',
];

/**
 * Resolves the login flag while keeping legacy stored users compatible.
 * @param {string|null} storedFlag - Raw localStorage isLoggedIn value.
 * @param {Object|null} storedUser - Stored auth user.
 * @returns {boolean} Current login state.
 */
function _resolveStoredLoginState(storedFlag, storedUser) {
  if (storedFlag === 'true') return true;
  if (storedFlag === 'false') return false;
  return Boolean(storedUser);
}

const _storedAuthUser = window.YuruiStorage.readAuthUser();

/**
 * Stores mutable runtime state shared by main-site components.
 */
window.AppState = {
  isLoggedIn: _resolveStoredLoginState(localStorage.getItem('isLoggedIn'), _storedAuthUser),
  currentUser: _storedAuthUser,
  cart: window.YuruiStorage.readJson('cart', []),
  theme: localStorage.getItem('theme') || 'light',
};

// 驗證user 合法性
function isValidUser(user) {
  return Boolean(user && typeof user === 'object' && typeof user.name === 'string' && user.name.trim());
}

/**
 * 只有登入狀態、使用者資料被認證後才可以寫入localStorage
 */
window.saveAppState = () => {
  // 登出鎖：localStorage 已明確登出時，任何舊分頁的 AppState 都不能再把會員寫回。
  if (localStorage.getItem('isLoggedIn') === 'false') {
    window.AppState.isLoggedIn = false;
    window.AppState.currentUser = null;
    localStorage.removeItem('currentUser');
    // 清除舊登入 key 殘留，避免歷史資料干擾 currentUser 單一來源。
    localStorage.removeItem('yuruiUser');
    window.YuruiStorage.writeJson('cart', window.AppState.cart || []);
    localStorage.setItem('theme', window.AppState.theme || 'light');
    return;
  }

  // 抓取目前使用者和登入狀態，必須同時滿足明確登入與合法使用者才會判斷成功
  const currentUser = window.AppState.currentUser;
  const shouldPersistUser = window.AppState.isLoggedIn === true && isValidUser(currentUser);
  // 有寫這段後面使用writeJson 就不用加前綴了 (window.YuruiStorage.writeJson)
  const { writeJson } = window.YuruiStorage;

  // 更新登入狀態booking and buyer 網頁的使用者資料
  if (shouldPersistUser) {
    writeJson('isLoggedIn', true);
    writeJson('currentUser', currentUser);
  } else {
    writeJson('isLoggedIn', false);
    localStorage.removeItem('currentUser');
    // 清除舊登入 key 殘留，避免歷史資料干擾 currentUser 單一來源。
    localStorage.removeItem('yuruiUser');
  }
  // 寫入購物車；會員偏好正式來源為 yurui_profile.preferences，不再由 AppState 保存。
  writeJson('cart', window.AppState.cart || []);
  localStorage.setItem('theme', window.AppState.theme || 'light');
};

/**
 * 將登出規則引導至auth.js (YuruiAuth.logout) 統一登出規則
 * (options = {}) 可帶參數也可不帶參數
 */
window.logout = (options = {}) => {
  if (typeof window.YuruiAuth?.logout !== 'function') {
    console.warn('YuruiAuth.logout is not available. Logout was not executed.');
    return false;
  }

  window.YuruiAuth.logout(options);
  return true;
};

/**
 * Resets only known Yuruicamp state keys instead of clearing the whole origin.
 * @deprecated Prefer logout() for normal sign-out behavior.
 */
window.resetAppState = () => {
  window.AppState = {
    isLoggedIn: false,
    currentUser: null,
    cart: [],
    theme: 'light',
  };
  window.YuruiStorage.removeKeys(APP_RESET_STORAGE_KEYS);
};

console.log('✓ AppState 已初始化');
