/**
 * admin/js/movement.js
 * 庫存異動紀錄模組
 * 後端讀取 P5 inventory_movement_items_view 組成的 DTO；JSON 僅為唯讀 fallback。
 *
 * 功能：
 *   - 期間篩選：近 7/30 天、本月、近 3 個月、自定義（flatpickr）
 *   - 欄位排序（可疊加）：異動日期
 *   - 多選篩選（可疊加）：負責員工 ID
 *   - 方案 B：列表不顯示異動性質；詳情列性質可下拉改（lineNature）；產單帶 from／to 推導預設；lineReason UI＝備註
 *
 * 使用 jQuery Event Namespace (.movement) 防止重複導覽時事件堆疊
 */

window.generatedMovementRecords = window.generatedMovementRecords || [];
window.movementBaseLoaded = false;
window.movementLoadedMode = window.movementLoadedMode || null;

// Backend 模式的庫位與規格選項，送出時只使用正式 ID。
var adminMovementLookups = { locations: [], variants: [] };

var MOVEMENT_TYPE_LABELS = {
  receipt: '進貨',
  write_off: '損耗',
  transfer: '調撥',
  product_stock_update: '商品庫存調整'
};

var MOVEMENT_STATUS_LABELS = {
  draft: '草稿',
  posted: '已過帳',
  cancelled: '已作廢'
};

/** 商城庫位 ID → 顯示名（與 products.js 固定分店對齊） */
var STORE_MOVEMENT_LOCATION_LABELS = {
  main: '商店主倉',
  'branch-001': '台北旗艦店',
  'branch-002': '台中中港店',
  'branch-003': '高雄左營店'
};

/** 把 locationId／名稱轉成明細顯示文字；空值顯示 --- */
function formatMovementLocationLabel(locationId, locationName) {
  if (locationName) {
    return locationName;
  }
  if (locationId == null || locationId === '') {
    return '---';
  }
  return STORE_MOVEMENT_LOCATION_LABELS[locationId] || String(locationId);
}

/**
 * 判斷庫位顯示值是否為「空／---」（方案 A 推導用）。
 * True when location is empty or the UI null marker.
 */
function isEmptyMovementLocationDisplay(value) {
  if (value == null) {
    return true;
  }
  var text = String(value).trim();
  return text === '' || text === '---' || text === '—' || text === '-' || text === '進貨';
}

/**
 * 依列級 from／to 推導異動性質標籤（產單預設用；之後可手動改）。
 * Derive default line nature: 進貨／移轉／損耗（盤點／折損僅手動選）。
 *
 * --- → 店＝進貨；店 → 店＝移轉；店 → ---＝損耗
 */
function deriveLineNatureLabel(item) {
  if (!item) {
    return '—';
  }
  var fromValue = item.sourceLocationId != null && item.sourceLocationId !== ''
    ? item.sourceLocationId
    : item.fromStore;
  var toValue = item.destinationLocationId != null && item.destinationLocationId !== ''
    ? item.destinationLocationId
    : item.toStore;
  var fromEmpty = isEmptyMovementLocationDisplay(fromValue);
  var toEmpty = isEmptyMovementLocationDisplay(toValue);

  if (fromEmpty && !toEmpty) {
    return '進貨';
  }
  if (!fromEmpty && toEmpty) {
    return '損耗';
  }
  if (!fromEmpty && !toEmpty) {
    return '移轉';
  }
  return '—';
}

/** 列級異動性質：API code → UI 中文 */
var LINE_NATURE_LABELS = {
  receipt: '進貨',
  transfer: '移轉',
  stocktake: '盤點',
  damage: '折損',
  write_off: '損耗'
};

var LINE_NATURE_CODES = ['receipt', 'transfer', 'stocktake', 'damage', 'write_off'];

/** 中文／code → API lineNature code */
function toLineNatureCode(value) {
  if (!value) {
    return null;
  }
  var text = String(value).trim();
  if (LINE_NATURE_CODES.indexOf(text) !== -1) {
    return text;
  }
  var found = Object.keys(LINE_NATURE_LABELS).find(function (code) {
    return LINE_NATURE_LABELS[code] === text;
  });
  return found || null;
}

/** API code／舊 type → 顯示中文 */
function toLineNatureLabel(value) {
  if (!value) {
    return '—';
  }
  var code = toLineNatureCode(value);
  if (code) {
    return LINE_NATURE_LABELS[code];
  }
  return String(value);
}

/** 判斷庫存異動頁是否使用正式後端。 */
function isAdminMovementBackendEnabled() {
  return typeof AdminAPI !== 'undefined' &&
    AdminAPI.isBackendEnabled &&
    AdminAPI.isBackendEnabled();
}

/** Backend 模式：異動頁唯讀（ADM-W2-08）；隱藏建立草稿／過帳／作廢。 */
function syncBackendMovementUi() {
  var useBackend = isAdminMovementBackendEnabled();
  // 舊「建立草稿」按鈕改為永遠隱藏（商品頁才產 product_stock_update）
  $('#openMovementDraftModal').addClass('d-none');
  $('.backend-movement-write-action').toggleClass('d-none', true);
  $('.backend-movement-action').toggleClass('d-none', !useBackend);
}

/**
 * 排序堆疊：依點擊時間順序排列
 * 初始值設為日期降冪（最新異動在最上面）
 */
var movementSortStack = [{ key: 'createdAt', dir: 'desc' }];

/**
 * 日期篩選 UI 狀態（對齊 orders.js orderDateState）
 */
var movementDateState = { days: 30, startDate: null, endDate: null };

/**
 * 篩選條件：各欄位目前勾選的值
 * 空陣列 = 不篩選（顯示全部）
 * dateStart / dateEnd 為 YYYY-MM-DD 字串，null = 不限制
 */
var movementFilterState = {
  employeeId:   [],   // e.g. ['01', '02']
  movementType: [],   // e.g. ['進貨', '損耗']
  dateStart:    null,
  dateEnd:      null
};

/** 取得異動時間（支援舊欄位 date）/ Get movement timestamp string */
function getMovementCreatedAt(record) {
  // 優先 camelCase；相容舊 created_at / date
  return (record && (record.createdAt || record.created_at || record.date)) || '';
}

/**
 * 畫面短號：轉換配對用 CVT-{conversionId}；其餘用 MOV-{id}（補零 3 位）。
 * Display code: CVT-xxx for conversion pair, else MOV-xxx.
 */
function formatAdminMovementDisplayNo(record) {
  if (record && record.conversionId != null && record.conversionId !== '') {
    if (typeof window.formatConversionId === 'function') {
      return window.formatConversionId(record.conversionId);
    }
    return 'CVT-' + String(record.conversionId).padStart(3, '0');
  }
  var id = record && record.id;
  if (typeof window.formatMovementId === 'function') {
    return window.formatMovementId(id);
  }
  return 'MOV-' + String(id || '').padStart(3, '0');
}

/**
 * 明細「異動時間」：台北時區 yyyy-MM-dd HH:mm
 * Detail datetime in Asia/Taipei.
 */
function formatMovementDateTimeDisplay(value) {
  if (!value) {
    return '—';
  }
  var date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) {
    // 已是本地字串時取前 16 碼（去掉秒）
    var raw = String(value).replace('T', ' ');
    return raw.length >= 16 ? raw.slice(0, 16) : raw;
  }
  try {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(date);
    var map = {};
    parts.forEach(function (part) {
      map[part.type] = part.value;
    });
    return map.year + '-' + map.month + '-' + map.day + ' ' + map.hour + ':' + map.minute;
  } catch (err) {
    return String(value);
  }
}

window.initMovement = function () {
  // 清除 orders / movement 舊事件（共用 .sortable-th / .filter-icon 選擇器）
  $(document).off('.orders');
  $(document).off('.movement');

  // 每次進入頁面重置排序與篩選（預設：日期降冪 + 近 30 天）
  movementSortStack = [{ key: 'createdAt', dir: 'desc' }];
  movementFilterState = { employeeId: [], movementType: [], dateStart: null, dateEnd: null };
  movementDateState = { days: 30, startDate: null, endDate: null };

  var currentMode = isAdminMovementBackendEnabled() ? 'backend' : 'mock';
  // ADM-W2-08：每次進異動頁都重抓列表（商品頁產單後切回來才能看到新稽核單）
  // Always refetch on enter so newly created product_stock_update rows appear.
  window.movementBaseLoaded = false;
  window.movementCache = [];
  window.movementLoadedMode = currentMode;

  syncBackendMovementUi();
  if (currentMode === 'backend') {
    loadBackendMovementLookups();
  }
  if (typeof window.applyEditPermission === 'function') {
    window.applyEditPermission('movement', $('#contentArea'));
  }

  setupMovementPeriodFilter();
  initMovementFlatpickr();
  applyMovementDayRange(30);

  loadAdminJsonResource({
    adminList: AdminAPI && AdminAPI.movement && AdminAPI.movement.list,
    jsonPath: MockDataPaths.movement,
    emptyValue: [],
    errorMessage: '載入庫存異動失敗',
    onSuccess: function (records) {
      window.movementCache = mergeMovementRecords(
        window.generatedMovementRecords,
        (records || []).map(function (record) {
          return normalizeMovementRecord(adaptLegacyMovementRecord(record && (record.payload || record)));
        }).filter(function (record) {
          // M1 後備：即使 API 仍回 conversion_in 也不顯示（後端列表已排除）
          return record.movementType !== 'conversion_in';
        })
      );
      window.movementBaseLoaded = true;
      window.movementLoadedMode = currentMode;
      populateEmployeeFilterOptions(window.movementCache);
      applyMovementFiltersAndSort();
    },
    onError: function () {
      $('#movementTableBody').html(
        '<tr><td colspan="4" class="text-center text-danger py-4">' +
        '<i class="fas fa-exclamation-triangle me-2"></i>載入庫存異動紀錄失敗' +
        '</td></tr>'
      );
    }
  });

  // ── 排序：點擊 .sortable-th 標頭（三段式：無 → asc → desc → 移除） ──
  $(document).on('click.movement', '#movementTable .sortable-th', function () {
    var key = $(this).data('sort-key');
    var idx = movementSortStack.findIndex(function (s) { return s.key === key; });

    if (idx === -1) {
      movementSortStack.push({ key: key, dir: 'asc' });
    } else if (movementSortStack[idx].dir === 'asc') {
      movementSortStack[idx].dir = 'desc';
    } else {
      movementSortStack.splice(idx, 1);
    }

    applyMovementFiltersAndSort();
  });

  // ── 篩選 Dropdown 開關：點擊漏斗 icon ──
  $(document).on('click.movement', '#movementTable .filter-icon', function (e) {
    e.stopPropagation();
    var $th = $(this).closest('.filter-th');
    var $dropdown = $th.find('.filter-dropdown');

    $('#movementTable .filter-dropdown').not($dropdown).addClass('d-none');
    $dropdown.toggleClass('d-none');
  });

  // 點擊 Dropdown 內部時阻止冒泡關閉
  $(document).on('click.movement', '#movementTable .filter-dropdown', function (e) {
    e.stopPropagation();
  });

  // 點擊頁面其他地方 → 關閉所有 Dropdown
  $(document).on('click.movement', function () {
    $('#movementTable .filter-dropdown').addClass('d-none');
  });

  // ── 篩選 checkbox 勾選/取消 ──
  $(document).on('change.movement', '#movementTable .filter-dropdown input[type="checkbox"]', function () {
    var $th = $(this).closest('.filter-th');
    var key = $th.data('filter-key');

    var selected = [];
    $th.find('input[type="checkbox"]:checked').each(function () {
      selected.push($(this).val());
    });

    movementFilterState[key] = selected;
    applyMovementFiltersAndSort();
  });

  // ── 清除條件按鈕：還原預設排序 + 清空欄位篩選 + 還原近 30 天 ──
  $(document).on('click.movement', '#btnClearMovementSort', function () {
    movementSortStack = [{ key: 'createdAt', dir: 'desc' }];
    movementFilterState.employeeId = [];
    movementFilterState.movementType = [];
    applyMovementDayRange(30);
  });

  // ── 點擊異動 ID → 開啟明細 Modal ──
  $(document).on('click.movement', '.movement-detail-link', function () {
    var movementId = $(this).data('movement-id');
    var record = (window.movementCache || []).find(function (item) {
      return window.sameId(item.id, movementId);
    });

    if (record) {
      showMovementDetailModal(record);
    }
  });

  // 開啟正式庫存異動草稿表單。
  $(document).on('click.movement', '#openMovementDraftModal', function () {
    resetMovementDraftForm();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('movementDraftModal')).show();
  });

  $(document).on('change.movement', '#movementDomain, #movementType', function () {
    renderMovementLocationOptions();
    renderMovementDraftRows();
    syncMovementLocationFields();
  });

  $(document).on('click.movement', '#addMovementDraftRow', function () {
    appendMovementDraftRow();
  });

  $(document).on('click.movement', '.remove-movement-draft-row', function () {
    $(this).closest('.movement-draft-row').remove();
    if (!$('#movementDraftRows .movement-draft-row').length) {
      appendMovementDraftRow();
    }
  });

  $(document).on('submit.movement', '#movementDraftForm', function (event) {
    event.preventDefault();
    submitMovementDraftForm();
  });

  $(document).on('click.movement', '#addDraftMovementItem', function () {
    addItemToOpenMovementDraft();
  });

  $(document).on('click.movement', '#postMovementDraft', function () {
    changeOpenMovementStatus('post');
  });

  $(document).on('click.movement', '#cancelMovementDraft', function () {
    changeOpenMovementStatus('cancel');
  });

  // ADM-W2-08：詳情可改表頭 reason／列 lineReason（draft／posted）
  $(document).on('click.movement', '#btnSaveMovementReason', function () {
    saveOpenMovementReason();
  });

  $(document).on('click.movement', '.btn-save-movement-line-reason', function () {
    var itemId = $(this).data('item-id');
    saveOpenMovementLineReason(itemId);
  });

  // 方案 B：詳情列異動性質下拉一改就 PATCH（不改 from／to）
  $(document).on('change.movement', '.movement-line-nature-select', function () {
    var itemId = $(this).data('item-id');
    var lineNature = String($(this).val() || '').trim();
    saveOpenMovementLineNature(itemId, lineNature);
  });
};

window.addMovementRecord = function (record) {
  if (isAdminMovementBackendEnabled()) {
    // 正式模式改由商品頁「產生異動紀錄」一鍵 create＋post；此處不再導向異動頁建草稿
    window.showAdminToast('請在商品頁使用「產生異動紀錄」建立稽核單', 'info');
    return;
  }
  var normalizedRecord = normalizeMovementRecord(record);

  window.generatedMovementRecords = window.generatedMovementRecords || [];
  window.generatedMovementRecords.unshift(normalizedRecord);

  if (Array.isArray(window.movementCache)) {
    window.movementCache.unshift(normalizedRecord);
  }

  if (typeof AdminAPI !== 'undefined' && AdminAPI.movement) {
    AdminAPI.movement.create(normalizedRecord).catch(function (err) {
      AdminAPI.handleError(err, '同步庫存異動紀錄失敗');
    });
  }

  if ($('#movementTableBody').length > 0) {
    populateEmployeeFilterOptions(window.movementCache || window.generatedMovementRecords);
    applyMovementFiltersAndSort();
  }
};

function mergeMovementRecords(generatedRecords, baseRecords) {
  var merged = [];
  var idMap = {};

  (generatedRecords || []).concat(baseRecords || []).forEach(function (record) {
    var normalizedRecord = normalizeMovementRecord(record);

    if (!idMap[normalizedRecord.id]) {
      merged.push(normalizedRecord);
      idMap[normalizedRecord.id] = true;
    }
  });

  return merged;
}

/**
 * 產生下一筆庫存異動編號（純數字，顯示時用 formatMovementId）
 * Generate next movement record ID as numeric PK.
 */
function createMovementRecordId() {
  var existingRecords = [];

  if (Array.isArray(window.movementCache)) {
    existingRecords = existingRecords.concat(window.movementCache);
  }

  if (Array.isArray(window.generatedMovementRecords)) {
    existingRecords = existingRecords.concat(window.generatedMovementRecords);
  }

  return window.getNextMovementId(existingRecords);
}

/** 格式化為 YYYY-MM-DD HH:mm:ss / Format datetime for movement records */
function formatMovementDateTime(date) {
  var pad = function (num) {
    return String(num).padStart(2, '0');
  };
  return date.getFullYear() + '-' +
    pad(date.getMonth() + 1) + '-' +
    pad(date.getDate()) + ' ' +
    pad(date.getHours()) + ':' +
    pad(date.getMinutes()) + ':' +
    pad(date.getSeconds());
}

window.createMovementRecordId = createMovementRecordId;

function normalizeMovementRecord(record) {
  var items = Array.isArray(record && record.items)
    ? record.items
    : [{
      productName: record && record.productName,
      quantity: record && record.quantity,
      fromStore: record && record.fromStore,
      toStore: record && record.toStore,
      type: record && record.type
    }];

  var movementId = (record && record.id) || createMovementRecordId();
  return {
    id: movementId,
    movementNo: record && record.movementNo,
    displayNo: null, // 開啟時用 formatAdminMovementDisplayNo 計算
    inventoryDomain: (record && record.inventoryDomain) || 'legacy',
    movementType: record && record.movementType,
    status: (record && record.status) || 'posted',
    sourceLocationId: record && record.sourceLocationId,
    sourceLocationName: record && record.sourceLocationName,
    destinationLocationId: record && record.destinationLocationId,
    destinationLocationName: record && record.destinationLocationName,
    reason: (record && record.reason) || '',
    postedAt: record && record.postedAt,
    conversionId: record && record.conversionId != null ? record.conversionId : null,
    pairedMovementId: record && record.pairedMovementId != null ? record.pairedMovementId : null,
    // 權威欄位 camelCase；保留 created_at 一版相容讀取（getMovementCreatedAt 已 fallback）
    createdAt: (record && record.occurredAt) || getMovementCreatedAt(record) || formatMovementDateTime(new Date()),
    employeeId: (record && (record.employeeId || record.adminId || record.staffId)) || '—',
    employeeName: record && record.employeeName,
    items: items.map(function (item) {
      // 列級庫位優先；沒有則退回表頭（conversion_in 明細常只有表頭目的庫位）
      var fromLabel = formatMovementLocationLabel(
        (item && item.sourceLocationId) || (record && record.sourceLocationId),
        item && (item.fromStore || item.sourceLocationName)
          || (record && record.sourceLocationName)
      );
      // 若舊 mock 用「進貨」當 fromStore，保留語意；正式 API 空值已是 ---
      if (item && item.fromStore === '進貨') {
        fromLabel = '---';
      }
      var toLabel = formatMovementLocationLabel(
        (item && item.destinationLocationId) || (record && record.destinationLocationId),
        item && (item.toStore || item.destinationLocationName)
          || (record && record.destinationLocationName)
      );
      if (item && (item.toStore === '—' || item.toStore === '-')) {
        toLabel = '---';
      }
      return {
        id: (item && item.id) || null,
        // 轉換合併明細時 PATCH 要用「該列所屬」的 movementId
        movementId: (item && item.movementId) || movementId,
        inventoryDomain: (item && item.inventoryDomain) || (record && record.inventoryDomain) || 'legacy',
        variantId: (item && item.variantId) || null,
        sku: (item && item.sku) || null,
        productName: (item && item.productName) || '未命名商品',
        quantity: parseInt(item && item.quantity, 10) || 0,
        sourceLocationId: item && item.sourceLocationId,
        destinationLocationId: item && item.destinationLocationId,
        fromStore: fromLabel,
        toStore: toLabel,
        lineReason: (item && item.lineReason) || '',
        // 方案 B：優先用已存 lineNature；沒有才用 from／to 推導預設
        lineNature: (function () {
          var stored = item && item.lineNature;
          if (stored) {
            return toLineNatureCode(stored);
          }
          var fromType = item && item.type ? toLineNatureCode(item.type) : null;
          if (fromType) {
            return fromType;
          }
          return toLineNatureCode(deriveLineNatureLabel({
            sourceLocationId: item && item.sourceLocationId,
            destinationLocationId: item && item.destinationLocationId,
            fromStore: fromLabel,
            toStore: toLabel
          }));
        })(),
        type: (function () {
          var stored = item && item.lineNature;
          if (stored) {
            return toLineNatureLabel(stored);
          }
          var fromType = item && item.type ? toLineNatureCode(item.type) : null;
          if (fromType) {
            return toLineNatureLabel(fromType);
          }
          return deriveLineNatureLabel({
            sourceLocationId: item && item.sourceLocationId,
            destinationLocationId: item && item.destinationLocationId,
            fromStore: fromLabel,
            toStore: toLabel
          });
        })()
      };
    })
  };
}

/**
 * Isolate the pre-P5 JSON shape behind a read-only adapter. It deliberately
 * does not invent a variant identity from legacy productId.
 */
function adaptLegacyMovementRecord(record) {
  if (!record || record.inventoryDomain || record.movementNo) return record;
  return {
    id: record.id,
    legacyMovementId: String(record.id || ''),
    inventoryDomain: 'legacy',
    createdAt: getMovementCreatedAt(record),
    employeeId: record.employeeId || record.adminId || record.staffId,
    items: (record.items || []).map(function (item) {
      return {
        inventoryDomain: 'legacy',
        variantId: null,
        sku: null,
        productName: item.productName,
        quantity: item.quantity,
        fromStore: item.fromStore,
        toStore: item.toStore,
        type: item.type
      };
    })
  };
}

/**
 * 取得一筆紀錄所有不重複的異動性質（供篩選使用）
 * Get unique movement types from a record's items array.
 */
function getRecordMovementTypes(record) {
  var types = {};
  (record.items || []).forEach(function (item) {
    types[item.type || '—'] = true;
  });
  return Object.keys(types);
}

/**
 * 從 items 陣列摘要顯示「異動性質」（取各 item type 的唯一值集合）。
 * 若有多種 type，用頓號連接。
 */
function summarizeMovementTypes(items) {
  var types = {};
  (items || []).forEach(function (item) {
    var t = item.type || '—';
    types[t] = true;
  });
  var keys = Object.keys(types);
  return keys.length > 0 ? keys.join('、') : '—';
}

/**
 * 依資料動態產生「負責員工 ID」篩選選項
 * Dynamically build employee ID filter checkboxes from cache.
 */
function populateEmployeeFilterOptions(records) {
  // value 仍用 employeeId；畫面顯示員工名字
  var byId = {};
  (records || []).forEach(function (record) {
    var id = record.employeeId;
    if (id && id !== '—') {
      byId[id] = record.employeeName || id;
    }
  });

  var html = Object.keys(byId).sort().map(function (id) {
    return '<label><input type="checkbox" value="' + escapeMovementHtml(id) + '"> ' +
      escapeMovementHtml(byId[id]) + '</label>';
  }).join('');

  var $dropdown = $('#movementTable .filter-th[data-filter-key="employeeId"] .filter-dropdown');
  if (!$dropdown.length) return;

  $dropdown.html(
    html || '<span class="text-muted small px-2">尚無員工資料</span>'
  );
}

// ─────────────────────────────────────────────
// 日期篩選器（邏輯對齊 orders.js）
// ─────────────────────────────────────────────

function fmtMovementDateISO(d) {
  if (!d) return null;
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function applyMovementDayRange(days) {
  if (days === 'all') {
    movementDateState.days      = 'all';
    movementDateState.startDate = null;
    movementDateState.endDate   = null;
    movementFilterState.dateStart = null;
    movementFilterState.dateEnd   = null;
  } else if (days === 'month') {
    var now   = new Date();
    var start = new Date(now.getFullYear(), now.getMonth(), 1);
    movementDateState.days      = 'month';
    movementDateState.startDate = start;
    movementDateState.endDate   = new Date(now);
    movementFilterState.dateStart = fmtMovementDateISO(start);
    movementFilterState.dateEnd   = fmtMovementDateISO(new Date(now));
  } else {
    var now   = new Date();
    var start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
    movementDateState.days      = days;
    movementDateState.startDate = start;
    movementDateState.endDate   = new Date(now);
    movementFilterState.dateStart = fmtMovementDateISO(start);
    movementFilterState.dateEnd   = fmtMovementDateISO(new Date(now));
  }

  if (days !== 'custom') {
    $('#movementDateRangePicker').hide();
  }
  updateMovementPeriodLabel();
  applyMovementFiltersAndSort();
}

function applyMovementCustomRange(dateStart, dateEnd) {
  movementDateState.days      = 'custom';
  movementDateState.startDate = dateStart ? new Date(dateStart + 'T00:00:00') : null;
  movementDateState.endDate   = dateEnd   ? new Date(dateEnd   + 'T00:00:00') : null;
  movementFilterState.dateStart = dateStart || null;
  movementFilterState.dateEnd   = dateEnd   || null;
  updateMovementPeriodLabel();
  applyMovementFiltersAndSort();

  var pickerEl = document.querySelector('#movementDateRangePicker');
  if (pickerEl && pickerEl._flatpickr && movementDateState.startDate && movementDateState.endDate) {
    pickerEl._flatpickr.setDate(
      [movementDateState.startDate, movementDateState.endDate],
      false
    );
  }
  $('#movementDateRangePicker').show();
}

function updateMovementPeriodLabel() {
  var days = movementDateState.days;

  $('#movementPeriodBtns button').removeClass('active');
  if (days !== 'all') {
    $('#movementPeriodBtns button[data-days="' + days + '"]').addClass('active');
  }

  var $label = $('#movementPeriodLabel');

  if (days === 'custom') {
    $label.addClass('d-none').text('');
    return;
  }

  $label.removeClass('d-none');

  if (days === 'all') {
    $label.text('全部期間');
  } else if (movementDateState.startDate && movementDateState.endDate) {
    $label.text(
      fmtMovementDateISO(movementDateState.startDate) + ' 至 ' +
      fmtMovementDateISO(movementDateState.endDate)
    );
  } else {
    $label.text('');
  }
}

function enterMovementCustomMode() {
  movementDateState.days = 'custom';
  updateMovementPeriodLabel();

  var pickerEl = document.querySelector('#movementDateRangePicker');
  if (pickerEl && pickerEl._flatpickr && movementDateState.startDate && movementDateState.endDate) {
    pickerEl._flatpickr.setDate(
      [movementDateState.startDate, movementDateState.endDate],
      false
    );
  }

  $('#movementDateRangePicker').show().trigger('click');
}

function initMovementFlatpickr() {
  if (typeof flatpickr === 'undefined') return;

  var locale = (flatpickr.l10ns && flatpickr.l10ns.zh_tw)
    ? flatpickr.l10ns.zh_tw
    : 'default';

  flatpickr('#movementDateRangePicker', {
    mode: 'range',
    dateFormat: 'Y-m-d',
    locale: locale,
    onClose: function (selectedDates) {
      if (selectedDates.length === 2) {
        applyMovementCustomRange(
          fmtMovementDateISO(selectedDates[0]),
          fmtMovementDateISO(selectedDates[1])
        );
      }
    }
  });
}

function setupMovementPeriodFilter() {
  $(document).on('click.movement', '#movementPeriodBtns button[data-days]', function () {
    var days = $(this).data('days');

    if (days === 'custom') {
      enterMovementCustomMode();
    } else if (days === 'month') {
      if ($(this).hasClass('active')) {
        applyMovementDayRange('all');
      } else {
        applyMovementDayRange('month');
      }
    } else if ($(this).hasClass('active')) {
      applyMovementDayRange('all');
    } else {
      applyMovementDayRange(parseInt(days, 10));
    }
  });
}

/**
 * 依 movementFilterState 篩選、依 movementSortStack 排序，再重新渲染表格
 * Filter → sort → render pipeline (same pattern as orders.js)
 */
function applyMovementFiltersAndSort() {
  var data = (window.movementCache || []).slice();

  // ── Step 1：篩選（欄位之間 AND，同欄多選 OR） ──

  if (movementFilterState.employeeId.length > 0) {
    data = data.filter(function (record) {
      return movementFilterState.employeeId.indexOf(record.employeeId) !== -1;
    });
  }

  if (movementFilterState.movementType.length > 0) {
    data = data.filter(function (record) {
      var types = getRecordMovementTypes(record);
      return types.some(function (type) {
        return movementFilterState.movementType.indexOf(type) !== -1;
      });
    });
  }

  // 日期範圍篩選（比對 created_at 的日期部分）
  if (movementFilterState.dateStart) {
    data = data.filter(function (record) {
      return getMovementCreatedAt(record).slice(0, 10) >= movementFilterState.dateStart;
    });
  }
  if (movementFilterState.dateEnd) {
    data = data.filter(function (record) {
      return getMovementCreatedAt(record).slice(0, 10) <= movementFilterState.dateEnd;
    });
  }

  // ── Step 2：排序（多鍵穩定排序） ──
  if (movementSortStack.length > 0) {
    data.sort(function (a, b) {
      for (var i = 0; i < movementSortStack.length; i++) {
        var key = movementSortStack[i].key;
        var dir = movementSortStack[i].dir === 'asc' ? 1 : -1;
        var valA = key === 'createdAt' || key === 'created_at' ? getMovementCreatedAt(a) : (a[key] || '');
        var valB = key === 'createdAt' || key === 'created_at' ? getMovementCreatedAt(b) : (b[key] || '');
        if (valA < valB) return -1 * dir;
        if (valA > valB) return  1 * dir;
      }
      return (b.id - a.id);
    });
  }

  // ── Step 3：渲染 + 更新 UI ──
  renderMovementTable(data);
  updateMovementSortUI();
  updateMovementFilterUI();
}

/**
 * 依 movementSortStack 更新欄位標頭箭頭 icon 與「清除條件」按鈕
 */
function updateMovementSortUI() {
  $('#movementTable .sort-icon')
    .removeClass('fa-sort-up fa-sort-down sort-active')
    .addClass('fa-sort');

  movementSortStack.forEach(function (s) {
    var $icon = $('#movementTable .sortable-th[data-sort-key="' + s.key + '"] .sort-icon');
    $icon
      .removeClass('fa-sort')
      .addClass(s.dir === 'asc' ? 'fa-sort-up' : 'fa-sort-down')
      .addClass('sort-active');
  });

  var isDefaultSort = (
    movementSortStack.length === 1 &&
    movementSortStack[0].key === 'createdAt' &&
    movementSortStack[0].dir === 'desc'
  );

  var hasActiveFilter = (
    movementFilterState.employeeId.length > 0 ||
    movementFilterState.movementType.length > 0
  );

  var isDefaultDate = movementDateState.days === 30;

  if (!isDefaultSort || hasActiveFilter || !isDefaultDate) {
    $('#btnClearMovementSort').removeClass('d-none');
  } else {
    $('#btnClearMovementSort').addClass('d-none');
  }
}

/**
 * 依 movementFilterState 更新漏斗 icon 顏色、紅點與 checkbox 勾選狀態
 */
function updateMovementFilterUI() {
  ['employeeId', 'movementType'].forEach(function (key) {
    var $th   = $('#movementTable .filter-th[data-filter-key="' + key + '"]');
    var $icon = $th.find('.filter-icon');
    var $dot  = $th.find('.filter-dot');

    if (movementFilterState[key].length > 0) {
      $icon.addClass('active');
      $dot.removeClass('d-none');
      $th.find('input[type="checkbox"]').each(function () {
        $(this).prop('checked', movementFilterState[key].indexOf($(this).val()) !== -1);
      });
    } else {
      $icon.removeClass('active');
      $dot.addClass('d-none');
      $th.find('input[type="checkbox"]').prop('checked', false);
    }
  });
}

function renderMovementTable(records) {
  if (!records || records.length === 0) {
    $('#movementTableBody').html(
      '<tr><td colspan="4" class="text-center text-muted py-4">目前沒有符合條件的庫存異動紀錄</td></tr>'
    );
    return;
  }

  var html = records.map(function (record) {
    // 轉換列列表只帶出庫側明細；詳情開啟時會合併另一側
    var itemCount = (record.items || []).length;

    return '<tr data-movement-id="' + escapeMovementHtml(record.id) + '">' +
      '<td>' +
      '<span class="admin-cell-link movement-detail-link" ' +
      'data-movement-id="' + escapeMovementHtml(record.id) + '">' +
      escapeMovementHtml(formatAdminMovementDisplayNo(record)) +
      '</span>' +
      '</td>' +
      '<td>' + escapeMovementHtml(String(getMovementCreatedAt(record)).slice(0, 10)) + '</td>' +
      '<td>' + escapeMovementHtml(record.employeeName || record.employeeId || '—') + '</td>' +
      '<td>' + itemCount + ' 筆</td>' +
      '</tr>';
  }).join('');

  $('#movementTableBody').html(html);
}

function showMovementDetailModal(record) {
  if (!record) {
    return;
  }
  $('#movementDetailModal').data('movement-id', record.id);
  $('#movementDetailModal').data('paired-movement-id', record.pairedMovementId || null);
  $('#movementDetailModal').data('conversion-id', record.conversionId || null);

  var useBackend = isAdminMovementBackendEnabled();
  var pairedId = record.pairedMovementId;

  if (useBackend && pairedId) {
    Promise.all([
      AdminAPI.movement.getById(record.id),
      AdminAPI.movement.getById(pairedId)
    ]).then(function (results) {
      var primary = normalizeMovementRecord(results[0] && results[0].data);
      var paired = normalizeMovementRecord(results[1] && results[1].data);
      renderMovementDetailModalContent(mergeConversionPairForDetail(primary, paired));
      bootstrap.Modal.getOrCreateInstance(document.getElementById('movementDetailModal')).show();
    }).catch(function (error) {
      AdminAPI.handleError(error, '載入轉換異動明細失敗');
      renderMovementDetailModalContent(record);
      bootstrap.Modal.getOrCreateInstance(document.getElementById('movementDetailModal')).show();
    });
    return;
  }

  renderMovementDetailModalContent(record);
  bootstrap.Modal.getOrCreateInstance(document.getElementById('movementDetailModal')).show();
}

/**
 * M1：把 conversion_out／conversion_in 合併成一筆明細畫面（編號用 CVT-xxx）。
 */
function mergeConversionPairForDetail(a, b) {
  var outRecord = a.movementType === 'conversion_out' ? a
    : (b.movementType === 'conversion_out' ? b : a);
  var inRecord = outRecord === a ? b : a;
  var mergedItems = []
    .concat((outRecord.items || []).map(function (item) {
      return Object.assign({}, item, { movementId: outRecord.id });
    }))
    .concat((inRecord.items || []).map(function (item) {
      return Object.assign({}, item, { movementId: inRecord.id });
    }));

  return Object.assign({}, outRecord, {
    conversionId: outRecord.conversionId || inRecord.conversionId,
    pairedMovementId: inRecord.id,
    items: mergedItems
  });
}

/** 填入明細 Modal 內容（不含表頭原因／狀態／領域／類型）。 */
function renderMovementDetailModalContent(record) {
  $('#modalMovementId').text(formatAdminMovementDisplayNo(record));
  $('#modalMovementDate').text(formatMovementDateTimeDisplay(getMovementCreatedAt(record)));
  $('#modalMovementEmployeeId').text(record.employeeName || record.employeeId || '—');

  var canEditLines = isAdminMovementBackendEnabled()
    && typeof window.canEdit === 'function'
    && window.canEdit('movement')
    && (record.status === 'draft' || record.status === 'posted');

  var itemsHtml = (record.items || []).map(function (item) {
    var natureCode = item.lineNature
      || toLineNatureCode(item.type)
      || toLineNatureCode(deriveLineNatureLabel(item));
    var natureLabel = toLineNatureLabel(natureCode) || deriveLineNatureLabel(item) || '—';
    var typeCellContent;
    if (canEditLines && item.id) {
      typeCellContent = buildLineNatureSelectHtml(item.id, natureCode, item.movementId || record.id);
    } else if (natureLabel === '損耗' || natureLabel === '折損') {
      typeCellContent = '<span class="badge bg-warning text-dark">'
        + escapeMovementHtml(natureLabel) + '</span>';
    } else {
      typeCellContent = escapeMovementHtml(natureLabel);
    }
    var lineReasonCell;
    if (canEditLines && item.id) {
      lineReasonCell =
        '<div class="input-group input-group-sm">' +
          '<input type="text" class="form-control movement-line-reason-input" ' +
          'data-item-id="' + escapeMovementHtml(item.id) + '" ' +
          'data-movement-id="' + escapeMovementHtml(item.movementId || record.id) + '" ' +
          'maxlength="1000" value="' + escapeMovementHtml(item.lineReason || '') + '" ' +
          'placeholder="" aria-label="備註">' +
          '<button type="button" class="btn btn-outline-secondary btn-save-movement-line-reason" ' +
          'data-item-id="' + escapeMovementHtml(item.id) + '" ' +
          'data-movement-id="' + escapeMovementHtml(item.movementId || record.id) + '" ' +
          'title="儲存備註">' +
          '<i class="fas fa-save"></i></button>' +
        '</div>';
    } else {
      lineReasonCell = escapeMovementHtml(item.lineReason || '—');
    }

    return '<tr data-item-id="' + escapeMovementHtml(item.id || '') + '">' +
      '<td>' + escapeMovementHtml(item.productName) + '</td>' +
      '<td class="text-center fw-semibold">' + escapeMovementHtml(item.quantity) + '</td>' +
      '<td>' + escapeMovementHtml(item.fromStore) + '</td>' +
      '<td>' + escapeMovementHtml(item.toStore) + '</td>' +
      '<td>' + typeCellContent + '</td>' +
      '<td>' + lineReasonCell + '</td>' +
      '</tr>';
  }).join('');

  $('#modalMovementItems').html(
    itemsHtml || '<tr><td colspan="6" class="text-center text-muted">沒有異動明細</td></tr>'
  );

  $('#draftMovementItemEditor').addClass('d-none');
  $('#postMovementDraft, #cancelMovementDraft').addClass('d-none');

  if (typeof window.applyEditPermission === 'function') {
    window.applyEditPermission('movement', $('#movementDetailModal'));
  }
}

/** PATCH 表頭 reason（不更新 employee_id）。 */
function saveOpenMovementReason() {
  var movementId = $('#movementDetailModal').data('movement-id');
  var reason = String($('#modalMovementReasonInput').val() || '').trim();
  if (!reason) {
    window.showAdminToast('異動原因不可空白', 'danger');
    return;
  }
  AdminAPI.movement.updateReason(movementId, { reason: reason }).then(function (response) {
    var record = upsertBackendMovement(response.data);
    showMovementDetailModal(record);
    window.showAdminToast('異動原因已更新');
  }).catch(function (error) {
    AdminAPI.handleError(error, '更新異動原因失敗');
  });
}

/** 詳情列異動性質下拉 HTML（方案 B）。 */
function buildLineNatureSelectHtml(itemId, selectedCode, movementId) {
  var options = LINE_NATURE_CODES.map(function (code) {
    var selected = code === selectedCode ? ' selected' : '';
    return '<option value="' + code + '"' + selected + '>'
      + escapeMovementHtml(LINE_NATURE_LABELS[code]) + '</option>';
  }).join('');
  return '<select class="form-select form-select-sm movement-line-nature-select" '
    + 'data-item-id="' + escapeMovementHtml(itemId) + '" '
    + 'data-movement-id="' + escapeMovementHtml(movementId || '') + '" '
    + 'aria-label="異動性質">'
    + options + '</select>';
}

/** 依 Modal 上的主單 id 從 cache 找回原紀錄（含 conversion 配對資訊）。 */
function findCachedMovementForOpenModal() {
  var movementId = $('#movementDetailModal').data('movement-id');
  return (window.movementCache || []).find(function (item) {
    return window.sameId(item.id, movementId);
  });
}

/** PATCH 明細 lineReason（轉換合併列時用該列 data-movement-id）。 */
function saveOpenMovementLineReason(itemId) {
  var $input = $('.movement-line-reason-input[data-item-id="' + itemId + '"]');
  var movementId = $input.attr('data-movement-id')
    || $('#movementDetailModal').data('movement-id');
  var lineReason = String($input.val() || '').trim();
  AdminAPI.movement.updateItemLineReason(movementId, itemId, {
    lineReason: lineReason || null
  }).then(function () {
    var cached = findCachedMovementForOpenModal();
    if (cached) {
      showMovementDetailModal(cached);
    }
    window.showAdminToast('備註已更新');
  }).catch(function (error) {
    AdminAPI.handleError(error, '更新備註失敗');
  });
}

/**
 * PATCH 明細 lineNature（不改 from／to／quantity）。
 * Save line nature only — locations stay unchanged.
 */
function saveOpenMovementLineNature(itemId, lineNature) {
  var $select = $('.movement-line-nature-select[data-item-id="' + itemId + '"]');
  var movementId = $select.attr('data-movement-id')
    || $('#movementDetailModal').data('movement-id');
  var code = toLineNatureCode(lineNature);
  if (!code) {
    window.showAdminToast('異動性質無效', 'danger');
    return;
  }
  AdminAPI.movement.updateItemLineReason(movementId, itemId, {
    lineNature: code
  }).then(function () {
    var cached = findCachedMovementForOpenModal();
    if (cached) {
      showMovementDetailModal(cached);
    }
    window.showAdminToast('異動性質已更新');
  }).catch(function (error) {
    AdminAPI.handleError(error, '更新異動性質失敗');
  });
}

/** 依異動狀態建立一致的 Bootstrap badge。 */
function buildMovementStatusBadge(status) {
  var style = status === 'posted'
    ? 'bg-success'
    : (status === 'cancelled' ? 'bg-secondary' : 'bg-warning text-dark');
  return '<span class="badge ' + style + '">' +
    escapeMovementHtml(MOVEMENT_STATUS_LABELS[status] || status || '—') +
    '</span>';
}

/** 載入正式庫位與規格 lookup，避免前端用名稱猜 ID。 */
function loadBackendMovementLookups() {
  AdminAPI.movement.getLookups().then(function (response) {
    adminMovementLookups = response.data || { locations: [], variants: [] };
    renderMovementLocationOptions();
    renderMovementDraftRows();
  }).catch(function (error) {
    AdminAPI.handleError(error, '載入庫存異動選項失敗');
  });
}

/** 重設建立草稿 Modal，預設使用商城入庫與一筆明細。 */
function resetMovementDraftForm() {
  document.getElementById('movementDraftForm').reset();
  $('#movementDomain').val('store');
  $('#movementType').val('receipt');
  $('#movementOccurredAt').val('');
  $('#movementDraftRows').empty();
  renderMovementLocationOptions();
  appendMovementDraftRow();
  syncMovementLocationFields();
}

function movementLocationsForDomain(domain) {
  return (adminMovementLookups.locations || []).filter(function (location) {
    return location.inventoryDomain === domain;
  });
}

function movementVariantsForDomain(domain) {
  return (adminMovementLookups.variants || []).filter(function (variant) {
    return variant.inventoryDomain === domain;
  });
}

/** 依庫存領域刷新來源與目的庫位選項。 */
function renderMovementLocationOptions() {
  var domain = $('#movementDomain').val() || 'store';
  var options = movementLocationsForDomain(domain).map(function (location) {
    return '<option value="' + escapeMovementHtml(location.id) + '">' +
      escapeMovementHtml(location.name + '（' + location.code + '）') +
      '</option>';
  }).join('');
  $('#movementSourceLocation, #movementDestinationLocation').html(options);
}

/** 類型決定來源／目的欄位，完全對齊後端與 DB CHECK。 */
function syncMovementLocationFields() {
  var type = $('#movementType').val();
  $('#movementSourceGroup').toggleClass('d-none', type === 'receipt');
  $('#movementDestinationGroup').toggleClass('d-none', type === 'write_off');
}

function buildMovementVariantOptions(domain) {
  return movementVariantsForDomain(domain).map(function (variant) {
    return '<option value="' + escapeMovementHtml(variant.id) + '">' +
      escapeMovementHtml(variant.productName + ' / ' + variant.sku + ' / ' + variant.specification) +
      '</option>';
  }).join('');
}

/** 在草稿建立表單加入一筆規格數量列。 */
function appendMovementDraftRow() {
  var domain = $('#movementDomain').val() || 'store';
  var html = '<div class="movement-draft-row row g-2 align-items-end border rounded p-2">' +
    '<div class="col-md-9"><label class="form-label small">商品規格</label>' +
    '<select class="form-select form-select-sm movement-draft-variant" required>' +
    buildMovementVariantOptions(domain) + '</select></div>' +
    '<div class="col-md-2"><label class="form-label small">數量</label>' +
    '<input type="number" class="form-control form-control-sm movement-draft-quantity" ' +
    'min="1" value="1" required></div>' +
    '<div class="col-md-1 d-grid"><button type="button" ' +
    'class="btn btn-sm btn-outline-danger remove-movement-draft-row" title="移除">' +
    '<i class="fas fa-trash"></i></button></div></div>';
  $('#movementDraftRows').append(html);
}

/** 領域變更時保留列數並重建每列可選規格。 */
function renderMovementDraftRows() {
  var $rows = $('#movementDraftRows .movement-draft-row');
  if (!$rows.length) return;
  var options = buildMovementVariantOptions($('#movementDomain').val() || 'store');
  $rows.find('.movement-draft-variant').html(options);
}

/** 建立表頭後逐筆新增明細；任何失敗都保留已建立的 draft 供修正。 */
function submitMovementDraftForm() {
  var type = $('#movementType').val();
  var occurredValue = $('#movementOccurredAt').val();
  var request = {
    inventoryDomain: $('#movementDomain').val(),
    movementType: type,
    sourceLocationId: type === 'receipt' ? null : $('#movementSourceLocation').val(),
    destinationLocationId: type === 'write_off' ? null : $('#movementDestinationLocation').val(),
    reason: String($('#movementReason').val() || '').trim(),
    occurredAt: occurredValue ? new Date(occurredValue).toISOString() : null
  };
  var items = [];
  var variantIds = {};
  $('#movementDraftRows .movement-draft-row').each(function () {
    var variantId = $(this).find('.movement-draft-variant').val();
    var quantity = parseInt($(this).find('.movement-draft-quantity').val(), 10);
    if (variantId && quantity > 0 && !variantIds[variantId]) {
      items.push({ variantId: variantId, quantity: quantity });
      variantIds[variantId] = true;
    }
  });
  if (!request.reason || !items.length) {
    window.showAdminToast('請填寫原因並至少加入一筆有效明細', 'danger');
    return;
  }
  var $button = $('#submitMovementDraft').prop('disabled', true).text('建立中…');
  var movementId;
  AdminAPI.movement.createDraft(request).then(function (response) {
    movementId = response.data.id;
    return items.reduce(function (chain, item) {
      return chain.then(function () {
        return AdminAPI.movement.addItem(movementId, item);
      });
    }, Promise.resolve(response));
  }).then(function (response) {
    upsertBackendMovement(response.data);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('movementDraftModal')).hide();
    window.showAdminToast('已建立草稿 ' + response.data.movementNo);
  }).catch(function (error) {
    AdminAPI.handleError(error, movementId
      ? '草稿已建立，但部分明細新增失敗；請從草稿詳情繼續處理'
      : '建立庫存異動草稿失敗');
  }).finally(function () {
    $button.prop('disabled', false).text('建立草稿');
  });
}

function renderOpenDraftVariantOptions(record) {
  $('#draftMovementVariant').html(buildMovementVariantOptions(record.inventoryDomain));
  $('#draftMovementQuantity').val(1);
}

/** 對目前開啟的 draft 新增明細，後端成功後才更新 cache。 */
function addItemToOpenMovementDraft() {
  var movementId = $('#movementDetailModal').data('movement-id');
  var request = {
    variantId: $('#draftMovementVariant').val(),
    quantity: parseInt($('#draftMovementQuantity').val(), 10)
  };
  if (!request.variantId || !(request.quantity > 0)) {
    window.showAdminToast('請選擇規格並輸入正整數數量', 'danger');
    return;
  }
  AdminAPI.movement.addItem(movementId, request).then(function (response) {
    var record = upsertBackendMovement(response.data);
    showMovementDetailModal(record);
    window.showAdminToast('異動明細已新增');
  }).catch(function (error) {
    AdminAPI.handleError(error, '新增異動明細失敗');
  });
}

/** 過帳或作廢都以後端回應取代 cache，避免前端假成功。 */
function changeOpenMovementStatus(action) {
  var movementId = $('#movementDetailModal').data('movement-id');
  var operation = action === 'post'
    ? AdminAPI.movement.post(movementId)
    : AdminAPI.movement.cancel(movementId);
  operation.then(function (response) {
    var record = upsertBackendMovement(response.data);
    showMovementDetailModal(record);
    window.showAdminToast(action === 'post' ? '庫存異動已過帳' : '庫存異動已作廢');
  }).catch(function (error) {
    AdminAPI.handleError(error, action === 'post' ? '庫存異動過帳失敗' : '庫存異動作廢失敗');
  });
}

function upsertBackendMovement(movement) {
  var record = normalizeMovementRecord(movement);
  var index = (window.movementCache || []).findIndex(function (item) {
    return window.sameId(item.id, record.id);
  });
  window.movementCache = window.movementCache || [];
  if (index >= 0) {
    window.movementCache[index] = record;
  } else {
    window.movementCache.unshift(record);
  }
  populateEmployeeFilterOptions(window.movementCache);
  applyMovementFiltersAndSort();

  return record;
}

function escapeMovementHtml(value) {
  return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (char) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char];
  });
}
