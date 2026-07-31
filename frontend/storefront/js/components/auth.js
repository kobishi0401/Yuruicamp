/**
 * 主站與 booking 共用的前端登入狀態模組。
 * Shared auth — all providers via Firebase (no mock U001).
 *
 * Google／Facebook／LINE → Firebase popup
 *   → POST /auth/firebase/session（ApiClient, auth:none）
 *   → GET /me 驗收（ApiClient, auth:required；Bearer 由 AppAuth）
 *
 * 正式 HTTP 只走 AppAuth + ApiClient（合併後 B 方案）；不再依賴 YuruiApiHttp。
 */
(function () {
  'use strict';

  var STORAGE_KEYS = {
    isLoggedIn: 'isLoggedIn',
    currentUser: 'currentUser',
    bookingUser: 'yuruiUser',
    idToken: 'yuruiFirebaseIdToken',
  };

  function readJsonStorage(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch (error) {
      console.warn('Auth storage parse failed:', key, error);
      return fallback;
    }
  }

  /**
   * @param {string} provider
   * @returns {'google'|'facebook'|'line'}
   */
  function normalizeProvider(provider) {
    var value = String(provider || 'google').toLowerCase();
    if (value === 'line') return 'line';
    if (value === 'facebook') return 'facebook';
    return 'google';
  }

  function getProviderLabel(provider) {
    var value = normalizeProvider(provider);
    if (value === 'line') return 'LINE';
    if (value === 'facebook') return 'Facebook';
    return 'Google';
  }

  function syncAppState(user) {
    if (!window.AppState) return;
    window.AppState.isLoggedIn = Boolean(user);
    window.AppState.currentUser = user || null;
    if (typeof window.saveAppState === 'function') window.saveAppState();
  }

  function persistIdToken(idToken) {
    // 保留本機複本方便除錯；正式 REST 以 AppAuth → Firebase currentUser 為準
    // Keep a local copy for debugging; live REST uses AppAuth → Firebase currentUser
    if (idToken) {
      localStorage.setItem(STORAGE_KEYS.idToken, idToken);
    } else {
      localStorage.removeItem(STORAGE_KEYS.idToken);
    }
  }

  function getIdToken() {
    return localStorage.getItem(STORAGE_KEYS.idToken) || null;
  }

  function persistUser(user) {
    localStorage.setItem(STORAGE_KEYS.isLoggedIn, JSON.stringify(Boolean(user)));
    if (user) {
      localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify(user));
      localStorage.setItem(STORAGE_KEYS.bookingUser, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.currentUser);
      localStorage.removeItem(STORAGE_KEYS.bookingUser);
    }
    syncAppState(user);
  }

  function emitAuthChanged(type, user) {
    window.dispatchEvent(
      new CustomEvent('yurui:auth-changed', {
        detail: { type: type, user: user || null },
      })
    );
  }

  function readStoredUser() {
    return readJsonStorage(STORAGE_KEYS.currentUser, null) || readJsonStorage(STORAGE_KEYS.bookingUser, null);
  }

  function getUser() {
    if (window.AppState && window.AppState.isLoggedIn && window.AppState.currentUser) {
      return window.AppState.currentUser;
    }
    var user = readStoredUser();
    if (user && user.name) persistUser(user);
    return user && user.name ? user : null;
  }

  function isLoggedIn() {
    return Boolean(getUser());
  }

  function initializeNewMemberPreferences(user) {
    user.preferences = null;
    if (window.AppState) window.AppState.preferences = null;
    localStorage.setItem('preferences', 'null');
    var profile = readJsonStorage('yurui_profile', {});
    profile.preferences = null;
    localStorage.setItem('yurui_profile', JSON.stringify(profile));
  }

  function finishLogin(user, options, label) {
    options = options || {};
    if (user.isNewCustomer) initializeNewMemberPreferences(user);
    persistUser(user);
    emitAuthChanged('login', user);
    if (typeof options.close === 'function') options.close();
    if (options.showToast !== false && typeof window.showToast === 'function') {
      window.showToast('已使用 ' + label + ' 登入（' + user.name + '）', 'success');
    }
    if (
      user.isNewCustomer &&
      options.openSurvey !== false &&
      typeof window.openPersonalizationModal === 'function'
    ) {
      setTimeout(window.openPersonalizationModal, 300);
    }
    return user;
  }

  /**
   * @param {object} data
   * @returns {object}
   */
  function mapSessionToUser(data) {
    var name = data.name || data.email || '會員';
    return {
      id: data.customerId,
      name: name,
      email: data.email || '',
      provider: normalizeProvider(data.authProvider || 'google'),
      firebaseUid: data.firebaseUid || null,
      status: data.status || null,
      registeredAt: data.registeredAt || null,
      isNewCustomer: data.created === true,
      // Server-side flag from customers.line_user_id (safe boolean; not the raw U…)
      lineBound: data.lineBound === true,
      preferences: data.created === true ? null : undefined,
      avatarUrl: String(name).charAt(0),
    };
  }

  /**
   * Post Firebase ID Token to session upsert (persist LINE User ID after login / Account Linking).
   * Returns mapped user; caller decides toast / survey (finishLogin) vs quiet persist.
   * @param {string} idToken
   */
  function establishSessionWithIdToken(idToken) {
    requireApiClient();
    ensureAppAuthWired();
    return window.ApiClient._restRequest('/auth/firebase/session', {
      method: 'POST',
      auth: 'none',
      body: { idToken: idToken },
    }).then(function (data) {
      persistIdToken(idToken);
      return mapSessionToUser(data);
    });
  }

  /** Ensure AppAuth + ApiClient exist before session /me. */
  function requireApiClient() {
    if (!window.ApiClient || typeof window.ApiClient._restRequest !== 'function') {
      throw new Error('ApiClient 尚未載入。請確認頁面已引入 /storefront/js/api-client.js');
    }
  }

  /** Ensure Firebase Auth is wired into AppAuth so Bearer works. */
  function ensureAppAuthWired() {
    if (!window.AppAuth || typeof window.AppAuth.configure !== 'function') {
      return;
    }
    if (!window.YuruiFirebase || typeof window.YuruiFirebase.isReady !== 'function') {
      return;
    }
    if (!window.YuruiFirebase.isReady()) {
      return;
    }
    try {
      window.AppAuth.configure({ auth: window.YuruiFirebase.getAuth() });
    } catch (error) {
      console.warn('[YuruiAuth] AppAuth.configure 略過:', error);
    }
  }

  function sessionErrorMessage(error) {
    if (error && error.code === 'LINE_USER_ID_CONFLICT') {
      return '此 LINE 帳號已綁定其他會員，無法重複綁定。請改用原本的帳號登入，或聯絡客服協助處理。';
    }
    if (error && error.message) return error.message;
    return '登入失敗';
  }

  /**
   * 登入後用正式水管驗 Bearer：GET /api/me
   * Post-login probe via ApiClient (AppAuth Bearer).
   */
  function verifySessionWithMe() {
    if (!window.ApiClient || typeof window.ApiClient._restRequest !== 'function') {
      console.warn('[YuruiAuth] ApiClient 尚未載入，跳過 /api/me 驗收');
      return Promise.resolve(null);
    }
    ensureAppAuthWired();
    return window.ApiClient._restRequest('/me', { auth: 'required' })
      .then(function (me) {
        console.log('✓ GET /api/me OK (ApiClient)', me);
        return me;
      })
      .catch(function (error) {
        console.warn('✗ GET /api/me 失敗（登入 UI 仍可用）:', error && error.message ? error.message : error);
        return null;
      });
  }

  /**
   * 任一 OAuth provider：Firebase → session → /api/me
   * @param {string} provider
   * @param {object} [options]
   */
  function loginWithFirebaseProvider(provider, options) {
    options = options || {};
    var normalized = normalizeProvider(provider);
    var label = getProviderLabel(normalized);

    if (
      !window.YuruiFirebase ||
      typeof window.YuruiFirebase.isReady !== 'function' ||
      !window.YuruiFirebase.isReady()
    ) {
      return Promise.reject(new Error('Firebase 尚未就緒。請確認 frontend/.env.local 並重啟 npm run dev。'));
    }
    if (typeof window.YuruiFirebase.signInWithProvider !== 'function') {
      return Promise.reject(new Error('YuruiFirebase.signInWithProvider 不可用，請硬刷頁面'));
    }

    try {
      requireApiClient();
    } catch (error) {
      return Promise.reject(error);
    }

    return window.YuruiFirebase.signInWithProvider(normalized)
      .then(function (firebaseResult) {
        return establishSessionWithIdToken(firebaseResult.idToken);
      })
      .then(function (user) {
        return finishLogin(user, options, label);
      })
      .then(function (user) {
        return verifySessionWithMe().then(function () {
          return user;
        });
      })
      .catch(function (error) {
        if (error && error.name === 'TypeError') {
          throw new Error('無法連線伺服器，請確認後端已啟動（localhost:8080）');
        }
        if (error && error.code === 'API_NETWORK_ERROR') {
          throw new Error('無法連線伺服器，請確認後端已啟動（localhost:8080）');
        }
        // Preserve ApiRequestError.code (e.g. LINE_USER_ID_CONFLICT) for CS UX
        if (error && error.code === 'LINE_USER_ID_CONFLICT') {
          var conflict = new Error(sessionErrorMessage(error));
          conflict.code = 'LINE_USER_ID_CONFLICT';
          throw conflict;
        }
        throw new Error(sessionErrorMessage(error));
      });
  }

  /**
   * Link LINE onto the current Firebase user, then refresh session so line_user_id persists.
   * Does not create a second Customer when firebase_uid stays the same.
   */
  function linkLineAndRefreshSession(options) {
    options = options || {};
    if (
      !window.YuruiFirebase ||
      typeof window.YuruiFirebase.linkWithProvider !== 'function'
    ) {
      return Promise.reject(new Error('Firebase LINE 綁定尚未就緒'));
    }
    try {
      requireApiClient();
    } catch (error) {
      return Promise.reject(error);
    }
    return window.YuruiFirebase.linkWithProvider('line')
      .then(function (firebaseResult) {
        return establishSessionWithIdToken(firebaseResult.idToken);
      })
      .then(function (user) {
        persistUser(user);
        emitAuthChanged('login', user);
        if (options.showToast !== false && typeof window.showToast === 'function') {
          window.showToast('已綁定 LINE，可開始聯繫客服', 'success');
        }
        return user;
      })
      .catch(function (error) {
        if (error && error.code === 'LINE_USER_ID_CONFLICT') {
          var conflict = new Error(sessionErrorMessage(error));
          conflict.code = 'LINE_USER_ID_CONFLICT';
          throw conflict;
        }
        if (error && error.code === 'auth/credential-already-in-use') {
          var inUse = new Error('此 LINE 已綁定其他 Firebase 帳號，無法再連結到目前會員');
          inUse.code = 'LINE_CREDENTIAL_IN_USE';
          throw inUse;
        }
        throw error instanceof Error ? error : new Error(sessionErrorMessage(error));
      });
  }

  /** 對外入口：三顆按鈕都走真 Firebase */
  function loginWithProvider(provider, options) {
    return loginWithFirebaseProvider(provider, options);
  }

  function logout(options) {
    options = options || {};

    var signOutPromise = Promise.resolve();
    if (window.YuruiFirebase && typeof window.YuruiFirebase.signOut === 'function') {
      signOutPromise = window.YuruiFirebase.signOut();
    }

    return signOutPromise
      .catch(function (error) {
        console.warn('Firebase signOut 失敗（繼續清本機狀態）:', error);
      })
      .then(function () {
        persistIdToken(null);
        persistUser(null);
        emitAuthChanged('logout', null);
        if (typeof options.close === 'function') options.close();
        if (options.showToast !== false && typeof window.showToast === 'function') {
          window.showToast('已成功登出', 'success');
        }
      });
  }

  window.YuruiAuth = {
    getProviderLabel: getProviderLabel,
    normalizeProvider: normalizeProvider,
    getUser: getUser,
    isLoggedIn: isLoggedIn,
    getIdToken: getIdToken,
    /** Prefer AppAuth (Firebase currentUser); fallback to stored token. */
    getValidIdToken: function (forceRefresh) {
      if (window.AppAuth && typeof window.AppAuth.getIdToken === 'function') {
        return window.AppAuth.getIdToken({
          required: false,
          forceRefresh: Boolean(forceRefresh),
        }).catch(function () {
          return getIdToken();
        });
      }
      return Promise.resolve(getIdToken());
    },
    /**
     * 薄轉接：新程式請直接用 ApiClient._restRequest。
     * Thin adapter — prefer ApiClient for new code.
     */
    fetchMe: function () {
      requireApiClient();
      ensureAppAuthWired();
      return window.ApiClient._restRequest('/me', { auth: 'required' });
    },
    verifySessionWithMe: verifySessionWithMe,
    loginWithProvider: loginWithProvider,
    establishSessionWithIdToken: establishSessionWithIdToken,
    linkLineAndRefreshSession: linkLineAndRefreshSession,
    /** Persist mapped session user without login toast (CS bind refresh). */
    persistSessionUser: function (user) {
      if (!user) return;
      persistUser(user);
      emitAuthChanged('sync', user);
    },
    logout: logout,
    sync: function () {
      emitAuthChanged('sync', getUser());
    },
  };
})();
