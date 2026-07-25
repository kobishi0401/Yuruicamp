// ========================================
// 前端認證與 REST 請求共用層
// FA-2：401／Token 過期 → 刷新重試一次 → 仍失敗則清登入並導回登入
// ========================================

(function (global) {
  'use strict';

  var configuredAuth = null;
  var configuredDevToken = '';
  var authInitializationSettled = false;
  var resolveAuthInitialization = null;
  // 頁面 API 可以早於 Firebase 模組啟動，先共用這個 Promise 等待認證注入完成。
  var authInitializationPromise = new Promise(function (resolve) {
    resolveAuthInitialization = resolve;
  });
  /** 避免並行 401 連續清狀態／開多次登入框 */
  var lastSessionExpiredAt = 0;
  var SESSION_EXPIRED_DEBOUNCE_MS = 2500;

  /**
   * 保存後端錯誤碼、欄位細節與 HTTP 狀態，讓頁面只處理一致的錯誤物件。
   */
  function ApiRequestError(code, message, details, status, cause) {
    this.name = 'ApiRequestError';
    this.code = code || 'API_REQUEST_FAILED';
    this.message = message || 'API request failed';
    this.details = Array.isArray(details) ? details : [];
    this.status = Number.isInteger(status) ? status : 0;
    this.cause = cause || null;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiRequestError);
    }
  }

  ApiRequestError.prototype = Object.create(Error.prototype);
  ApiRequestError.prototype.constructor = ApiRequestError;

  /**
   * 取得已注入的 Firebase Auth；相容 compat SDK 與應用自行保存的 auth instance。
   */
  function resolveFirebaseAuth() {
    if (configuredAuth) {
      return configuredAuth;
    }

    if (global.FirebaseAuth && global.FirebaseAuth.currentUser) {
      return global.FirebaseAuth;
    }

    if (global.firebase && typeof global.firebase.auth === 'function') {
      return global.firebase.auth();
    }

    return null;
  }

  /**
   * 本機 dev Token 只允許 development，並且必須使用後端支援的 dev: 格式。
   */
  function resolveDevToken() {
    var configToken = global.AppConfig
      && global.AppConfig.AUTH
      && global.AppConfig.AUTH.DEV_TOKEN;
    var token = String(configuredDevToken || configToken || '').trim();

    if (!token) {
      return '';
    }

    if (global.AppConfig && global.AppConfig.ENVIRONMENT !== 'development') {
      throw new ApiRequestError(
        'DEV_AUTH_NOT_ALLOWED',
        '開發 Token 只能在 development 環境使用。'
      );
    }

    if (token.indexOf('dev:') !== 0) {
      throw new ApiRequestError(
        'DEV_AUTH_TOKEN_INVALID',
        '開發 Token 必須使用後端支援的 dev: 格式。'
      );
    }

    return token;
  }

  /**
   * 等待 Firebase 完成首次登入狀態還原，避免新分頁把暫時的 currentUser=null 當成登出。
   */
  async function waitForFirebaseAuthState(auth) {
    if (!auth) return;

    if (typeof auth.authStateReady === 'function') {
      await auth.authStateReady();

      return;
    }

    if (
      global.YuruiFirebase
      && typeof global.YuruiFirebase.waitForAuthState === 'function'
    ) {
      await global.YuruiFirebase.waitForAuthState();
    }
  }

  /**
   * 標記 Firebase 或 development Token 已完成初始化，讓提早發出的 API 繼續執行。
   */
  function markAuthInitializationReady() {
    if (authInitializationSettled) return;

    authInitializationSettled = true;
    resolveAuthInitialization();
  }

  var AppAuth = {
    /**
     * 應用啟動時可注入 Firebase Auth；本機也可暫時注入 dev Token。
     */
    configure: function (options) {
      var next = options || {};

      if (Object.prototype.hasOwnProperty.call(next, 'auth')) {
        configuredAuth = next.auth || null;
        markAuthInitializationReady();
      }

      if (Object.prototype.hasOwnProperty.call(next, 'devToken')) {
        configuredDevToken = String(next.devToken || '').trim();
        if (configuredDevToken) markAuthInitializationReady();
      }
    },

    /**
     * 等待 Firebase Auth 或 development Token 完成注入。
     */
    whenReady: function () {
      return authInitializationPromise;
    },

    /**
     * 正式模式優先向 Firebase currentUser 取得最新 ID Token。
     */
    getIdToken: async function (options) {
      var settings = options || {};
      var required = settings.required !== false;
      var auth = resolveFirebaseAuth();

      // 頁面程式可能比 main.js／Booking layout 更早呼叫 API，先等待認證初始化。
      if (!auth) {
        // 本機設定已有合法 dev Token 時可直接使用，不必等待不存在的 Firebase。
        var earlyDevToken = resolveDevToken();
        if (earlyDevToken) return earlyDevToken;

        await authInitializationPromise;
        auth = resolveFirebaseAuth();
      }

      // Firebase 會從 IndexedDB 還原跨分頁登入，完成前不能判定 Token 不存在。
      await waitForFirebaseAuthState(auth);

      var user = auth && auth.currentUser;

      if (user && typeof user.getIdToken === 'function') {
        return user.getIdToken(settings.forceRefresh === true);
      }

      var devToken = resolveDevToken();
      if (devToken) {
        return devToken;
      }

      if (required) {
        throw new ApiRequestError(
          'AUTH_TOKEN_UNAVAILABLE',
          '目前沒有可用的 Firebase 登入或開發認證設定。',
          [],
          401
        );
      }

      return null;
    },
  };

  /**
   * 將 API_BASE_URL 與資源路徑安全合併，避免多一個或少一個斜線。
   */
  function buildRestUrl(path, baseUrl) {
    var base = String(baseUrl || (global.AppConfig && global.AppConfig.API_BASE_URL) || '')
      .replace(/\/+$/, '');
    var resource = String(path || '');

    if (/^https?:\/\//i.test(resource)) {
      return resource;
    }

    if (!base) {
      throw new ApiRequestError('API_BASE_URL_MISSING', '尚未設定 API_BASE_URL。');
    }

    return base + '/' + resource.replace(/^\/+/, '');
  }

  /**
   * 將後端 Envelope 的 error 轉為統一前端錯誤。
   */
  function toApiError(response, json, fallbackCode, fallbackMessage, cause) {
    var error = json && json.error ? json.error : {};

    return new ApiRequestError(
      error.code || fallbackCode,
      error.message || fallbackMessage,
      error.details,
      response ? response.status : 0,
      cause
    );
  }

  /** HTTP 401 或常見未授權錯誤碼 */
  function isAuthFailure(error) {
    if (!error) return false;
    if (Number(error.status) === 401) return true;
    var code = String(error.code || '').toUpperCase();
    return (
      code === 'UNAUTHORIZED'
      || code === 'AUTH_TOKEN_UNAVAILABLE'
      || code === 'INVALID_TOKEN'
      || code === 'INVALID_FIREBASE_ID_TOKEN'
    );
  }

  /** 目前是否在賣家後台路徑 */
  function isAdminPath() {
    try {
      return String(global.location && global.location.pathname || '').indexOf('/admin/') !== -1;
    } catch (error) {
      return false;
    }
  }

  /**
   * FA-2：登入失效時清狀態並導回登入（有 debounce，避免並行請求洗版）。
   * @param {object} [options]
   * @param {boolean} [options.silent] - 不顯示 toast（仍清狀態／開登入）
   */
  function notifySessionExpired(options) {
    options = options || {};
    var now = Date.now();
    if (now - lastSessionExpiredAt < SESSION_EXPIRED_DEBOUNCE_MS) {
      return;
    }
    lastSessionExpiredAt = now;

    console.warn('[ApiClient] 登入已失效（401），清本機狀態並請重新登入');

    if (isAdminPath()) {
      var goAdminLogin = function () {
        try {
          global.location.href = '/admin/login.html';
        } catch (error) {
          // ignore
        }
      };

      if (global.AdminAuth && typeof global.AdminAuth.logout === 'function') {
        Promise.resolve(global.AdminAuth.logout()).finally(goAdminLogin);
      } else {
        try {
          sessionStorage.removeItem('adminLoggedIn');
          sessionStorage.removeItem('adminId');
          sessionStorage.removeItem('adminName');
          sessionStorage.removeItem('isSuperAdmin');
          sessionStorage.removeItem('adminPermissions');
          sessionStorage.removeItem('adminAuthSource');
        } catch (error) {
          // ignore
        }
        goAdminLogin();
      }
      return;
    }

    // 商城／預約：清會員狀態（含 Firebase signOut）
    var clearPromise = Promise.resolve();
    if (global.YuruiAuth && typeof global.YuruiAuth.logout === 'function') {
      clearPromise = Promise.resolve(
        global.YuruiAuth.logout({ showToast: false })
      ).catch(function (error) {
        console.warn('[ApiClient] YuruiAuth.logout 失敗（繼續開登入）:', error);
      });
    } else {
      try {
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('yuruiUser');
        localStorage.removeItem('yuruiFirebaseIdToken');
      } catch (error) {
        // ignore
      }
      if (global.AppState) {
        global.AppState.isLoggedIn = false;
        global.AppState.currentUser = null;
      }
      try {
        global.dispatchEvent(new CustomEvent('yurui:auth-changed', {
          detail: { type: 'logout', user: null, reason: 'session-expired' }
        }));
      } catch (error) {
        // ignore
      }
    }

    clearPromise.finally(function () {
      if (!options.silent && typeof global.showToast === 'function') {
        global.showToast('登入已過期，請重新登入', 'warning');
      }
      if (typeof global.openModal === 'function') {
        global.openModal('loginModal');
      }
    });
  }

  /**
   * 是否應在此錯誤上做 FA-2（登入 session／公開端點的 401 不要踢人）。
   */
  function shouldHandleSessionExpired(authMode, error) {
    if (authMode === 'none') return false;
    return isAuthFailure(error);
  }

  /**
   * 尚有 Firebase currentUser 時，強制刷新 ID Token 後重試一次。
   */
  function canRetryWithFreshToken(settings) {
    if (settings.__authRetried) return false;
    if (settings.auth === 'none') return false;
    var auth = resolveFirebaseAuth();
    return Boolean(auth && auth.currentUser && typeof auth.currentUser.getIdToken === 'function');
  }

  /**
   * 所有真後端請求的唯一入口；頁面與各 facade 不直接處理 fetch、Token 或 Envelope。
   */
  async function _restRequest(path, options) {
    var settings = options || {};
    var authMode = settings.auth || 'optional';
    var headers = new Headers(settings.headers || {});
    var body = settings.body;
    var isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    var requestOptions = {
      method: settings.method || 'GET',
      headers: headers,
      cache: settings.cache || 'no-store',
    };

    headers.set('Accept', 'application/json');
    if (!isFormData && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    try {
      if (authMode !== 'none') {
        var token = await AppAuth.getIdToken({
          required: authMode === 'required',
          forceRefresh: settings.forceRefresh === true,
        });

        if (token) {
          headers.set('Authorization', 'Bearer ' + token);
        }
      }
    } catch (tokenError) {
      // auth:required 但完全沒有 token → 請重新登入
      if (shouldHandleSessionExpired(authMode, tokenError)) {
        notifySessionExpired();
      }
      throw tokenError;
    }

    if (body !== undefined && body !== null) {
      requestOptions.body =
        typeof body === 'string' || isFormData ? body : JSON.stringify(body);
    }

    ['credentials', 'signal', 'redirect', 'referrerPolicy'].forEach(function (key) {
      if (settings[key] !== undefined) {
        requestOptions[key] = settings[key];
      }
    });

    var response;
    try {
      response = await fetch(buildRestUrl(path, settings.baseUrl), requestOptions);
    } catch (cause) {
      if (cause && cause.name === 'AbortError') {
        throw cause;
      }

      throw new ApiRequestError(
        'API_NETWORK_ERROR',
        '無法連線到後端服務。',
        [],
        0,
        cause
      );
    }

    // Firebase SDK 會刷新過期 Token；若伺服器仍回 401，只重試一次並要求重新登入。
    if (response.status === 401 && authMode === 'required' && settings.authRetry !== false) {
      try {
        var refreshedToken = await AppAuth.getIdToken({ required: true, forceRefresh: true });
        headers.set('Authorization', 'Bearer ' + refreshedToken);
        response = await fetch(buildRestUrl(path, settings.baseUrl), requestOptions);
      } catch (refreshError) {
        notifySessionExpired();
        throw refreshError;
      }
      if (response.status === 401) {
        notifySessionExpired();
      }
    }

    if (response.status === 204) {
      if (!response.ok) {
        throw toApiError(response, null, 'API_REQUEST_FAILED', 'API request failed');
      }

      return settings.includeMeta ? { data: null, meta: null } : null;
    }

    var json;
    try {
      json = await response.json();
    } catch (cause) {
      var invalidError = new ApiRequestError(
        'API_RESPONSE_INVALID',
        '後端回應不是有效的 JSON。',
        [],
        response.status,
        cause
      );
      if (shouldHandleSessionExpired(authMode, invalidError) && response.status === 401) {
        if (canRetryWithFreshToken(settings)) {
          return _restRequest(path, Object.assign({}, settings, {
            __authRetried: true,
            forceRefresh: true,
          }));
        }
        notifySessionExpired();
      }
      throw invalidError;
    }

    if (!response.ok || !json || json.success !== true) {
      var apiError = toApiError(
        response,
        json,
        'API_REQUEST_FAILED',
        'API request failed'
      );

      if (shouldHandleSessionExpired(authMode, apiError)) {
        // FA-2：先強制刷新 Firebase ID Token 再打一次；仍 401 才踢回登入
        if (canRetryWithFreshToken(settings)) {
          try {
            return await _restRequest(path, Object.assign({}, settings, {
              __authRetried: true,
              forceRefresh: true,
            }));
          } catch (retryError) {
            if (shouldHandleSessionExpired(authMode, retryError)) {
              notifySessionExpired();
            }
            throw retryError;
          }
        }
        notifySessionExpired();
      }

      throw apiError;
    }

    if (settings.includeMeta) {
      return {
        data: json.data,
        meta: json.meta || null,
      };
    }

    return json.data;
  }

  global.ApiRequestError = ApiRequestError;
  global.AppAuth = AppAuth;
  global.ApiClient = {
    _restRequest: _restRequest,
    /** FA-2：供測試或特殊頁面手動觸發「登入失效」處理 */
    notifySessionExpired: notifySessionExpired,
    isAuthFailure: isAuthFailure,
  };
})(typeof window !== 'undefined' ? window : this);

console.log('✓ AppAuth 與 ApiClient 已初始化');
