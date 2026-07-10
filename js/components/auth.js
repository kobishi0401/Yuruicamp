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

  /**
   * 安全讀取 localStorage JSON。
   * @param {string} key - localStorage key。
   * @param {*} fallback - 解析失敗時回傳值。
   * @returns {*} 解析後資料或 fallback。
   */
  function readJsonStorage(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch (error) {
      console.warn('Auth storage parse failed:', key, error);
      return fallback;
    }
  }

  /**
   * 將 provider 正規化成畫面顯示用名稱。
   * @param {string} provider - 社群登入來源。
   * @returns {string} Provider 顯示文字。
   */
  function getProviderLabel(provider) {
    var value = String(provider || 'Google').toLowerCase();
    if (value === 'line') return 'LINE';
    if (value === 'facebook') return 'Facebook';
    return 'Google';
  }

  /**
   * 建立測試用社群登入會員資料。
   * @param {string} provider - 社群登入來源。
   * @returns {{id: string, name: string, email: string, avatar: string, provider: string}} Mock user.
   */
  function createMockUser(provider) {
    var label = getProviderLabel(provider);
    var key = label.toLowerCase();
    return {
      id: 'user-001',
      name: label + ' 會員',
      email: 'user@' + key + '.example',
      avatar: label.charAt(0),
      provider: key
    };
  }

  /**
   * 若主站 AppState 存在，同步目前登入狀態。
   * @param {Object|null} user - 目前登入會員或 null。
   */
  function syncAppState(user) {
    if (!window.AppState) return;
    // 將登入狀態寫入前端AppState
    window.AppState.isLoggedIn = Boolean(user);
    window.AppState.currentUser = user || null;
    if (typeof window.saveAppState === 'function') window.saveAppState();
  }

  /**
   * 將登入狀態寫入主站與 booking 共用 key，連接syncAppState > saveAppSate() 嚴格判斷登入使用者是否合法
   * @param {Object|null} user - 目前登入會員或 null。
   */
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

  /**
   * 發送登入狀態變更事件，讓兩邊 header 即時重繪。
   * @param {'login'|'logout'|'sync'} type - 事件類型。
   * @param {Object|null} user - 目前登入會員或 null。
   */
  function emitAuthChanged(type, user) {
    window.dispatchEvent(new CustomEvent('yurui:auth-changed', {
      detail: { type: type, user: user || null }
    }));
  }

  // 集中booking-header 和header 的登出清理
  function syncAuthFromStorageEvent(event) {
    if (!['isLoggedIn', 'currentUser'].includes(event.key)) return;

    var storedLoginFlag = localStorage.getItem(STORAGE_KEYS.isLoggedIn);

    if (storedLoginFlag === 'false') {
      if (window.AppState) {
        window.AppState.isLoggedIn = false;
        window.AppState.currentUser = null;
      }

      emitAuthChanged('logout', null);
      return;
    }

    if (storedLoginFlag === 'true') {
      var user = readStoredUser();

      if (user && user.name) {
        if (window.AppState) {
          window.AppState.isLoggedIn = true;
          window.AppState.currentUser = user;
        }

        emitAuthChanged('login', user);
        return;
      }
    }

    emitAuthChanged('sync', getUser());
  }

  /**
   * 從唯一正式 currentUser key 讀取已登入會員。
   * @returns {Object|null} 目前登入會員或 null。
   */
  function readStoredUser() {
    return readJsonStorage(STORAGE_KEYS.currentUser, null);
  }

  /**
   * 取得目前登入會員，currentUser 是唯一正式會員資料來源。
   * @returns {Object|null} 目前登入會員或 null。
   */

  // 會員判斷、跨頁狀態同步、守衛、取得userId、避免登入狀態回復
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

    // 第三優先：沒有 localStorage 明確狀態時，才參考 AppState 的明確登出。
    if (appStateLoggedIn === false) {
      return null;
    }

    // 第四優先：狀態不明時，只允許 currentUser 作為正式資料來源。
    if (currentUser && currentUser.name) {
      return currentUser;
    }

    // 第五優先：AppState 明確登入且有合法 user 時，補回 currentUser。
    if (appStateLoggedIn === true && appStateUser && appStateUser.name) {
      persistUser(appStateUser);
      return appStateUser;
    }

    return null;
  }

  /**
   * 判斷目前是否登入。
   * @returns {boolean} 是否已登入。
   */
  function isLoggedIn() {
    return Boolean(getUser());
  }

  /**
   * 執行共用社群登入流程。
   * @param {string} provider - 社群登入來源。
   * @param {{close?: Function, showToast?: boolean, openSurvey?: boolean}=} options - UI callback 選項；openSurvey 預設 false。
   * @returns {Object} 登入後會員。
   */
  function loginWithProvider(provider, options) {
    options = options || {};
    var label = getProviderLabel(provider);
    var user = createMockUser(label);

    persistUser(user);
    emitAuthChanged('login', user);

    if (typeof options.close === 'function') options.close();
    if (options.showToast !== false && typeof window.showToast === 'function') {
      window.showToast('已使用 ' + label + ' 登入', 'success');
    }
    if (options.openSurvey === true && typeof window.maybeOpenPersonalizationModal === 'function') {
      window.setTimeout(function () {
        window.maybeOpenPersonalizationModal({ source: 'auth-login', openSurvey: true });
      }, 300);
    }

    return user;
  }

  /**
   * 執行共用登出流程，保留 cart 與 bookingCart。
   * @param {{close?: Function, showToast?: boolean}=} options - UI callback 選項。
   */
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
    /**
     * 重新發送目前登入狀態，供較晚載入的 UI 同步。
     */
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
