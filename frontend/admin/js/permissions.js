/**
 * admin/js/permissions.js
 * 權限管理模組 — 員工資料層 + 權限管理頁 UI
 *
 * 資料來源：localStorage.adminEmployees（未來可替換為 REST API）
 * Permission module — employee store + permissions admin UI (localStorage mock)
 */

// ==========================================================
// === 10 個後台頁面定義（Sidebar 順序）===
// ==========================================================
/** @type {Array<{key: string, label: string}>} */
window.ADMIN_SECTIONS = [
  { key: 'analytics',   label: '分析報表' },
  { key: 'orders',      label: '訂單管理' },
  { key: 'movement',    label: '庫存異動紀錄' },
  { key: 'products',    label: '商品與庫存' },
  { key: 'customers',   label: '客戶管理' },
  { key: 'discounts',   label: '折扣管理' },
  { key: 'reviews',     label: '評論管理' },
  { key: 'booking-calendar', label: '預約排程面板' },
  { key: 'bookings',    label: '預約/租借管理' },
  { key: 'permissions', label: '權限管理' },
];

var EMPLOYEE_STORAGE_KEY = 'adminEmployees';
var backendEmployeeCache = [];
var backendPermissionDictionary = [];

/** 判斷權限頁是否已切換到正式後端。 */
function isPermissionBackendEnabled() {
  return typeof AdminAPI !== 'undefined' &&
    AdminAPI.isBackendEnabled &&
    AdminAPI.isBackendEnabled();
}

// --- API 預留（未來串接後端時替換 localStorage 邏輯）---
// GET    /api/admin/employees
// POST   /api/admin/employees
// PUT    /api/admin/employees/:id
// PATCH  /api/admin/employees/:id/status
// POST   /api/admin/login

/**
 * 建立預設權限物件（10 頁 view/edit）
 * Build default permissions object for all 9 sections
 * @param {boolean} allTrue - true = 全部開放；false = 全部關閉
 */
function getDefaultPermissions(allTrue) {
  var perms = {};
  window.ADMIN_SECTIONS.forEach(function (sec) {
    perms[sec.key] = { view: !!allTrue, edit: !!allTrue };
  });
  return perms;
}

/**
 * 第一次使用時寫入種子資料（01 超級管理員、02 示範員工）
 * Seed employees 01 (super admin) and 02 (demo staff) on first run
 */
function initEmployeeStore() {
  if (localStorage.getItem(EMPLOYEE_STORAGE_KEY)) {
    return;
  }

  var seedDate = '2026-06-14';
  var employees = [
    {
      id: '01',
      displayName: '王老闆',
      email: 'boss@demo.test',
      isSuperAdmin: true,
      isActive: true,
      createdAt: seedDate,
      permissions: getDefaultPermissions(true),
    },
    {
      id: '02',
      displayName: '測試員工',
      email: 'staff@demo.test',
      isSuperAdmin: false,
      isActive: true,
      createdAt: seedDate,
      permissions: {
        analytics:   { view: false, edit: false },
        orders:      { view: true,  edit: true  },
        movement:    { view: false, edit: false },
        products:    { view: false, edit: false },
        customers:   { view: true,  edit: false },
        discounts:   { view: false, edit: false },
        reviews:     { view: false, edit: false },
        'booking-calendar': { view: false, edit: false },
        bookings:    { view: false, edit: false },
        permissions: { view: false, edit: false },
      },
    },
  ];

  saveEmployees(employees);
}

/** 補齊員工權限中缺少的新 section key / Backfill missing section permissions */
function migrateEmployeePermissions(permissions) {
  permissions = permissions || {};
  window.ADMIN_SECTIONS.forEach(function (sec) {
    if (!permissions[sec.key]) {
      permissions[sec.key] = { view: false, edit: false };
    }
  });
  return permissions;
}

/** 從 localStorage 讀取員工列表 / Fetch employees from localStorage */
function fetchEmployees() {
  initEmployeeStore();
  try {
    var list = JSON.parse(localStorage.getItem(EMPLOYEE_STORAGE_KEY) || '[]');
    var changed = false;
    list.forEach(function (emp) {
      var before = JSON.stringify(emp.permissions || {});
      emp.permissions = migrateEmployeePermissions(emp.permissions);
      if (JSON.stringify(emp.permissions) !== before) changed = true;
    });
    if (changed) saveEmployees(list);
    return list;
  } catch (e) {
    return [];
  }
}

/** 寫入 localStorage / Save employees to localStorage */
function saveEmployees(list) {
  localStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(list));
}

/**
 * 自動產生下一個員工編號（01~09 補零，超過 99 不補零）
 * Next employee id: zero-pad to 2 digits until 99, then "100", "101"...
 */
function getNextEmployeeId(employees) {
  var maxNum = 0;
  (employees || []).forEach(function (emp) {
    var num = parseInt(emp.id, 10);
    if (!isNaN(num) && num > maxNum) {
      maxNum = num;
    }
  });
  var next = maxNum + 1;
  return next <= 99 ? String(next).padStart(2, '0') : String(next);
}

/** 依 ID 查找員工 / Find employee by id */
function findEmployeeById(id) {
  return fetchEmployees().find(function (emp) {
    return emp.id === id;
  }) || null;
}

/** 計算啟用中的超級管理員人數 / Count active super admins */
function countActiveSuperAdmins(employees, excludeId) {
  return (employees || []).filter(function (emp) {
    if (excludeId && emp.id === excludeId) return false;
    return emp.isSuperAdmin && emp.isActive;
  }).length;
}

/**
 * 是否允許停用某員工（含超級管理員保護規則）
 * Can deactivate employee? (protect last active super admin)
 */
function canDeactivateEmployee(target, currentAdminId) {
  if (target.id === currentAdminId) {
    return { ok: false, message: '無法停用自己的帳號' };
  }
  if (target.isSuperAdmin && target.isActive) {
    var employees = fetchEmployees();
    var others = countActiveSuperAdmins(employees, target.id);
    if (others < 1) {
      return { ok: false, message: '系統至少需保留 1 位啟用中的超級管理員' };
    }
  }
  return { ok: true };
}

/**
 * 是否允許取消超級管理員身份
 * Can remove super admin flag from employee?
 */
function canRemoveSuperAdminStatus(employee, employees) {
  if (!employee.isSuperAdmin) {
    return { ok: true };
  }
  if (!employee.isActive) {
    return { ok: true };
  }
  var others = countActiveSuperAdmins(employees, employee.id);
  if (others < 1) {
    return { ok: false, message: '系統至少需保留 1 位啟用中的超級管理員' };
  }
  return { ok: true };
}

// 正式模式不建立 localStorage 員工種子；Mock 模式才初始化展示資料。
if (!isPermissionBackendEnabled()) {
  initEmployeeStore();
}

// 匯出給 login.html 使用 / Expose helpers for login page
window.fetchEmployees = fetchEmployees;
window.saveEmployees = saveEmployees;
window.findEmployeeById = findEmployeeById;
window.getNextEmployeeId = getNextEmployeeId;
window.getDefaultPermissions = getDefaultPermissions;

// ==========================================================
// === 權限管理頁 UI ===
// ==========================================================

/** 權限管理頁初始化（由 core.js loadSection 呼叫） */
window.initPermissions = function () {
  $(document).off('.permissions');

  renderEmployeeTable();

  // 新增員工按鈕
  $(document).on('click.permissions', '#addEmployeeBtn', function () {
    openEmployeeModal(null);
  });

  // 編輯員工
  $(document).on('click.permissions', '.btn-edit-employee', function () {
    var empId = $(this).data('employee-id');
    openEmployeeModal(empId);
  });

  // 停用 / 啟用
  $(document).on('click.permissions', '.btn-toggle-employee', function () {
    var empId = $(this).data('employee-id');
    toggleEmployeeStatus(empId);
  });

  // 角色變更後套用該角色的預設權限，仍可再做個別調整。
  $(document).on('change.permissions', '#empRole', function () {
    if (isPermissionBackendEnabled()) {
      applyRolePermissionDefaults($(this).val());
    }
  });

  // 權限矩陣：查看 / 編輯連動
  $(document).on('change.permissions', '.perm-view-cb', function () {
    var section = $(this).data('section');
    var $editCb = $('.perm-edit-cb[data-section="' + section + '"]');
    if (!$(this).is(':checked')) {
      $editCb.prop('checked', false);
    }
  });

  $(document).on('change.permissions', '.perm-edit-cb', function () {
    var section = $(this).data('section');
    var $viewCb = $('.perm-view-cb[data-section="' + section + '"]');
    if ($(this).is(':checked')) {
      $viewCb.prop('checked', true);
    }
  });

  // 儲存員工
  $(document).on('click.permissions', '#saveEmployeeBtn', function () {
    saveEmployeeFromModal();
  });

  // Modal 關閉時重置
  $(document).on('hidden.bs.modal.permissions', '#employeeModal', function () {
    resetEmployeeModal();
  });

  // 套用本頁編輯權限（無 edit 時按鈕 disabled）
  if (typeof window.applyEditPermission === 'function') {
    window.applyEditPermission('permissions', $('#contentArea'));
  }
};

/** 渲染員工列表 / Render employee table */
function renderEmployeeTable() {
  if (isPermissionBackendEnabled()) {
    renderBackendEmployeeTable();
    return;
  }

  var employees = fetchEmployees();
  var currentId = sessionStorage.getItem('adminId') || '';

  if (!employees.length) {
    $('#employeeTableBody').html(
      '<tr><td colspan="5" class="text-center text-muted py-4">尚無員工資料</td></tr>'
    );
    return;
  }

  var html = employees.map(function (emp) {
    var roleLabel = emp.isSuperAdmin ? '超級管理員' : '一般員工';
    var statusBadge = emp.isActive
      ? '<span class="badge bg-success">啟用</span>'
      : '<span class="badge bg-secondary">停用</span>';

    var toggleBtn = '';
    // 自己那一列不顯示停用按鈕 / Hide toggle on current user's row
    if (emp.id !== currentId) {
      var toggleLabel = emp.isActive ? '停用' : '啟用';
      var toggleClass = emp.isActive ? 'btn-outline-warning' : 'btn-outline-success';
      toggleBtn =
        '<button type="button" class="btn btn-sm ' + toggleClass + ' btn-toggle-employee ms-1" ' +
        'data-employee-id="' + emp.id + '">' + toggleLabel + '</button>';
    }

    return '<tr data-employee-id="' + emp.id + '">' +
      '<td class="fw-semibold">' + escapeHtml(emp.displayName) + '</td>' +
      '<td>' + escapeHtml(formatEmployeeEmailCell(emp.email)) + '</td>' +
      '<td>' + roleLabel + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' +
        '<button type="button" class="btn btn-sm btn-outline-primary btn-edit-employee" ' +
        'data-employee-id="' + emp.id + '">編輯</button>' +
        toggleBtn +
      '</td>' +
      '</tr>';
  }).join('');

  $('#employeeTableBody').html(html);

  if (typeof window.applyEditPermission === 'function') {
    window.applyEditPermission('permissions', $('#contentArea'));
  }
}

/** 從正式後端載入管理員列表，失敗時顯示可重試的空狀態。 */
function renderBackendEmployeeTable() {
  $('#employeeTableBody').html(
    '<tr><td colspan="5" class="text-center text-muted py-4">載入管理員資料...</td></tr>'
  );

  Promise.all([AdminAPI.users.list(0, 100), AdminAPI.permissions.list()])
    .then(function (results) {
      backendEmployeeCache = results[0].data || [];
      backendPermissionDictionary = results[1].data || [];
      renderBackendEmployeeRows();
    })
    .catch(function (err) {
      AdminAPI.handleError(err, '管理員資料載入失敗');
      $('#employeeTableBody').html(
        '<tr><td colspan="5" class="text-center text-danger py-4">管理員資料載入失敗，重新進入本頁後再試</td></tr>'
      );
    });
}

/** 將正式管理員資料轉為既有後台表格樣式。 */
function renderBackendEmployeeRows() {
  if (!backendEmployeeCache.length) {
    $('#employeeTableBody').html(
      '<tr><td colspan="5" class="text-center text-muted py-4">尚無管理員資料</td></tr>'
    );
    return;
  }

  var currentId = sessionStorage.getItem('adminId') || '';
  var html = backendEmployeeCache.map(function (employee) {
    var statusBadge = employee.active
      ? '<span class="badge bg-success">啟用</span>'
      : '<span class="badge bg-secondary">停用</span>';
    var roleLabel = getRoleLabel(employee.role);
    var toggleButton = employee.id === currentId ? '' :
      '<button type="button" class="btn btn-sm btn-outline-warning btn-toggle-employee ms-1" ' +
      'data-employee-id="' + employee.id + '">' + (employee.active ? '停用' : '啟用') + '</button>';

    return '<tr data-employee-id="' + employee.id + '">' +
      '<td class="fw-semibold">' + escapeHtml(employee.name) + '</td>' +
      '<td>' + escapeHtml(formatEmployeeEmailCell(employee.email)) + '</td>' +
      '<td>' + roleLabel + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td><button type="button" class="btn btn-sm btn-outline-primary btn-edit-employee" ' +
        'data-employee-id="' + employee.id + '">編輯</button>' + toggleButton + '</td>' +
      '</tr>';
  }).join('');

  $('#employeeTableBody').html(html);
}

/** 開啟新增/編輯 Modal / Open add or edit employee modal */
function openEmployeeModal(employeeId) {
  if (isPermissionBackendEnabled()) {
    openBackendEmployeeModal(employeeId);
    return;
  }

  var isEdit = !!employeeId;
  var emp = isEdit ? findEmployeeById(employeeId) : null;

  $('#employeeModalLabel').text(isEdit ? '編輯員工' : '新增員工');
  $('#empDisplayName').val(isEdit ? emp.displayName : '');
  $('#empEmail').val(isEdit ? (emp.email || '') : '').prop('readonly', false);
  $('#empIsSuperAdmin').prop('checked', isEdit ? emp.isSuperAdmin : false);
  $('#employeeModal').data('edit-id', isEdit ? emp.id : '');
  setEmployeeCreatedAtDisplay(isEdit, isEdit ? emp.createdAt : null);

  renderPermissionMatrix(isEdit ? emp.permissions : getDefaultPermissions(false), isEdit ? emp.isSuperAdmin : false);

  new bootstrap.Modal('#employeeModal').show();
}

/** 取得正式管理員詳情後開啟編輯視窗。 */
function openBackendEmployeeModal(employeeId) {
  if (!employeeId) {
    fillBackendEmployeeModal(null);
    return;
  }

  AdminAPI.users.getById(employeeId)
    .then(function (result) {
      fillBackendEmployeeModal(result.data);
    })
    .catch(function (err) {
      AdminAPI.handleError(err, '管理員詳情載入失敗');
    });
}

function fillBackendEmployeeModal(employee) {
  var isEdit = !!employee;
  $('#employeeModalLabel').text(isEdit ? '編輯管理員' : '新增管理員');
  $('#empDisplayName').val(isEdit ? employee.name : '');
  $('#empEmail').val(isEdit ? employee.email : '').prop('readonly', isEdit);
  $('#empRole').val(isEdit ? employee.role : 'operator');
  $('#employeeModal').data('edit-id', isEdit ? employee.id : '');
  setEmployeeCreatedAtDisplay(isEdit, isEdit ? employee.createdAt : null);

  var permissions = getBackendPermissionMatrix(employee);
  renderPermissionMatrix(permissions, false);
  if (!isEdit) applyRolePermissionDefaults('operator');
  new bootstrap.Modal('#employeeModal').show();
}

function getBackendPermissionMatrix(employee) {
  var effective = new Set(employee && employee.effectivePermissions || []);
  var matrix = getDefaultPermissions(false);
  backendPermissionDictionary.forEach(function (permission) {
    if (!matrix[permission.section]) matrix[permission.section] = { view: false, edit: false };
    matrix[permission.section][permission.action] = effective.has(permission.code);
  });
  return matrix;
}

function applyRolePermissionDefaults(role) {
  var matrix = getDefaultPermissions(false);
  backendPermissionDictionary.forEach(function (permission) {
    if (!matrix[permission.section]) matrix[permission.section] = { view: false, edit: false };
    matrix[permission.section][permission.action] =
      (permission.defaultRoles || []).indexOf(role) !== -1;
  });
  renderPermissionMatrix(matrix, false);
}

/** 渲染 9 頁權限矩陣 / Render 9-row permission matrix */
function renderPermissionMatrix(permissions, lockAll) {
  var rows = window.ADMIN_SECTIONS.map(function (sec) {
    var perm = permissions[sec.key] || { view: false, edit: false };
    var disabledAttr = lockAll ? ' disabled' : '';
    var checkedView = lockAll || perm.view ? ' checked' : '';
    var checkedEdit = lockAll || perm.edit ? ' checked' : '';

    return '<tr>' +
      '<td>' + sec.label + '</td>' +
      '<td class="text-center">' +
        '<input type="checkbox" class="form-check-input perm-view-cb" ' +
        'data-section="' + sec.key + '"' + checkedView + disabledAttr + '>' +
      '</td>' +
      '<td class="text-center">' +
        '<input type="checkbox" class="form-check-input perm-edit-cb" ' +
        'data-section="' + sec.key + '"' + checkedEdit + disabledAttr + '>' +
      '</td>' +
      '</tr>';
  }).join('');

  $('#permissionMatrixBody').html(rows);
}

/** 超級管理員勾選時鎖定矩陣 / Lock matrix when super admin checked */
function syncPermissionMatrixLock(isSuperAdmin) {
  if (isSuperAdmin) {
    $('.perm-view-cb, .perm-edit-cb').prop('checked', true).prop('disabled', true);
  } else {
    $('.perm-view-cb, .perm-edit-cb').prop('disabled', false);
  }
}

/** 從 Modal 讀取權限 / Read permissions from modal checkboxes */
function readPermissionsFromModal(isSuperAdmin) {
  if (isSuperAdmin) {
    return getDefaultPermissions(true);
  }
  var perms = {};
  window.ADMIN_SECTIONS.forEach(function (sec) {
    perms[sec.key] = {
      view: $('.perm-view-cb[data-section="' + sec.key + '"]').is(':checked'),
      edit: $('.perm-edit-cb[data-section="' + sec.key + '"]').is(':checked'),
    };
  });
  return perms;
}

/** 儲存員工（新增或更新）/ Save employee from modal */
function saveEmployeeFromModal() {
  if (isPermissionBackendEnabled()) {
    saveBackendEmployeeFromModal();
    return;
  }

  var displayName = $('#empDisplayName').val().trim();
  var email = $('#empEmail').val().trim();
  var editId = $('#employeeModal').data('edit-id');
  var isEdit = !!editId;
  if (!displayName) {
    window.showAdminToast('請輸入顯示名稱', 'error');
    $('#empDisplayName').addClass('is-invalid');
    return;
  }
  if (!isEdit && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    window.showAdminToast('輸入有效的登入 Email', 'error');
    $('#empEmail').addClass('is-invalid');
    return;
  }
  if (isEdit && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    window.showAdminToast('輸入有效的登入 Email', 'error');
    $('#empEmail').addClass('is-invalid');
    return;
  }
  $('#empDisplayName').removeClass('is-invalid');
  $('#empEmail').removeClass('is-invalid');

  var isSuperAdmin = $('#empIsSuperAdmin').is(':checked');
  var permissions = readPermissionsFromModal(isSuperAdmin);
  var employees = fetchEmployees();
  var currentAdminId = sessionStorage.getItem('adminId') || '';

  if (isEdit) {
    var idx = employees.findIndex(function (e) { return e.id === editId; });
    if (idx === -1) {
      window.showAdminToast('找不到員工資料', 'error');
      return;
    }

    var updated = Object.assign({}, employees[idx], {
      displayName: displayName,
      email: email,
      isSuperAdmin: isSuperAdmin,
      permissions: permissions,
    });

    if (employees[idx].isSuperAdmin && !isSuperAdmin) {
      var check = canRemoveSuperAdminStatus(employees[idx], employees);
      if (!check.ok) {
        window.showAdminToast(check.message, 'error');
        return;
      }
    }

    employees[idx] = updated;
    saveEmployees(employees);
    renderEmployeeTable();

    // 若編輯的是自己，同步更新 sessionStorage
    if (editId === currentAdminId) {
      sessionStorage.setItem('adminName', displayName);
      sessionStorage.setItem('isSuperAdmin', String(isSuperAdmin));
      sessionStorage.setItem('adminPermissions', JSON.stringify(permissions));
      $('#sidebarAdminName').text(displayName);
      $('#topbarAdminName').html('<i class="fas fa-user me-2"></i>' + displayName);
      if (typeof window.applySidebarPermissions === 'function') {
        window.applySidebarPermissions();
      }
    }

    bootstrap.Modal.getInstance(document.getElementById('employeeModal')).hide();
    window.showAdminToast('員工資料已更新');
    return;
  }

  // 新增員工
  var newEmp = {
    id: getNextEmployeeId(employees),
    displayName: displayName,
    email: email,
    isSuperAdmin: isSuperAdmin,
    isActive: true,
    createdAt: new Date().toISOString().slice(0, 10),
    permissions: permissions,
  };
  employees.push(newEmp);
  saveEmployees(employees);
  renderEmployeeTable();
  bootstrap.Modal.getInstance(document.getElementById('employeeModal')).hide();
  window.showAdminToast('員工已新增');
}

/** 將帳號欄位與權限覆寫分成兩個正式 API 操作。 */
function saveBackendEmployeeFromModal() {
  var name = $('#empDisplayName').val().trim();
  var email = $('#empEmail').val().trim();
  var role = $('#empRole').val();
  var editId = $('#employeeModal').data('edit-id');
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    $('#empDisplayName').toggleClass('is-invalid', !name);
    $('#empEmail').toggleClass('is-invalid', !email);
    window.showAdminToast('輸入姓名與有效的登入 Email', 'error');
    return;
  }

  var accountRequest = editId
    ? AdminAPI.users.update(editId, { name: name, role: role })
    : AdminAPI.users.create({ name: name, email: email, role: role });

  $('#saveEmployeeBtn').prop('disabled', true);
  var savedAdminUserId = '';
  accountRequest
    .then(function (result) {
      var adminUserId = editId || result.data.id;
      savedAdminUserId = adminUserId;
      return AdminAPI.users.updatePermissions(adminUserId, readBackendPermissionCodes());
    })
    .then(function () {
      if (savedAdminUserId === (sessionStorage.getItem('adminId') || '') && window.AdminRuntime) {
        return window.AdminRuntime.refreshBackendSession({ forceRefresh: false });
      }
      return null;
    })
    .then(function () {
      bootstrap.Modal.getInstance(document.getElementById('employeeModal')).hide();
      window.showAdminToast(editId ? '管理員資料已更新' : '管理員已建立');
      if (savedAdminUserId === (sessionStorage.getItem('adminId') || '')) {
        window.location.reload();
        return;
      }
      renderEmployeeTable();
    })
    .catch(function (err) {
      AdminAPI.handleError(err, '管理員資料儲存失敗');
    })
    .finally(function () {
      $('#saveEmployeeBtn').prop('disabled', false);
    });
}

function readBackendPermissionCodes() {
  var permissions = {};
  backendPermissionDictionary.forEach(function (permission) {
    permissions[permission.code] = $('.perm-' + permission.action + '-cb[data-section="' +
      permission.section + '"]').is(':checked');
  });
  return permissions;
}

/** 停用或啟用員工 / Toggle employee active status */
function toggleEmployeeStatus(employeeId) {
  if (isPermissionBackendEnabled()) {
    var target = backendEmployeeCache.find(function (employee) { return employee.id === employeeId; });
    if (!target) return;
    AdminAPI.users.update(employeeId, { active: !target.active })
      .then(function () {
        window.showAdminToast(target.active ? '管理員已停用' : '管理員已啟用');
        renderEmployeeTable();
      })
      .catch(function (err) {
        AdminAPI.handleError(err, '管理員狀態更新失敗');
      });
    return;
  }

  var employees = fetchEmployees();
  var idx = employees.findIndex(function (e) { return e.id === employeeId; });
  if (idx === -1) return;

  var target = employees[idx];
  var currentAdminId = sessionStorage.getItem('adminId') || '';

  if (target.isActive) {
    var deactivateCheck = canDeactivateEmployee(target, currentAdminId);
    if (!deactivateCheck.ok) {
      window.showAdminToast(deactivateCheck.message, 'error');
      return;
    }
    employees[idx].isActive = false;
    window.showAdminToast('員工 ' + target.displayName + ' 已停用');
  } else {
    employees[idx].isActive = true;
    window.showAdminToast('員工 ' + target.displayName + ' 已啟用');
  }

  saveEmployees(employees);
  renderEmployeeTable();

  if (typeof window.applyEditPermission === 'function') {
    window.applyEditPermission('permissions', $('#contentArea'));
  }
}

function resetEmployeeModal() {
  $('#empDisplayName').removeClass('is-invalid');
  $('#empEmail').removeClass('is-invalid').prop('readonly', false);
  $('#employeeModal').removeData('edit-id');
  setEmployeeCreatedAtDisplay(false, null);
}

/** 編輯 Modal 顯示建立日期；新增時隱藏。 */
function setEmployeeCreatedAtDisplay(isEdit, createdAt) {
  if (isEdit) {
    $('#empCreatedAtGroup').removeClass('d-none');
    $('#empCreatedAtDisplay').val(formatAdminUserCreatedDate(createdAt));
    return;
  }
  $('#empCreatedAtGroup').addClass('d-none');
  $('#empCreatedAtDisplay').val('');
}

/** 管理員建立時間（僅日期 YYYY-MM-DD）。 */
function formatAdminUserCreatedDate(value) {
  if (!value) {
    return '—';
  }
  var raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }
  var date = new Date(raw);
  if (isNaN(date.getTime())) {
    return '—';
  }
  return date.toISOString().slice(0, 10);
}

/** 列表 Email 欄缺值時顯示 —。 */
function formatEmployeeEmailCell(email) {
  var trimmed = String(email || '').trim();
  return trimmed || '—';
}

function getRoleLabel(role) {
  if (role === 'admin') return '系統管理員';
  if (role === 'warehouse') return '倉儲人員';
  return '營運人員';
}

/** 簡單 HTML 跳脫 / Escape HTML for display */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
