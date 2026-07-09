/**
 * 主站與 booking 共用的前端登入狀態模組。
 * Auth 以 currentUser 為唯一會員資料來源；yuruiUser 僅在登出時清除舊殘留。
 */
(function () {
  'use strict';

  var STORAGE_KEYS = {
    isLoggedIn: 'isLoggedIn',
    currentUser: 'currentUser'
  };
  var LEGACY_AUTH_KEYS = ['yuruiUser'];

  function readJsonStorage(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch (error) {
      console.warn('Auth storage parse failed:', key, error);
      return fallback;
    }
  }

  function getProviderLabel(provider) {
    var value = String(provider || 'Google').toLowerCase();
    if (value === 'line') return 'LINE';
    if (value === 'facebook') return 'Facebook';
    return 'Google';
  }

  /** Fallback 測試會員（API 不可用時） */
  function createMockUser(provider) {
    return {
      id: 'U001',
      name: 'Amy Chen',
      email: 'amy@example.com',
      avatar: getProviderLabel(provider).charAt(0),
      provider: String(provider || 'google').toLowerCase()
    };
  }

  function syncAppState(user) {
    if (!window.AppState) return;
    // 將登入狀態寫入前端AppState
    window.AppState.isLoggedIn = Boolean(user);
    window.AppState.currentUser = user || null;
    if (typeof window.saveAppState === 'function') window.saveAppState();
  }

  function persistUser(user) {
    localStorage.setItem(STORAGE_KEYS.isLoggedIn, JSON.stringify(Boolean(user)));
    if (user) {
      localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.currentUser);
      LEGACY_AUTH_KEYS.forEach(function (key) {
        localStorage.removeItem(key);
      });
    }
    syncAppState(user);
  }

  function emitAuthChanged(type, user) {
    window.dispatchEvent(new CustomEvent('yurui:auth-changed', {
      detail: { type: type, user: user || null }
    }));
  }

  function readStoredUser() {
    return readJsonStorage(STORAGE_KEYS.currentUser, null);
  }

  function getUser() {
    // 先讀取登入狀態："true"、"false" 或 null。
    const storedLoginFlag = localStorage.getItem('isLoggedIn');

    // 讀取 AppState 快取狀態。
    const appStateLoggedIn = window.AppState?.isLoggedIn;
    const appStateUser = window.AppState?.currentUser;

    // 讀取唯一正式會員資料來源。
    const currentUser = readStoredUser();

    // 第一優先：localStorage 明確登出時，任何舊 user 都不能復活。
    if (storedLoginFlag === 'false') {
      return null;
    }

    // 第二優先：localStorage 明確登入時，才允許從 storage / AppState 取 user。
    if (storedLoginFlag === 'true') {
      const storedUser = currentUser || appStateUser;
      if (!currentUser && appStateUser && appStateUser.name) persistUser(appStateUser);
      return storedUser && storedUser.name ? storedUser : null;
    }
    var user = readStoredUser();
    if (user && user.name) persistUser(user);
    return user && user.name ? user : null;
  }

  function isLoggedIn() {
    return Boolean(getUser());
  }

  /** 固定登入 Amy U001，從 API.customers 讀取 */
  function loginWithProvider(provider, options) {
    options = options || {};
    var label = getProviderLabel(provider);

    function finishLogin(user) {
      persistUser(user);
      emitAuthChanged('login', user);
      if (typeof options.close === 'function') options.close();
      if (options.showToast !== false && typeof window.showToast === 'function') {
        window.showToast('已使用 ' + label + ' 登入（' + user.name + '）', 'success');
      }
      if (options.openSurvey !== false && typeof window.openPersonalizationModal === 'function') {
        setTimeout(window.openPersonalizationModal, 300);
      }
      return user;
    }

    if (window.API && window.API.customers && window.API.customers.getById) {
      return window.API.customers.getById('U001').then(function (customer) {
        return finishLogin(Object.assign({}, customer, {
          provider: String(provider || 'google').toLowerCase()
        }));
      }).catch(function () {
        return finishLogin(createMockUser(provider));
      });
    }

    return Promise.resolve(finishLogin(createMockUser(provider)));
  }

  function logout(options) {
    options = options || {};
    // 登出清除AppState and storage
    persistUser(null);
    emitAuthChanged('logout', null);
    if (typeof options.close === 'function') options.close();
    if (options.showToast !== false && typeof window.showToast === 'function') {
      window.showToast('已成功登出', 'success');
    }
  }

  window.YuruiAuth = {
    getProviderLabel: getProviderLabel,
    createMockUser: createMockUser,
    getUser: getUser,
    isLoggedIn: isLoggedIn,
    loginWithProvider: loginWithProvider,
    logout: logout,
    sync: function () {
      emitAuthChanged('sync', getUser());
    }
  };

  if (!window.__yuruiAuthStorageBound) {
    window.__yuruiAuthStorageBound = true;
    window.addEventListener('storage', syncAuthFromStorageEvent);
  }

  // Auth 載入完成後補發同步事件，讓較早初始化的主站 header 可改用 YuruiAuth 狀態重畫。
  window.YuruiAuth.sync();
}());
