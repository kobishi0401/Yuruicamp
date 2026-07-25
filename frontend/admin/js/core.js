/**
 * admin/js/core.js
 * 後台核心功能：
 *  1. Auth 守衛：未登入自動跳轉登入頁
 *  2. 權限 helper：canView / canEdit / Sidebar 灰階 / 編輯按鈕 disabled
 *  3. Sidebar 導覽點擊 → AJAX 載入對應 partial + 呼叫初始化函式
 *  4. Topbar 頁面標題動態更新
 *  5. 登出邏輯
 *  6. Toast 工廠函式（供所有模組呼叫）
 *
 *  API 持久化：各模組透過 admin/js/admin-api.js 預留 REST 接口。
 *  Firebase 後台登入後會還原 AppAuth；各模組若要打真後端：
 *    AdminAPI.configure({ useBackend: true });
 *  API 持久化：AdminRuntime 依 AppConfig 啟用正式 API、刷新 Session 並套用 readiness。
 */

/**
 * 後端啟用時走 AdminAPI.list()，否則讀 MockDataPaths JSON（根絕對 /data/...）
 * Load admin list data from REST API or local JSON seed — no path rewriting.
 */
window.loadAdminJsonResource = function (options) {
  var onSuccess = options.onSuccess;
  var onError = options.onError;
  var emptyValue = options.emptyValue;
  var adminList = options.adminList;
  var jsonPath = options.jsonPath;
  var paths = window.MockDataPaths || {};

  if (typeof AdminAPI !== 'undefined' && AdminAPI.isBackendEnabled && AdminAPI.isBackendEnabled() && adminList) {
    adminList()
      .then(function (res) { onSuccess((res && res.data) || emptyValue); })
      .catch(function (err) {
        if (options.errorMessage) AdminAPI.handleError(err, options.errorMessage);
        if (onError) onError(err);
        else onSuccess(emptyValue);
      });
    return;
  }

  $.getJSON(jsonPath, function (data) {
    // 圖片欄位維持 /assets/... 原樣，瀏覽器從網站根解析
    if (jsonPath === paths.customers && typeof window.hydrateNormalizedCustomerRelations === 'function') {
      window.hydrateNormalizedCustomerRelations(data).then(onSuccess).catch(function (error) {
        if (onError) onError(error);
        else onSuccess(emptyValue);
      });
      return;
    }
    onSuccess(data);
  }).fail(function () {
    if (onError) onError();
    else onSuccess(emptyValue);
  });
};

// ==========================================================
// === 各模組「無 edit 權限」時需停用的選擇器 ===
// ==========================================================
var EDIT_PERMISSION_SELECTORS = {
  orders: '.btn-ship-order, .btn-complete-order, .btn-cancel-order, #confirmOrderCancelBtn, #orderCancelReasonInput, #btnSaveSellerNote, #modalSellerNote',
  products: '[data-bs-target="#addProductModal"], .edit-product-name, .stock-edit-btn, .stock-confirm-btn, .stock-cancel-btn, #submitAddProduct, #generateMovementRecord, #confirmProductStockMovementReason, .pending-line-nature-select, .pending-line-note-input, .pending-transfer-note-input',
  movement: '.movement-line-reason-input, .btn-save-movement-line-reason, .movement-line-nature-select',
  customers: '#addCustomerBtn, #saveCustomerBtn, #addCustomerModal input:not([readonly]), #addCustomerModal select, #addCustomerModal button:not(.btn-close):not([data-bs-dismiss="modal"]), .shipping-address-edit-btn, #saveCustomerShippingAddressBtn, #customerShippingAddressModal input, #customerShippingAddressModal select, #customerShippingAddressModal button:not(.btn-close):not([data-bs-dismiss="modal"]), .phone-edit-btn, .email-edit-btn, .birthday-edit-btn, .tier-edit-btn, .points-edit-btn, .tags-edit-btn, .tags-done-btn, .tags-cancel-btn, .tag-add-btn, .tag-delete-btn, .customer-edit-confirm-btn, .customer-edit-cancel-all-btn, #customerEditConfirmBtn',
  discounts: '#submitAddCoupon, .btn-toggle-coupon, .btn-delete-coupon, #generateCouponCode, #addCouponForm input, #addCouponForm select, #addCouponForm textarea, #addCouponForm button:not(.btn-close)',
  reviews: '.btn-delete-review, #confirmDeleteReviewBtn',
  bookings: '.btn-confirm-booking, .btn-cancel-booking, #btnSaveBookingSellerNote, #bkModalSellerNote, #confirmCancelBtn',
  'booking-calendar': '#bcBtnClosureSettings, #bcBtnCampgrounds, #bcBtnCalendarDates, #bcBtnSaveClosure, #bcBtnCloseSingleDay, .bc-btn-delete-closure, #bcCampgroundCreateBtn, .bc-btn-campground-toggle, .bc-btn-campground-delete, #bcCampgroundCreateForm input, #bcCampgroundCreateForm button, #bcZoneCreateBtn, #bcZoneCancelEditBtn, .bc-btn-zone-edit, .bc-btn-zone-toggle, .bc-btn-zone-delete, #bcZoneCreateForm input, #bcZoneCreateForm button, #bcZoneCampgroundSelect, .bc-cal-holiday-cb, .bc-cal-holiday-name, .bc-btn-cal-save-name',
  permissions: '#addEmployeeBtn, .btn-edit-employee, .btn-toggle-employee, #employeeModal input:not([readonly]), #employeeModal select, #employeeModal button:not(.btn-close):not([data-bs-dismiss]), #saveEmployeeBtn, .perm-view-cb, .perm-edit-cb',
};

/**
 * 從 sessionStorage 解析權限物件
 * Parse permissions JSON from sessionStorage
 */
window.getAdminPermissions = function () {
  try {
    var raw = sessionStorage.getItem('adminPermissions');
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
};

/** 超級管理員擁有全部權限 / Super admin has full access */
function isCurrentSuperAdmin() {
  return sessionStorage.getItem('isSuperAdmin') === 'true';
}

/**
 * 檢查某 section 是否有查看權限
 * Check view permission for a section
 */
window.canView = function (section) {
  if (window.AdminRuntime && !window.AdminRuntime.isSectionReady(section)) return false;
  if (isCurrentSuperAdmin()) return true;
  var perms = window.getAdminPermissions();
  return !!(perms[section] && perms[section].view);
};

/**
 * 檢查某 section 是否有編輯權限
 * Check edit permission for a section
 */
window.canEdit = function (section) {
  if (isCurrentSuperAdmin()) return true;
  var perms = window.getAdminPermissions();
  return !!(perms[section] && perms[section].edit);
};

/**
 * 依權限渲染 Sidebar（無 view 權限 → 灰色 disabled）
 * Apply sidebar link enabled/disabled state from permissions
 */
window.applySidebarPermissions = function () {
  $('.sidebar-link').each(function () {
    var section = $(this).data('section');
    if (!section) return;

    var readiness = window.AdminRuntime && window.AdminRuntime.getReadiness(section);
    if (window.AdminRuntime && !window.AdminRuntime.isSectionReady(section)) {
      $(this)
        .addClass('disabled backend-not-ready')
        .removeClass('active')
        .attr('title', readiness.note);
    } else if (window.canView(section)) {
      $(this).removeClass('disabled backend-not-ready').removeAttr('title');
    } else {
      $(this)
        .addClass('disabled')
        .removeClass('active backend-not-ready')
        .attr('title', '目前帳號沒有查看權限');
    }
  });
};

/**
 * 取得第一個可查看的 section（登入後預設首頁）
 * First viewable section in sidebar order, or null if none
 */
window.getDefaultSection = function () {
  var sections = window.ADMIN_SECTIONS || [];
  for (var i = 0; i < sections.length; i++) {
    if (window.canView(sections[i].key)) {
      return sections[i].key;
    }
  }
  return null;
};

/** 依 section 取得 Topbar 標題 / Get display title for section */
function getSectionTitle(section) {
  var sections = window.ADMIN_SECTIONS || [];
  var found = sections.find(function (s) { return s.key === section; });
  return found ? found.label : '後台管理';
}

/**
 * 對容器內編輯元素套用 disabled（無 edit 權限時）
 * Disable edit controls when user lacks edit permission
 */
window.applyEditPermission = function (section, $container) {
  var $scope = $container && $container.length ? $container : $('#contentArea');
  var selectors = EDIT_PERMISSION_SELECTORS[section];
  var noEditTitle = '無編輯權限';

  if (window.canEdit(section)) {
    if (selectors) {
      $scope.find(selectors).prop('disabled', false).removeAttr('data-permission-disabled');
    }
    // 商品新增 Modal 在 dashboard 全域
    if (section === 'products') {
      $('#submitAddProduct, #addProductForm input, #addProductForm select, #addProductForm textarea, #addProductForm button:not(.btn-close):not([data-bs-dismiss="modal"])')
        .prop('disabled', false)
        .removeAttr('data-permission-disabled');
    }
    // 預約 Modal 在 dashboard 全域，需另外還原
    if (section === 'bookings') {
      $('#btnCompleteBooking, #equipmentReturnedCheck, #confirmCancelBtn, #cancelReasonInput, #btnSaveBookingSellerNote, #bkModalSellerNote')
        .prop('disabled', false)
        .removeAttr('data-permission-disabled');
    }
    // 訂單明細／取消 Modal 在 dashboard 全域
    if (section === 'orders') {
      $('#btnSaveSellerNote, #modalSellerNote, #confirmOrderCancelBtn, #orderCancelReasonInput')
        .prop('disabled', false)
        .removeAttr('data-permission-disabled');
    }
    $scope.removeClass('permission-readonly');
    return;
  }

  $scope.addClass('permission-readonly');

  if (selectors) {
    $scope.find(selectors).each(function () {
      $(this).prop('disabled', true).attr('data-permission-disabled', 'true').attr('title', noEditTitle);
    });
  }

  if (section === 'products') {
    $('#submitAddProduct, #addProductForm input, #addProductForm select, #addProductForm textarea, #addProductForm button:not(.btn-close):not([data-bs-dismiss="modal"])')
      .prop('disabled', true)
      .attr('data-permission-disabled', 'true')
      .attr('title', noEditTitle);
  }

  // 預約相關全域 Modal 控制項
  if (section === 'bookings') {
    $('#btnCompleteBooking, #equipmentReturnedCheck, #confirmCancelBtn, #cancelReasonInput, #btnSaveBookingSellerNote, #bkModalSellerNote')
      .prop('disabled', true)
      .attr('data-permission-disabled', 'true')
      .attr('title', noEditTitle);
  }

  // 訂單明細／取消 Modal（從訂單管理或客戶管理開啟皆適用）
  if (section === 'orders') {
    $('#btnSaveSellerNote, #modalSellerNote, #confirmOrderCancelBtn, #orderCancelReasonInput')
      .prop('disabled', true)
      .attr('data-permission-disabled', 'true')
      .attr('title', noEditTitle);
  }
};

/** 無任何頁面權限時的提示畫面 / Empty state when no view permissions */
function showNoPermissionPage() {
  $('#contentArea').html(
    '<div class="text-center py-5">' +
    '<i class="fas fa-lock fa-3x text-muted mb-3"></i>' +
    '<p class="text-muted fs-5">您目前沒有任何頁面權限，請聯絡管理員。</p>' +
    '</div>'
  );
  $('#pageTitle').text('後台管理');
}

/** 載入預設首頁（第一個有 view 權限的 section） */
function loadDefaultHomeSection() {
  var defaultSection = window.getDefaultSection();

  if (!defaultSection) {
    showNoPermissionPage();
    return;
  }

  var title = getSectionTitle(defaultSection);
  $('#pageTitle').text(title);
  $('.sidebar-link').removeClass('active');
  $('.sidebar-link[data-section="' + defaultSection + '"]').addClass('active');
  loadSection(defaultSection);
}

/** 登出時清除全部 session 資料（相容舊 5 key + AdminAuth 輔助 key） */
function clearAdminSession() {
  if (window.AdminAuth && typeof window.AdminAuth.clearAdminSessionStorage === 'function') {
    window.AdminAuth.clearAdminSessionStorage();
    return;
  }
  if (window.AdminRuntime && typeof window.AdminRuntime.clearSession === 'function') {
    window.AdminRuntime.clearSession();
    return;
  }
  sessionStorage.removeItem('adminLoggedIn');
  sessionStorage.removeItem('adminId');
  sessionStorage.removeItem('adminName');
  sessionStorage.removeItem('isSuperAdmin');
  sessionStorage.removeItem('adminPermissions');
}

$(document).ready(async function () {

  // ==========================================================
  // === 1. Auth 守衛：驗證是否已登入 ===
  // ==========================================================
  // 正式模式重新驗證 Firebase、管理員白名單與有效權限；Mock 才讀舊 session flag。
  var isLoggedIn = false;
  try {
    isLoggedIn = window.AdminRuntime
      ? await window.AdminRuntime.initializeDashboard()
      : sessionStorage.getItem('adminLoggedIn') === 'true';
  } catch (error) {
    if (window.AdminRuntime) window.AdminRuntime.clearSession();
    sessionStorage.setItem(
      'adminLoginMessage',
      (error && error.message) || '管理員 Session 驗證失敗，請重新登入。'
    );
  }
  if (!isLoggedIn) {
    window.location.href = '/admin/login.html';
    return;
  }

  // Firebase 登入後還原 AppAuth，之後 AdminAPI.useBackend=true 才能帶 Bearer
  if (window.AdminAuth && typeof window.AdminAuth.restoreAppAuthIfNeeded === 'function') {
    window.AdminAuth.restoreAppAuthIfNeeded();
  }

  // 顯示管理員名稱（從 sessionStorage 取出）
  const adminName = sessionStorage.getItem('adminName') || '管理員';
  $('#sidebarAdminName').text(adminName);
  $('#topbarAdminName').html(`<i class="fas fa-user me-2"></i>${adminName}`);

  // 頭像縮寫（取名字第一個字）
  const initial = adminName.charAt(0).toUpperCase();
  $('#adminAvatarBtn').text(initial);
  $('#adminRuntimeBadge')
    .text(window.AdminRuntime && window.AdminRuntime.isBackendMode() ? 'Backend' : 'Mock')
    .toggleClass('text-bg-success', !!(window.AdminRuntime && window.AdminRuntime.isBackendMode()))
    .toggleClass('text-bg-secondary', !(window.AdminRuntime && window.AdminRuntime.isBackendMode()));

  // ==========================================================
  // === 2. Sidebar 權限 + 預設載入第一個可查看頁面 ===
  // ==========================================================
  window.applySidebarPermissions();
  loadDefaultHomeSection();

  // ==========================================================
  // === 3. Sidebar 導覽點擊事件 ===
  // ==========================================================
  // 說明：使用 $(document).on() 是因為手機版 Offcanvas 裡也有一份 Sidebar
  //       $(document).on() 能同時捕捉靜態 Sidebar 與 Offcanvas 裡的連結點擊
  $(document).on('click', '.sidebar-link', function (e) {
    e.preventDefault(); // 阻止連結跳頁

    const section = $(this).data('section');   // 取得模組名稱（例："orders"）
    const title = $(this).data('title');       // 取得頁面標題（例："訂單管理"）

    // ADM-W2-08：有未產異動的庫存變更時，離開商品頁要先確認（R1）
    // Leave products with pending stock audit? Confirm first.
    if (typeof window.confirmLeaveWithPendingStockMovements === 'function'
        && !window.confirmLeaveWithPendingStockMovements(section)) {
      return;
    }

    // 更新 Active 狀態：移除所有 active，只加在被點擊的連結
    // 注意：使用 class 選擇器 `.sidebar-link` 同時更新兩個 Sidebar（桌面版 + 手機版）
    $('.sidebar-link').removeClass('active');
    // 找到所有 data-section 相同的連結（桌面版 + Offcanvas 各一個）
    $(`.sidebar-link[data-section="${section}"]`).addClass('active');

    // 更新 Topbar 頁面標題
    $('#pageTitle').text(title || '後台管理');

    // 載入對應模組的 partial HTML
    loadSection(section);

    // 手機版：關閉 Offcanvas（如果目前是手機版且 Offcanvas 是開著的）
    const offcanvasEl = document.getElementById('mobileSidebar');
    if (offcanvasEl) {
      const offcanvasInstance = bootstrap.Offcanvas.getInstance(offcanvasEl);
      if (offcanvasInstance) offcanvasInstance.hide();
    }
  });

  // ==========================================================
  // === 4. 登出邏輯（Sidebar 底部 + Topbar 下拉選單）===
  // ==========================================================
  // 說明：點擊任意登出按鈕，清除 sessionStorage 並跳回登入頁
  $(document).on('click', '#logoutBtn, #logoutBtnTopbar, .sidebar-logout-mobile', async function (e) {
    e.preventDefault();

    var goLogin = function () {
      window.location.href = '/admin/login.html';
    };

    // 優先使用 AdminAuth.logout（會處理 Firebase signOut + 清 session）
    if (window.AdminAuth && typeof window.AdminAuth.logout === 'function') {
      window.AdminAuth.logout().finally(goLogin);
      return;
    }

    // 若有 AdminRuntime（舊流程），則使用其 signOut
    if (window.AdminRuntime && typeof window.AdminRuntime.signOut === 'function') {
      await window.AdminRuntime.signOut();
      goLogin();
      return;
    }

    clearAdminSession();
    goLogin();
  });

}); // end $(document).ready()

// ==========================================================
// === loadSection(sectionName) — AJAX Partial 載入系統 ===
// ==========================================================
/**
 * 功能：載入指定功能模組的 HTML partial 到 #contentArea，
 *       載入完成後呼叫對應模組的初始化函式
 *
 * @param {string} sectionName - 模組名稱
 *   可選值：'analytics' | 'orders' | 'movement' | 'products' | 'customers' | 'discounts' | 'reviews' | 'booking-calendar' | 'bookings'
 *
 * --- API 預留說明 ---
 * 目前從本地 partials/ 資料夾載入靜態 HTML。
 * 若要串接後端，只需將 url 變數改為：
 *   const url = `/api/admin/partials/${sectionName}`;
 * 後端回傳動態 HTML 即可，其餘邏輯完全不變。
 */
function loadSection(sectionName) {
  if (window.AdminRuntime && !window.AdminRuntime.isSectionReady(sectionName)) {
    var readiness = window.AdminRuntime.getReadiness(sectionName);
    window.showAdminToast(readiness.note, 'warning');
    return;
  }
  // 1. 查看權限守衛：無 view 權限則阻擋
  if (!window.canView(sectionName)) {
    window.showAdminToast('您沒有「' + getSectionTitle(sectionName) + '」的查看權限', 'error');
    return;
  }

  // 本地 partial 路徑
  const url = `partials/${sectionName}.html`;

  // 顯示 Loading 動畫（在內容出現之前給使用者視覺回饋）
  $('#contentArea').html(`
    <div class="text-center py-5">
      <div class="spinner-border" style="color: var(--admin-brand-accent);"></div>
      <p class="mt-2 text-muted small">載入中...</p>
    </div>
  `);

  // 使用 jQuery $.load() 載入 HTML 到 #contentArea
  // $.load() 說明：
  //   - 第一個參數：要載入的 URL
  //   - 第二個參數（callback）：載入完成後執行的函式
  //   - callback 的 status 參數：'success' 代表成功，'error' 代表失敗
  $('#contentArea').load(url, function (response, status) {

    // 載入失敗時顯示錯誤訊息
    if (status === 'error') {
      $('#contentArea').html(`
        <div class="alert alert-danger d-flex align-items-center gap-2">
          <i class="fas fa-exclamation-triangle"></i>
          <span>載入 <strong>${sectionName}</strong> 模組失敗，請重新整理頁面。</span>
        </div>
      `);
      return;
    }

    // 載入成功：加上淡入動畫效果
    $('#contentArea').addClass('section-fade-in');
    setTimeout(() => $('#contentArea').removeClass('section-fade-in'), 300);

    // 呼叫對應模組的初始化函式
    // 說明：各模組的 JS 檔（analytics.js、orders.js 等）都把初始化函式
    //       掛載到 window 上（window.initXxx = function(){}），
    //       這樣 core.js 就能統一用字典的方式呼叫，不需要 if/else 判斷
    const initFunctions = {
      analytics:   window.initAnalytics,
      orders:      window.initOrders,
      movement:    window.initMovement,
      products:    window.initProducts,
      customers:   window.initCustomers,
      discounts:   window.initDiscounts,
      reviews:     window.initReviews,
      bookings:    window.initBookings,
      'booking-calendar': window.initBookingCalendar,
      permissions: window.initPermissions,
    };

    // 確認初始化函式存在後再呼叫
    if (typeof initFunctions[sectionName] === 'function') {
      initFunctions[sectionName]();
    }

    // 3. 靜態元素套用編輯權限（動態渲染的由各自模組 render 後再呼叫）
    window.applyEditPermission(sectionName, $('#contentArea'));
  });
}

// ==========================================================
// === showAdminToast(message, type) — Toast 工廠函式 ===
// ==========================================================
/**
 * 功能：在後台右下角顯示短暫提示訊息（Toast Notification）
 *
 * @param {string} message - 提示文字
 * @param {string} type    - 類型：'success'（預設）| 'error' | 'info'
 *
 * 呼叫範例：
 *   window.showAdminToast('訂單已更新');
 *   window.showAdminToast('請填寫完整資料', 'error');
 *   window.showAdminToast('操作記錄已儲存', 'info');
 */
window.showAdminToast = function (message, type = 'success') {

  // 顏色與圖示的對照表
  const colorMap = {
    success: 'bg-success',
    error:   'bg-danger',
    danger:  'bg-danger',
    info:    'bg-info',
  };
  const iconMap = {
    success: 'fa-check-circle',
    error:   'fa-times-circle',
    danger:  'fa-times-circle',
    info:    'fa-info-circle',
  };

  const bgClass  = colorMap[type] || colorMap.success;
  const iconClass = iconMap[type] || iconMap.success;

  // Toast HTML 結構（Bootstrap 5 原生 Toast 元件）
  const toastHtml = `
    <div class="toast align-items-center text-white border-0 ${bgClass}"
         role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body d-flex align-items-center gap-2">
          <i class="fas ${iconClass}"></i>
          <span>${message}</span>
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto"
                data-bs-dismiss="toast" aria-label="關閉"></button>
      </div>
    </div>`;

  // 確保 Toast 容器存在（固定在右下角）
  // 若不存在則動態建立
  if ($('#toastContainer').length === 0) {
    $('body').append(
      '<div id="toastContainer" class="toast-container position-fixed bottom-0 end-0 p-3"' +
      ' style="z-index: 1100;"></div>'
    );
  }

  // 建立 Toast 並加到容器，然後顯示
  const $toast = $(toastHtml).appendTo('#toastContainer');
  const bsToast = new bootstrap.Toast($toast[0], {
    delay: 3000,    // 3 秒後自動消失
    autohide: true, // 自動隱藏
  });
  bsToast.show();

  // Toast 消失後從 DOM 移除，避免越堆越多造成記憶體浪費
  $toast[0].addEventListener('hidden.bs.toast', function () {
    $toast.remove();
  });
};
