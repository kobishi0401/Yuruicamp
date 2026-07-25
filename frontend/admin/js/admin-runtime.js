/**
 * Admin 正式執行環境：統一 Backend 開關、Firebase Session、有效權限與功能就緒清單。
 */
(function (global) {
  'use strict';

  var SESSION_KEYS = [
    'adminLoggedIn',
    'adminId',
    'adminName',
    'adminRole',
    'adminEmail',
    'isSuperAdmin',
    'adminPermissions',
    'adminDevToken',
  ];

  /** 每個模組是否可以在 Backend 模式安全使用；未就緒功能不得發出不存在的 API。 */
  var READINESS = {
    analytics: { ready: true, level: 'read', note: '伺服器端彙總 API（shop／booking summary）' },
    orders: { ready: true, level: 'full', note: '查詢、履約、內部備註、未出貨取消／退款可用' },
    movement: { ready: true, level: 'full', note: '正式庫存異動完整可用' },
    products: {
      ready: true,
      level: 'partial',
      note: '商城商品、最低庫存、分類／品牌、租借 SKU／listing 可用；on-hand 仍走庫存異動'
    },
    customers: { ready: true, level: 'partial', note: '查詢、基本更新、停權、標籤池／指派與預設地址可用；新增會員尚未提供端點' },
    discounts: { ready: true, level: 'full', note: '優惠券正式 CRUD 可用' },
    reviews: { ready: true, level: 'partial', note: '列表／詳情／硬刪可用；不做回覆與軟隱藏' },
    'booking-calendar': { ready: true, level: 'partial', note: '公休＋營區／營位＋特殊節日曆可用；月份容量由 Booking API 呈現' },
    bookings: { ready: true, level: 'full', note: '查詢、履約、內部備註、已付款取消／退款可用' },
    permissions: { ready: true, level: 'full', note: '管理員與有效權限正式可用' },
  };

  var FEATURE_READINESS = {
    'customers.create': false,
    /** 標籤字典 CRUD（W1-02）已就緒 / Tag pool CRUD ready */
    'customers.tagPool': true,
    /** 會員身上指派（W1-03）已就緒 / Assign tags to customer ready */
    'customers.tagAssign': true,
    /** 預設收件地址可編（W1-04）/ Default shipping address editable */
    'customers.defaultAddress': true,
    /** 會員偏好可編（W1-05）/ Customer preferences editable */
    'customers.preferences': true,
    'orders.sellerNote': true,
    /** W3-01／W3-02：未出貨取消（含已付款退款） */
    'orders.cancel': true,
    'bookings.sellerNote': true,
    /** W3-03：已付款預約取消 */
    'bookings.cancel': true,
    /** 最低庫存閾值讀寫（W1-07）；on-hand 仍唯讀 / Min-stock ready; on-hand still read-only */
    'products.minStock': true,
    /** W2-01／02：分類／品牌主檔（共用「分類／品牌」按鈕＋Modal tab） */
    'products.categoryMaster': true,
    'products.brandMaster': true,
    /** W2-03／04：租借 SKU、listing、裝備規格／標籤 */
    'products.rentalWrite': true,
    /** W2-06：庫位主檔 */
    'movement.locations': true,
    /** W2-05：商店→租借跨領域轉換 */
    'movement.conversion': true,
    /** 評論列表／硬刪（W1-06）；不做回覆／軟隱藏 */
    'reviews.manage': true,
    /** W4-01：營區主檔 CRUD／啟停（預約排程頁 Modal） */
    'booking-calendar.campgrounds': true,
    /** W4-02：營位主檔 CRUD／啟停（同上 Modal 營位 tab） */
    'booking-calendar.zones': true,
    /** W4-03：特殊節日曆 calendar_dates（預約排程頁 Modal） */
    'booking-calendar.calendarDates': true,
    /** W4-06：分析報表伺服器端彙總（不再拉 orders／bookings 全列表做 KPI） */
    'analytics.summary': true,
  };

  function isBackendMode() {
    return !!(global.AdminAPI
      && global.AdminAPI.isBackendEnabled
      && global.AdminAPI.isBackendEnabled());
  }

  /** 將後端 permission code 集合轉成既有 Sidebar 使用的 section view/edit 矩陣。 */
  function buildPermissionMatrix(codes) {
    var matrix = {};
    (codes || []).forEach(function (code) {
      var separator = String(code).lastIndexOf('.');
      if (separator < 1) return;
      var section = String(code).slice(0, separator);
      var action = String(code).slice(separator + 1);
      if (action !== 'view' && action !== 'edit') return;
      if (!matrix[section]) matrix[section] = { view: false, edit: false };
      matrix[section][action] = true;
    });
    return matrix;
  }

  /** SessionStorage 只保存 UI 快取；Firebase ID Token 不寫入 Web Storage。 */
  function saveSession(profile) {
    sessionStorage.setItem('adminLoggedIn', 'true');
    sessionStorage.setItem('adminId', profile.adminUserId);
    sessionStorage.setItem('adminName', profile.name || profile.email || '管理員');
    sessionStorage.setItem('adminRole', profile.role || 'operator');
    sessionStorage.setItem('adminEmail', profile.email || '');
    sessionStorage.setItem('isSuperAdmin', 'false');
    sessionStorage.setItem(
      'adminPermissions',
      JSON.stringify(buildPermissionMatrix(profile.effectivePermissions))
    );
  }

  function clearSession() {
    SESSION_KEYS.forEach(function (key) {
      sessionStorage.removeItem(key);
    });
  }

  /** 載入共用 Firebase 模組並把 Auth instance 注入 AppAuth。 */
  async function initializeFirebase() {
    await import('/storefront/js/firebase-app.js');
    if (!global.YuruiFirebase || !global.YuruiFirebase.isReady()) {
      return null;
    }
    var auth = global.YuruiFirebase.getAuth();
    if (global.YuruiFirebase.waitForAuthState) {
      await global.YuruiFirebase.waitForAuthState();
    }
    global.AppAuth.configure({ auth: auth });
    return auth;
  }

  /** 以目前 Firebase 或 development dev Token 重新向後端取得最新有效權限。 */
  async function refreshBackendSession(options) {
    var settings = options || {};
    var token = settings.idToken || await global.AppAuth.getIdToken({
      required: true,
      forceRefresh: settings.forceRefresh === true,
    });
    var result = await global.AdminAPI.auth.establishSession(token);
    saveSession(result.data);
    return result.data;
  }

  /** Dashboard 每次重整都重新驗證白名單、啟用狀態與有效權限。 */
  async function initializeDashboard() {
    if (!isBackendMode()) {
      return sessionStorage.getItem('adminLoggedIn') === 'true';
    }

    var auth = await initializeFirebase();
    var devToken = global.AppConfig
      && global.AppConfig.AUTH
      && String(global.AppConfig.AUTH.DEV_TOKEN || '').trim();
    devToken = devToken || sessionStorage.getItem('adminDevToken') || '';
    if (devToken) global.AppAuth.configure({ devToken: devToken });
    if ((!auth || !auth.currentUser) && !devToken) {
      clearSession();
      return false;
    }

    await refreshBackendSession({ forceRefresh: false });
    return true;
  }

  async function signOut() {
    clearSession();
    if (isBackendMode() && global.YuruiFirebase && global.YuruiFirebase.signOut) {
      await global.YuruiFirebase.signOut();
    }
  }

  var adminMode = global.AppConfig && global.AppConfig.ADMIN;
  var useBackend = adminMode && typeof adminMode.USE_BACKEND === 'boolean'
    ? adminMode.USE_BACKEND
    : !!(global.AppConfig && global.AppConfig.USE_MOCK_API === false);
  global.AdminAPI.configure({
    useBackend: useBackend,
    baseUrl: global.AppConfig && global.AppConfig.API_BASE_URL
      ? global.AppConfig.API_BASE_URL.replace(/\/$/, '') + '/admin'
      : '/api/admin',
  });

  global.AdminRuntime = {
    readiness: READINESS,
    featureReadiness: FEATURE_READINESS,
    isBackendMode: isBackendMode,
    isSectionReady: function (section) {
      return !isBackendMode() || !!(READINESS[section] && READINESS[section].ready);
    },
    isFeatureReady: function (feature) {
      return !isBackendMode() || FEATURE_READINESS[feature] !== false;
    },
    getReadiness: function (section) {
      return READINESS[section] || { ready: false, level: 'none', note: '尚未完成 readiness 盤點' };
    },
    buildPermissionMatrix: buildPermissionMatrix,
    saveSession: saveSession,
    clearSession: clearSession,
    initializeFirebase: initializeFirebase,
    refreshBackendSession: refreshBackendSession,
    initializeDashboard: initializeDashboard,
    signOut: signOut,
  };

  /** Token 強制刷新仍失敗時清除 UI Session，要求管理員重新登入。 */
  if (typeof global.addEventListener === 'function') {
    global.addEventListener('app-auth-expired', function () {
      if (!isBackendMode()) return;
      clearSession();
      sessionStorage.setItem('adminLoginMessage', '登入已逾期，請重新使用管理員帳號登入。');
      if (!/\/admin\/login\.html$/.test(global.location.pathname)) {
        global.location.href = '/admin/login.html';
      }
    });
  }
})(typeof window !== 'undefined' ? window : this);
