/**
 * admin/js/products.js
 * 商品 & 庫存管理模組
 * 使用 jQuery Event Namespace (.products) 防止重複導覽時事件堆疊
 *
 * products.json 欄位對應：thumbnail（非 image）、status:"active"/"inactive"（非 active:bool）
 * Product status canonical: active = 上架, inactive = 下架（勿再用 disabled）
 * 分店庫存僅固定據點：main + branch-001~003；租借僅 C001–C009（含租借主倉）。
 * Store stock: preset branches only (main + branch-001~003); rental: C001–C009 only.
 * 後台不再支援自訂分店／自訂營地；讀寫會忽略非固定 key。
 * Custom branch/camp locations are not supported; non-preset keys are ignored on read/write.
 * 低庫存：任一分店／營地實際庫存低於其最低值時，該格數字顯示紅色（text-danger）
 * 低庫存閾值由各商品各分店在 min-stock.json 獨立設定（預設 5）
 * 篩選：分類 / 品牌多選（商店 / 租借共用 productFilterState，欄內 OR、欄間 AND）
 */

var PRODUCT_IMAGE_PLACEHOLDER = 'https://placehold.co/48x48/cccccc/555555?text=No+Image';

// 商店主倉固定 ID 與顯示名稱
// Store main warehouse ID and display label
var ADMIN_STORE_WAREHOUSE_ID    = 'main';
var ADMIN_STORE_WAREHOUSE_LABEL = '商店主倉';

// 租借主倉固定 ID 與顯示名稱（C001；可預約營區為 C002–C009，對齊 campgrounds.json）
// Rental main warehouse ID (C001); bookable camps C002–C009 match catalog/campgrounds.json
var ADMIN_RENTAL_WAREHOUSE_ID    = 'C001';
var ADMIN_RENTAL_WAREHOUSE_LABEL = '租借主倉';

// 商店分店 ID 清單：主倉排第一，其餘為實體分店
// Store branch IDs: main warehouse first, then physical branches
var ADMIN_PRODUCT_BRANCH_IDS = ['main', 'branch-001', 'branch-002', 'branch-003'];
var ADMIN_PRODUCT_BRANCH_LABELS = {
  'main':       '商店主倉',
  'branch-001': '台北旗艦店',
  'branch-002': '台中中港店',
  'branch-003': '高雄左營店'
};

/** 是否為固定分店 ID（main / branch-001~003）/ Whether branch key is a preset ID */
function isFixedBranchId(branchId) {
  return ADMIN_PRODUCT_BRANCH_IDS.indexOf(branchId) !== -1;
}

/**
 * 比對前後庫存時，只使用固定分店 ID。
 * Branch keys for stock-change diff: preset IDs only.
 */
function getBranchKeysUnionForChange() {
  return ADMIN_PRODUCT_BRANCH_IDS.slice();
}

// 租借庫存地點：C001=租借主倉，C002–C009=可預約營區（與 rental-skus.json / campgrounds 一致）
// Rental stock locations: C001 warehouse, C002–C009 bookable campgrounds
var ADMIN_RENTAL_CAMP_IDS = [
  'C001', 'C002', 'C003', 'C004', 'C005', 'C006', 'C007', 'C008', 'C009'
];

// 表格欄位短標籤 / Short column labels for rental stock table
var ADMIN_RENTAL_CAMP_LABELS = {
  'C001': '租借主倉',
  'C002': '雲海仙境',
  'C003': '溪谷秘境',
  'C004': '太平山',
  'C005': '星空草原',
  'C006': '花蓮海岸',
  'C007': '阿里山',
  'C008': '礁溪湯泉',
  'C009': '武陵溪流'
};

// 寫回 rental-skus.json 的 camp[].name（須與 campgrounds 或「租借主倉」一致）
// Full names persisted to rental-skus.json camp[].name
var ADMIN_RENTAL_CAMP_FULL_NAMES = {
  'C001': '租借主倉',
  'C002': '雲海仙境露營區',
  'C003': '溪谷秘境野營地',
  'C004': '太平山森林豪華露營',
  'C005': '南台灣星空草原營地',
  'C006': '花蓮海岸風露營區',
  'C007': '阿里山雲霧繚繞營地',
  'C008': '宜蘭礁溪湯泉露營',
  'C009': '台中武陵溪流野營'
};

// ── 規格庫存（Variant Stock）常數與工具函式 ─────────────────────────────────────
// Variant-level stock helpers: each variant owns branch{} / camp{} quantities

/** 產生穩定的規格 ID / Generate stable variant ID */
function generateVariantId() {
  return 'v-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
}

/** 建立空的商店分店庫存物件 / Empty store branch stock object */
function createEmptyBranchStock() {
  var result = {};
  ADMIN_PRODUCT_BRANCH_IDS.forEach(function (branchId) {
    result[branchId] = 0;
  });
  return result;
}

/** 建立空的租借營地庫存物件 / Empty rental camp stock object */
function createEmptyCampStock() {
  var result = {};
  ADMIN_RENTAL_CAMP_IDS.forEach(function (campId) {
    result[campId] = 0;
  });
  return result;
}

/**
 * 複製分店庫存物件（只保留固定分店 ID，忽略舊自訂 key）。
 * Clone branch stock; keep preset IDs only (drop legacy custom keys).
 */
function cloneBranchStock(branchStock) {
  var cloned = createEmptyBranchStock();
  if (!branchStock || typeof branchStock !== 'object') {
    return cloned;
  }

  ADMIN_PRODUCT_BRANCH_IDS.forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(branchStock, key)) {
      cloned[key] = normalizeStockValue(branchStock[key]);
    }
  });
  return cloned;
}

/**
 * 複製營地庫存物件（只保留固定營地 ID，忽略舊自訂 key）。
 * Clone camp stock; keep preset camp IDs only (drop legacy custom keys).
 */
function cloneCampStock(campStock) {
  var cloned = createEmptyCampStock();
  if (!campStock || typeof campStock !== 'object') {
    return cloned;
  }

  ADMIN_RENTAL_CAMP_IDS.forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(campStock, key)) {
      cloned[key] = normalizeStockValue(campStock[key]);
    }
  });
  return cloned;
}

/**
 * 加總所有規格的分店庫存，產生商品層 branch 快取（僅固定分店）。
 * Aggregate variant branch stocks into product-level branch cache (preset only).
 */
function aggregateBranchFromVariants(variants) {
  var aggregated = createEmptyBranchStock();

  (variants || []).forEach(function (variant) {
    var branchStock = variant && variant.branch ? variant.branch : {};
    ADMIN_PRODUCT_BRANCH_IDS.forEach(function (branchKey) {
      aggregated[branchKey] += normalizeStockValue(branchStock[branchKey]);
    });
  });

  return aggregated;
}

/** 加總所有規格的 total / Sum variant totals */
function aggregateTotalFromVariants(variants) {
  return (variants || []).reduce(function (sum, variant) {
    if (variant && variant.branch) {
      return sum + getBranchTotal(variant.branch);
    }
    return sum + normalizeStockValue(variant && variant.total);
  }, 0);
}

/**
 * 加總所有規格的營地庫存，產生 camp[] 陣列（僅固定營地，給列表頁沿用）。
 * Aggregate variant camp stocks into rental camp[] array (preset camps only).
 */
function aggregateRentalCampFromVariants(variants) {
  var campByKey = createEmptyCampStock();

  (variants || []).forEach(function (variant) {
    var campStock = variant && variant.camp ? variant.camp : {};
    ADMIN_RENTAL_CAMP_IDS.forEach(function (campKey) {
      campByKey[campKey] += normalizeStockValue(campStock[campKey]);
    });
  });

  return buildCampArrayFromKey(campByKey);
}

/** 組合異動紀錄用的商品名稱（含規格）/ Movement label with variant */
function formatMovementProductName(productName, variant) {
  var label = variant && variant.label ? String(variant.label).trim() : '';
  if (!label) {
    return productName;
  }
  return productName + '（' + label + '）';
}

/** 判斷物件是否為據點庫存（含 main / branch-001 等 key）/ Whether object is location stock map */
function isLocationStockMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.keys(value).some(function (key) {
    return isFixedBranchId(key) || isFixedCampId(key);
  });
}

/** 是否為固定營地 ID / Whether camp key is a preset ID */
function isFixedCampId(campId) {
  return ADMIN_RENTAL_CAMP_IDS.indexOf(campId) !== -1;
}

var adminProductsCache = [];
var adminRentalsCache = [];
var adminRentalsLoaded = false;

// 正式後端商品表單的分類與品牌選項，送出時使用主檔 ID。
var adminProductLookups = {
  categories: [],
  brands: []
};

/**
 * W2-01／02：分類／品牌主檔 Modal（kind = 'categories' | 'brands'）
 * Catalog master modal for categories / brands.
 */
var catalogMasterKind = 'categories';

function bindCatalogMasterUi() {
  $(document).off('click.catalogMaster', '#btnManageCategories')
    .on('click.catalogMaster', '#btnManageCategories', function () {
      openCatalogMasterModal('categories');
    });
  $(document).off('click.catalogMaster', '#btnManageBrands')
    .on('click.catalogMaster', '#btnManageBrands', function () {
      openCatalogMasterModal('brands');
    });
  $(document).off('submit.catalogMaster', '#catalogMasterCreateForm')
    .on('submit.catalogMaster', '#catalogMasterCreateForm', function (event) {
      event.preventDefault();
      submitCatalogMasterCreate();
    });
  $(document).off('click.catalogMaster', '.btn-catalog-master-delete')
    .on('click.catalogMaster', '.btn-catalog-master-delete', function () {
      var id = $(this).data('id');
      deleteCatalogMasterItem(id);
    });
}

function openCatalogMasterModal(kind) {
  catalogMasterKind = kind === 'brands' ? 'brands' : 'categories';
  var isBrand = catalogMasterKind === 'brands';
  $('#catalogMasterModalLabel').text(isBrand ? '品牌主檔' : '分類主檔');
  $('#catalogMasterIdFieldWrap').toggleClass('d-none', !isBrand);
  $('#catalogMasterCodeFieldWrap').toggleClass('d-none', isBrand);
  $('#catalogMasterId, #catalogMasterCode, #catalogMasterName').val('');
  $('#catalogMasterSort').val(0);
  var modalEl = document.getElementById('catalogMasterModal');
  if (modalEl && typeof bootstrap !== 'undefined') {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
  refreshCatalogMasterList();
}

/** 建立成功後重抓 lookups，讓商品表單選單立刻有新項 */
function refreshAdminProductLookupsFromBackend() {
  if (!isAdminProductBackendEnabled()) {
    return $.Deferred().resolve().promise();
  }
  return AdminAPI.products.getLookups()
    .then(function (response) {
      adminProductLookups = (response && response.data) || { categories: [], brands: [] };
      loadProductFormComboboxOptions();
    })
    .catch(function (error) {
      AdminAPI.handleError(error, '重新載入分類／品牌選項失敗');
    });
}

function refreshCatalogMasterList() {
  var $list = $('#catalogMasterList').empty()
    .append('<li class="list-group-item text-muted small">載入中…</li>');
  var api = catalogMasterKind === 'brands' ? AdminAPI.brands : AdminAPI.categories;
  api.list()
    .then(function (response) {
      var rows = (response && response.data) || [];
      $list.empty();
      if (!rows.length) {
        $list.append('<li class="list-group-item text-muted small">尚無資料</li>');
        return;
      }
      rows.forEach(function (row) {
        var label = catalogMasterKind === 'brands'
          ? (row.id + ' — ' + row.name)
          : (row.code + ' — ' + row.name + ' (#' + row.id + ')');
        var itemId = catalogMasterKind === 'brands' ? row.id : row.id;
        $list.append(
          '<li class="list-group-item d-flex justify-content-between align-items-center px-0">'
          + '<span class="small">' + $('<div>').text(label).html() + '</span>'
          + '<button type="button" class="btn btn-sm btn-outline-danger btn-catalog-master-delete"'
          + ' data-id="' + $('<div>').text(String(itemId)).html() + '">刪除</button>'
          + '</li>'
        );
      });
    })
    .catch(function (error) {
      AdminAPI.handleError(error, '載入主檔失敗');
      $list.empty().append('<li class="list-group-item text-danger small">載入失敗</li>');
    });
}

function submitCatalogMasterCreate() {
  var name = ($('#catalogMasterName').val() || '').trim();
  var sortOrder = parseInt($('#catalogMasterSort').val(), 10);
  if (!name) {
    window.showAdminToast('請填寫顯示名稱', 'warning');
    return;
  }
  if (isNaN(sortOrder) || sortOrder < 0) {
    sortOrder = 0;
  }

  var promise;
  if (catalogMasterKind === 'brands') {
    var brandId = ($('#catalogMasterId').val() || '').trim();
    if (!brandId) {
      window.showAdminToast('請填寫品牌 ID（slug）', 'warning');
      return;
    }
    promise = AdminAPI.brands.create({ id: brandId, name: name, sortOrder: sortOrder });
  } else {
    var code = ($('#catalogMasterCode').val() || '').trim();
    if (!code) {
      window.showAdminToast('請填寫分類 code', 'warning');
      return;
    }
    promise = AdminAPI.categories.create({ code: code, name: name, sortOrder: sortOrder });
  }

  $('#catalogMasterCreateBtn').prop('disabled', true);
  promise
    .then(function () {
      window.showAdminToast('已建立', 'success');
      $('#catalogMasterId, #catalogMasterCode, #catalogMasterName').val('');
      $('#catalogMasterSort').val(0);
      refreshCatalogMasterList();
      return refreshAdminProductLookupsFromBackend();
    })
    .catch(function (error) {
      AdminAPI.handleError(error, '建立失敗');
    })
    .then(function () {
      $('#catalogMasterCreateBtn').prop('disabled', false);
    });
}

function deleteCatalogMasterItem(id) {
  if (!id) {
    return;
  }
  if (!window.confirm('確定刪除此項目？若已被商品引用將無法刪除。')) {
    return;
  }
  var api = catalogMasterKind === 'brands' ? AdminAPI.brands : AdminAPI.categories;
  api.remove(id)
    .then(function () {
      window.showAdminToast('已刪除', 'warning');
      refreshCatalogMasterList();
      return refreshAdminProductLookupsFromBackend();
    })
    .catch(function (error) {
      AdminAPI.handleError(error, '刪除失敗（可能仍被商品引用）');
    });
}

function isAdminProductBackendEnabled() {
  return typeof AdminAPI !== 'undefined' &&
    AdminAPI.isBackendEnabled &&
    AdminAPI.isBackendEnabled();
}

/**
 * 將後端商品回應轉成既有 Admin 表格使用的 ViewModel。
 * 庫存只映射為唯讀顯示，商品更新 Request 不會再帶回後端。
 */
function mapAdminProductResponse(product) {
  var variants = (product.variants || []).map(function (variant) {
    var branch = createEmptyBranchStock();
    (variant.stockLocations || []).forEach(function (location) {
      var branchKey = location.locationType === 'main' ? ADMIN_STORE_WAREHOUSE_ID : location.branchId;
      if (branchKey && isFixedBranchId(branchKey)) {
        branch[branchKey] += normalizeStockValue(location.onHandQuantity);
      }
    });

    return {
      id: variant.id,
      sku: variant.sku,
      color: variant.color || '',
      size: variant.size || '',
      specification: variant.specification,
      label: variant.specification || buildVariantLabel(variant.color, variant.size),
      price: variant.price,
      status: variant.status,
      branch: branch,
      total: normalizeStockValue(variant.onHandQuantity),
      availableQuantity: normalizeStockValue(variant.availableQuantity)
    };
  });

  return normalizeProductBranch({
    id: product.id,
    itemId: product.itemId,
    status: product.status,
    name: product.name,
    categoryId: product.categoryId,
    category: product.category,
    brandId: product.brandId,
    brand: product.brand || '',
    description: product.description || '',
    image: product.image || '',
    images: (product.images || []).map(function (image) { return image.url; }),
    price: product.price,
    variants: variants,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  });
}

/** 依顯示名稱取得後端分類 ID。 */
function findAdminCategoryId(categoryName) {
  var match = adminProductLookups.categories.find(function (category) {
    return category.name === categoryName;
  });
  return match ? match.id : null;
}

/** 依顯示名稱取得後端品牌 ID，未指定品牌時回傳 null。 */
function findAdminBrandId(brandName) {
  if (!brandName) {
    return null;
  }
  var match = adminProductLookups.brands.find(function (brand) {
    return brand.name === brandName;
  });
  return match ? match.id : null;
}

/**
 * 正式模式：依 readiness 決定是否顯示租借 tab／調撥／分類品牌主檔。
 * Backend mode: gate rental tab, conversion transfer, and catalog master by feature flags.
 *
 * - products.rentalWrite → 租借列表＋上架定價（W2-04）
 * - movement.conversion → 「調撥」打 inventory-conversions（W2-05）
 */
function syncBackendProductUi() {
  var useBackend = isAdminProductBackendEnabled();
  // 最低庫存 feature 就緒時，正式模式也顯示「設定最低庫存」按鈕
  // Show min-stock toggle in backend mode when products.minStock is ready
  var minStockReady = !useBackend
    || (typeof AdminRuntime !== 'undefined'
      && AdminRuntime.isFeatureReady
      && AdminRuntime.isFeatureReady('products.minStock'));
  // W2-01／02：分類／品牌主檔按鈕只在正式模式＋ feature ready 顯示
  var categoryMasterReady = useBackend
    && typeof AdminRuntime !== 'undefined'
    && AdminRuntime.isFeatureReady
    && AdminRuntime.isFeatureReady('products.categoryMaster');
  var brandMasterReady = useBackend
    && typeof AdminRuntime !== 'undefined'
    && AdminRuntime.isFeatureReady
    && AdminRuntime.isFeatureReady('products.brandMaster');
  // W2-04：租借寫入／listing 就緒才顯示租借 tab
  var rentalWriteReady = !useBackend
    || (typeof AdminRuntime !== 'undefined'
      && AdminRuntime.isFeatureReady
      && AdminRuntime.isFeatureReady('products.rentalWrite'));
  // W2-05：跨領域轉換就緒才開放調撥按鈕
  var conversionReady = !useBackend
    || (typeof AdminRuntime !== 'undefined'
      && AdminRuntime.isFeatureReady
      && AdminRuntime.isFeatureReady('movement.conversion'));

  $('.admin-product-tab[data-products-view="rental"]').toggleClass('d-none', useBackend && !rentalWriteReady);
  if (useBackend && !rentalWriteReady) {
    $('[data-products-panel="rental"]').addClass('d-none');
  }
  // 只控制切換鈕；提示列仍由 updateMinStockModeUI 負責顯示
  $('#toggleMinStockMode').toggleClass('d-none', useBackend && !minStockReady);
  $('#btnManageCategories').toggleClass('d-none', !categoryMasterReady);
  $('#btnManageBrands').toggleClass('d-none', !brandMasterReady);
  $('#newProductIsRentalWrapper, #rentalCampField').toggleClass('d-none', useBackend);
  $('#newProductStockCol').toggleClass('d-none', useBackend);
  $('#newProductImages').toggleClass('d-none', useBackend).prop('disabled', useBackend);
  $('#backendProductImageUrlRow').toggleClass('d-none', !useBackend);
  $('#newProductImagesHelp').text(useBackend
    ? '正式模式只儲存 /assets/... 或 http(s) 圖片 URL；第一張為主圖。'
    : '可一次選多張；第一張為主圖，拖曳握把調整順序');
  if (useBackend) {
    // 正式模式：轉換未就緒才隱藏調撥；最低庫存編輯鈕在 min-stock 模式才會渲染
    $('.transfer-to-rental-btn, .transfer-from-rental-btn')
      .prop('disabled', !conversionReady)
      .toggleClass('d-none', !conversionReady);
    $('#transferConversionReasonWrap').toggleClass('d-none', !conversionReady);
  } else {
    $('#transferConversionReasonWrap').addClass('d-none');
  }
}
// 租借表目前營區欄位 ID 順序（僅固定 C001–C009）；表頭與 tbody 共用
// Rental table camp column IDs: preset C001–C009 only; shared by thead/tbody
var rentalTableCampColumnIds = ADMIN_RENTAL_CAMP_IDS.slice();
var pendingMovementItems = [];

// ── 分類 / 品牌篩選狀態（每次進入商品頁重置）────────────────────────────────────
// Category & brand filter state — reset on each page visit; shared by store & rental tabs
/** @type {{ category: string[], brand: string[] }} */
var productFilterState = {
  category: [],
  brand: []
};

/** 空品牌在表格與篩選中的顯示標籤 / Label for empty brand in table and filters */
var PRODUCT_BRAND_EMPTY_LABEL = '未指定';

/** Combobox：選「＋ 新增自訂…」時使用的 sentinel 值 / Custom option sentinel */
var PRODUCT_COMBOBOX_CUSTOM_VALUE = '__custom__';

/** 分類預設選項（與表格篩選一致）/ Default category options */
var DEFAULT_PRODUCT_CATEGORIES = ['帳篷', '睡袋', '炊具', '燈具', '背包', '配件', '其他'];

/** 品牌預設選項（對齊前台常用品牌）/ Default brand options */
var DEFAULT_PRODUCT_BRANDS = [
  'Snow Peak', 'Osprey', 'MSR', 'Coleman', 'Patagonia', 'Deuter',
  'Black Diamond', 'Helinox', 'Columbia', 'Ogawa', 'Therm-a-Rest',
  'Sawyer', 'Leki', 'BrightCamp', 'NightRest'
];

/**
 * 從商店 / 租借快取收集不重複欄位值，並合併預設清單。
 * Collect unique field values from caches merged with defaults.
 */
function collectProductFieldOptions(field, defaults) {
  var map = {};
  var result = (defaults || []).slice();

  (defaults || []).forEach(function (value) {
    map[value] = true;
  });

  (adminProductsCache || []).forEach(function (item) {
    var val = item && item[field] ? String(item[field]).trim() : '';
    if (val && !map[val]) {
      map[val] = true;
      result.push(val);
    }
  });

  (adminRentalsCache || []).forEach(function (item) {
    var val = item && item[field] ? String(item[field]).trim() : '';
    if (val && !map[val]) {
      map[val] = true;
      result.push(val);
    }
  });

  return result;
}

/**
 * 重建 combobox 的 select 選項（含「＋ 新增自訂…」）。
 * Rebuild combobox select options including the custom entry.
 */
function renderProductComboboxSelect($select, options, config) {
  $select.empty();

  if (config && config.allowEmpty) {
    $select.append($('<option>', {
      value: '',
      text: config.emptyLabel || '請選擇'
    }));
  }

  (options || []).forEach(function (optionValue) {
    $select.append($('<option>', {
      value: optionValue,
      text: optionValue
    }));
  });

  if (!config || config.allowCustom !== false) {
    $select.append($('<option>', {
      value: PRODUCT_COMBOBOX_CUSTOM_VALUE,
      text: '＋ 新增自訂…'
    }));
  }
}

/** 顯示或隱藏自訂輸入框 / Toggle custom text input for combobox */
function toggleProductComboboxCustom(type, show) {
  var customId = type === 'category' ? '#newProductCategoryCustom' : '#newProductBrandCustom';
  var $custom = $(customId);

  $custom.toggleClass('d-none', !show);

  if (show) {
    $custom.trigger('focus');
  } else {
    $custom.val('');
  }
}

/** 若值不在 select 內，動態插入一個 option / Ensure value exists as a select option */
function ensureProductComboboxOption($select, value) {
  if (!value) {
    return;
  }

  var exists = $select.find('option').filter(function () {
    return $(this).val() === value;
  }).length > 0;

  if (!exists) {
    $select.find('option[value="' + PRODUCT_COMBOBOX_CUSTOM_VALUE + '"]').before(
      $('<option>', { value: value, text: value })
    );
  }
}

/**
 * 讀取 combobox 目前值（含自訂輸入）。
 * Read combobox value including custom input mode.
 */
function getProductComboboxValue(type) {
  var $select = type === 'category' ? $('#newProductCategorySelect') : $('#newProductBrandSelect');
  var $custom = type === 'category' ? $('#newProductCategoryCustom') : $('#newProductBrandCustom');

  if ($select.val() === PRODUCT_COMBOBOX_CUSTOM_VALUE) {
    return $custom.val().trim();
  }

  return ($select.val() || '').trim();
}

/**
 * 設定 combobox 值；若不在清單內則切換到自訂模式。
 * Set combobox value; switch to custom mode when value is not listed.
 */
function setProductComboboxValue(type, value) {
  var normalized = (value || '').trim();
  var $select = type === 'category' ? $('#newProductCategorySelect') : $('#newProductBrandSelect');
  var $custom = type === 'category' ? $('#newProductCategoryCustom') : $('#newProductBrandCustom');

  if (!normalized) {
    if (type === 'category') {
      ensureProductComboboxOption($select, '其他');
      $select.val('其他');
    } else {
      $select.val('');
    }
    toggleProductComboboxCustom(type, false);
    return;
  }

  ensureProductComboboxOption($select, normalized);

  if ($select.find('option').filter(function () { return $(this).val() === normalized; }).length) {
    $select.val(normalized);
    toggleProductComboboxCustom(type, false);
  } else {
    $select.val(PRODUCT_COMBOBOX_CUSTOM_VALUE);
    $custom.val(normalized);
    toggleProductComboboxCustom(type, true);
  }
}

/** 重設分類 / 品牌 combobox 為新增模式預設值 / Reset combobox fields for add mode */
function resetProductComboboxFields() {
  var backendCategories = adminProductLookups.categories.map(function (category) { return category.name; });
  var backendBrands = adminProductLookups.brands.map(function (brand) { return brand.name; });
  renderProductComboboxSelect(
    $('#newProductCategorySelect'),
    isAdminProductBackendEnabled()
      ? backendCategories
      : collectProductFieldOptions('category', DEFAULT_PRODUCT_CATEGORIES),
    { allowEmpty: false, allowCustom: !isAdminProductBackendEnabled() }
  );
  renderProductComboboxSelect(
    $('#newProductBrandSelect'),
    isAdminProductBackendEnabled()
      ? backendBrands
      : collectProductFieldOptions('brand', DEFAULT_PRODUCT_BRANDS),
    { allowEmpty: true, emptyLabel: '請選擇品牌', allowCustom: !isAdminProductBackendEnabled() }
  );
  setProductComboboxValue('category', backendCategories[0] || '帳篷');
  setProductComboboxValue('brand', '');
}

/**
 * 依快取資料刷新分類 / 品牌下拉，並同步表格篩選選項。
 * Refresh category/brand selects and table filter options from cache.
 */
function loadProductFormComboboxOptions() {
  var categoryValue = getProductComboboxValue('category');
  var brandValue = getProductComboboxValue('brand');
  var backendCategories = adminProductLookups.categories.map(function (category) { return category.name; });
  var backendBrands = adminProductLookups.brands.map(function (brand) { return brand.name; });

  renderProductComboboxSelect(
    $('#newProductCategorySelect'),
    isAdminProductBackendEnabled()
      ? backendCategories
      : collectProductFieldOptions('category', DEFAULT_PRODUCT_CATEGORIES),
    { allowEmpty: false, allowCustom: !isAdminProductBackendEnabled() }
  );
  renderProductComboboxSelect(
    $('#newProductBrandSelect'),
    isAdminProductBackendEnabled()
      ? backendBrands
      : collectProductFieldOptions('brand', DEFAULT_PRODUCT_BRANDS),
    { allowEmpty: true, emptyLabel: '請選擇品牌', allowCustom: !isAdminProductBackendEnabled() }
  );

  setProductComboboxValue('category', categoryValue || backendCategories[0] || '帳篷');
  setProductComboboxValue('brand', brandValue);
  refreshProductCategoryFilterOptions();
  refreshProductBrandFilterOptions();
}

/** 動態更新商店 / 租借表格的分類篩選 checkbox / Refresh category filter dropdowns */
function refreshProductCategoryFilterOptions() {
  var categories = collectProductFieldOptions('category', DEFAULT_PRODUCT_CATEGORIES);
  var optionsHtml = categories.map(function (category) {
    return '<label><input type="checkbox" value="' + escapeHtml(category) + '"> ' +
      escapeHtml(category) + '</label>';
  }).join('');

  $('[data-product-category-filter-options]').html(optionsHtml);
  syncProductCategoryFilterCheckboxes();
}

/** 動態更新商店 / 租借表格的品牌篩選 checkbox / Refresh brand filter dropdowns */
function refreshProductBrandFilterOptions() {
  var brands = collectProductFieldOptions('brand', DEFAULT_PRODUCT_BRANDS);

  if (brands.indexOf(PRODUCT_BRAND_EMPTY_LABEL) === -1) {
    brands.unshift(PRODUCT_BRAND_EMPTY_LABEL);
  }

  var optionsHtml = brands.map(function (brand) {
    return '<label><input type="checkbox" value="' + escapeHtml(brand) + '"> ' +
      escapeHtml(brand) + '</label>';
  }).join('');

  $('[data-product-brand-filter-options]').html(optionsHtml);
  syncProductBrandFilterCheckboxes();
}

/** 綁定分類 / 品牌 combobox 切換事件 / Bind combobox change handlers */
function bindProductFormComboboxEvents() {
  $(document).on('change.products', '#newProductCategorySelect', function () {
    toggleProductComboboxCustom('category', $(this).val() === PRODUCT_COMBOBOX_CUSTOM_VALUE);
  });

  $(document).on('change.products', '#newProductBrandSelect', function () {
    toggleProductComboboxCustom('brand', $(this).val() === PRODUCT_COMBOBOX_CUSTOM_VALUE);
  });
}

/**
 * 正規化商品分類字串（空值視為「其他」，供篩選比對用）
 * Normalize category for filter matching — empty values become '其他'
 * @param {Object} item
 * @returns {string}
 */
function getProductCategoryForFilter(item) {
  var cat = (item && item.category) ? String(item.category).trim() : '';
  return cat || '其他';
}

/**
 * 正規化商品品牌字串（空值視為「未指定」，租借可從關聯商店帶入）
 * Normalize brand for filter matching — empty values become PRODUCT_BRAND_EMPTY_LABEL
 * @param {Object} item
 * @returns {string}
 */
function getProductBrandForFilter(item) {
  var brand = (item && item.brand) ? String(item.brand).trim() : '';

  if (!brand && item && item.camp) {
    brand = getRentalBrandForForm(item);
  }

  return brand || PRODUCT_BRAND_EMPTY_LABEL;
}

/** 表格顯示用品牌文字 / Brand label for table cells */
function getProductBrandDisplay(item) {
  return getProductBrandForFilter(item);
}

/** 是否有任一啟用中的篩選條件 / Whether any product filter is active */
function hasActiveProductFilters() {
  return productFilterState.category.length > 0 || productFilterState.brand.length > 0;
}

/**
 * 從觸發的 filter-th 收集已勾選分類，並同步另一張表的 checkbox
 * Collect checked categories from the active filter header
 * @param {jQuery} $th
 */
function collectProductCategoryFilter($th) {
  var selected = [];
  $th.find('.filter-dropdown input:checked').each(function () {
    var v = $(this).val();
    if (selected.indexOf(v) === -1) { selected.push(v); }
  });
  productFilterState.category = selected;
  syncProductCategoryFilterCheckboxes();
}

/**
 * 從觸發的 filter-th 收集已勾選品牌，並同步另一張表的 checkbox
 * Collect checked brands from the active filter header
 * @param {jQuery} $th
 */
function collectProductBrandFilter($th) {
  var selected = [];
  $th.find('.filter-dropdown input:checked').each(function () {
    var v = $(this).val();
    if (selected.indexOf(v) === -1) { selected.push(v); }
  });
  productFilterState.brand = selected;
  syncProductBrandFilterCheckboxes();
}

/** 同步商店 / 租借兩張表的分類 checkbox 勾選狀態 */
function syncProductCategoryFilterCheckboxes() {
  var selector =
    '#productsTable .filter-th[data-filter-key="category"] input, ' +
    '#rentalProductsTable .filter-th[data-filter-key="category"] input';

  $(selector).each(function () {
    $(this).prop(
      'checked',
      productFilterState.category.indexOf($(this).val()) !== -1
    );
  });
}

/** 同步商店 / 租借兩張表的品牌 checkbox 勾選狀態 */
function syncProductBrandFilterCheckboxes() {
  var selector =
    '#productsTable .filter-th[data-filter-key="brand"] input, ' +
    '#rentalProductsTable .filter-th[data-filter-key="brand"] input';

  $(selector).each(function () {
    $(this).prop(
      'checked',
      productFilterState.brand.indexOf($(this).val()) !== -1
    );
  });
}

/**
 * 依 productFilterState 過濾陣列（分類 / 品牌欄內 OR，兩欄之間 AND）
 * Filter items by selected categories and brands
 * @param {Array} items
 * @returns {Array}
 */
function filterProductsByFilters(items) {
  var list = (items || []).slice();

  if (productFilterState.category.length) {
    list = list.filter(function (item) {
      return productFilterState.category.indexOf(getProductCategoryForFilter(item)) !== -1;
    });
  }

  if (productFilterState.brand.length) {
    list = list.filter(function (item) {
      return productFilterState.brand.indexOf(getProductBrandForFilter(item)) !== -1;
    });
  }

  return list;
}

/** 更新漏斗 icon、紅點與「清除篩選」按鈕 */
function updateProductFilterUI() {
  var hasCategoryFilter = productFilterState.category.length > 0;
  var hasBrandFilter = productFilterState.brand.length > 0;
  var hasFilter = hasCategoryFilter || hasBrandFilter;

  $('#productsTable .filter-th[data-filter-key="category"], ' +
    '#rentalProductsTable .filter-th[data-filter-key="category"]').each(function () {
    var $th = $(this);
    $th.find('.filter-icon').toggleClass('active', hasCategoryFilter);
    $th.find('.filter-dot').toggleClass('d-none', !hasCategoryFilter);
  });

  $('#productsTable .filter-th[data-filter-key="brand"], ' +
    '#rentalProductsTable .filter-th[data-filter-key="brand"]').each(function () {
    var $th = $(this);
    $th.find('.filter-icon').toggleClass('active', hasBrandFilter);
    $th.find('.filter-dot').toggleClass('d-none', !hasBrandFilter);
  });

  $('#btnClearProductFilters').toggleClass('d-none', !hasFilter);
  syncProductCategoryFilterCheckboxes();
  syncProductBrandFilterCheckboxes();
}

/**
 * 套用分類 / 品牌篩選後渲染商店表與租借表
 * Apply category & brand filters then re-render both product tables
 */
function applyProductCategoryFilterAndRender() {
  renderProductsTable(filterProductsByFilters(adminProductsCache));
  renderRentalProductsTable(filterProductsByFilters(adminRentalsCache));
  updateProductFilterUI();
}

// ── 商品描述 Summernote 編輯器 ────────────────────────────────────────────────
// Product description Summernote editor helpers

/**
 * 判斷 Summernote 是否已在此 textarea 上初始化
 * Check whether Summernote is already initialized on the description field
 */
function isProductDescriptionEditorActive() {
  return $('#newProductDescription').next('.note-editor').length > 0;
}

/**
 * 初始化商品描述富文字編輯器（Modal 顯示後呼叫，避免 Bootstrap 焦點衝突）
 * Initialize Summernote after modal is shown to avoid Bootstrap focus issues
 */
function initProductDescriptionEditor() {
  var $el = $('#newProductDescription');
  if (!$el.length || isProductDescriptionEditorActive()) {
    return;
  }

  $el.summernote({
    lang: 'zh-TW',
    height: 280,
    placeholder: '請填入商品描述',
    dialogsInBody: true,
    toolbar: [
      ['style', ['style']],
      ['font', ['bold', 'italic', 'underline', 'clear']],
      ['fontname', ['fontname']],
      ['fontsize', ['fontsize']],
      ['color', ['color']],
      ['para', ['ul', 'ol', 'paragraph']],
      ['table', ['table']],
      ['insert', ['link', 'picture', 'video', 'hr']],
      ['view', ['fullscreen', 'codeview', 'help']]
    ],
    callbacks: {
      onInit: function () {
        if (!window.canEdit('products')) {
          $el.summernote('disable');
        }
      }
    }
  });
}

/**
 * 銷毀編輯器並把 HTML 寫回 textarea（Modal 關閉時呼叫）
 * Destroy editor and sync HTML back to the underlying textarea
 */
function destroyProductDescriptionEditor() {
  var $el = $('#newProductDescription');
  if (!isProductDescriptionEditorActive()) {
    return;
  }

  var html = $el.summernote('code');
  $el.summernote('destroy');
  $el.val(html);
}

/**
 * 取得商品描述 HTML（空內容時回傳空字串）
 * Get description HTML; normalize Summernote empty states to ''
 */
function getProductDescriptionHtml() {
  var $el = $('#newProductDescription');
  var html = isProductDescriptionEditorActive()
    ? $el.summernote('code')
    : $el.val();

  html = (html || '').trim();
  if (!html || html === '<p><br></p>' || html === '<p></p>' || html === '<br>') {
    return '';
  }
  return html;
}

/**
 * 設定商品描述內容（編輯器未初始化時先寫入 textarea）
 * Set description content; works before or after Summernote init
 */
function setProductDescriptionHtml(html) {
  var $el = $('#newProductDescription');
  var content = html || '';

  if (isProductDescriptionEditorActive()) {
    $el.summernote('code', content);
  } else {
    $el.val(content);
  }
}

/**
 * 綁定商品 Modal 的 Summernote 生命週期事件
 * Bind Summernote init/destroy to add-product modal show/hide events
 */
function bindProductDescriptionEditorEvents() {
  var $modal = $('#addProductModal');
  $modal.off('.productsSummernote');
  $modal.on('shown.bs.modal.productsSummernote', function () {
    initProductDescriptionEditor();
  });
  $modal.on('hidden.bs.modal.productsSummernote', function () {
    destroyProductDescriptionEditor();
  });
}

// ── 最低庫存功能全域狀態 ──────────────────────────────────────────────────────
// Min-stock feature global state

// 從 min_stock.json 載入的最低庫存快取
// Cache loaded from min_stock.json: { store: { P001: { main:5, ... } }, rental: {...} }
var adminMinStockCache = {};

// 是否目前處於「最低庫存設定模式」
// Whether the table is currently showing the min-stock edit mode
var isMinStockMode = false;

/**
 * 商店表格 colspan：最低庫存模式多一欄「修改」。
 * Store table colspan: +1 edit column in min-stock mode.
 */
function getStoreTableColspan() {
  return isMinStockMode ? 10 : 9;
}

/**
 * 租借表格 colspan：6 個 sticky 欄 + 動態營區欄 +（最低庫存模式）「修改」欄。
 * Rental table colspan: 6 sticky cols + dynamic camp cols + optional edit col.
 */
function getRentalTableColspan() {
  var campCount = rentalTableCampColumnIds.length || ADMIN_RENTAL_CAMP_IDS.length;
  var stickyCount = 6;
  var total = stickyCount + campCount;
  return isMinStockMode ? total + 1 : total;
}

/**
 * 租借表頭營區欄位 ID：僅固定 C001–C009（含租借主倉）。
 * Rental table camp column IDs: preset C001–C009 only (includes rental warehouse).
 *
 * @param {Array} [_rentals] - 保留參數以相容既有呼叫 / kept for call-site compatibility
 * @returns {string[]}
 */
function collectRentalCampColumnIds(_rentals) {
  return ADMIN_RENTAL_CAMP_IDS.slice();
}

/** 營區欄短標籤（表頭 / 步進器）/ Short camp column label for table header */
function getRentalCampColumnLabel(campId) {
  return ADMIN_RENTAL_CAMP_LABELS[campId] || String(campId);
}

/** 營區欄完整名稱（title 提示）/ Full camp name for title tooltip */
function getRentalCampColumnTitle(campId) {
  return ADMIN_RENTAL_CAMP_FULL_NAMES[campId] || String(campId);
}

/**
 * 動態重建租借表「可捲動營區欄」表頭（sticky 欄與分類/品牌篩選保留在 HTML）。
 * Rebuild scrollable camp column headers; sticky cols and filter dropdowns stay in HTML.
 *
 * @param {string[]} campColumnIds
 */
function renderRentalCampTableHeadCells(campColumnIds) {
  var $row = $('#rentalProductsTableHeadRow');

  if (!$row.length) {
    return;
  }

  rentalTableCampColumnIds = (campColumnIds && campColumnIds.length)
    ? campColumnIds.slice()
    : ADMIN_RENTAL_CAMP_IDS.slice();

  $row.find('th.scrollable-stock-col').remove();

  var campHeadHtml = rentalTableCampColumnIds.map(function (campId) {
    var label = escapeHtml(getRentalCampColumnLabel(campId));
    var title = escapeHtml(getRentalCampColumnTitle(campId));

    return '<th class="scrollable-stock-col" title="' + title + '">' + label + '</th>';
  }).join('');

  var $editCol = $row.find('th.min-stock-edit-col');

  if ($editCol.length) {
    $editCol.before(campHeadHtml);
  } else {
    $row.append(campHeadHtml);
  }
}

/**
 * 依 campColumnIds 順序產生租借列的營區庫存儲存格 HTML。
 * Build rental row camp stock cells in column order.
 */
function buildRentalCampStockCellsHtml(rental, campColumnIds, campByKey, lowCampKeys) {
  return (campColumnIds || []).map(function (campId) {
    return buildRentalStockCell(
      rental,
      campId,
      getRentalCampColumnLabel(campId),
      campByKey,
      lowCampKeys
    );
  }).join('');
}

// 找不到對應設定時使用的預設最低庫存值
// Default minimum stock value when no specific setting is found
var PRODUCT_MIN_STOCK_DEFAULT = 5;
// 租借待處理的庫存異動明細（與商店的 pendingMovementItems 分開追蹤）
// Pending rental movement items, tracked separately from store items
var pendingRentalMovementItems = [];

/**
 * 前端營地 ID（C001）→ API 庫位 ID（RENTAL-C001）。
 * Map UI camp id to inventory_locations.id for rental domain.
 */
function toApiMinStockLocationId(inventoryType, locationId) {
  if (inventoryType === 'rental' && /^C00[1-9]$/.test(String(locationId || ''))) {
    return 'RENTAL-' + locationId;
  }
  return locationId;
}

/**
 * API 庫位 ID（RENTAL-C001）→ 前端營地 ID（C001）。
 * Map inventory_locations.id back to UI camp id.
 */
function fromApiMinStockLocationId(inventoryType, locationId) {
  var id = String(locationId || '');
  if (inventoryType === 'rental' && id.indexOf('RENTAL-') === 0) {
    return id.slice('RENTAL-'.length);
  }
  return locationId;
}

/**
 * 把後端 min-stocks 陣列轉成 adminMinStockCache 形狀。
 * Convert API items into nested cache: domain → productId → variantId → locationId.
 *
 * @param {Array} items
 * @returns {{ store: Object, rental: Object }}
 */
function buildMinStockCacheFromApiItems(items) {
  var cache = { store: {}, rental: {} };
  (items || []).forEach(function (item) {
    if (!item || !item.inventoryDomain || !item.productId || !item.variantId || !item.locationId) {
      return;
    }
    var domain = item.inventoryDomain;
    if (domain !== 'store' && domain !== 'rental') {
      return;
    }
    var locationId = fromApiMinStockLocationId(domain, item.locationId);
    if (!cache[domain][item.productId]) {
      cache[domain][item.productId] = {};
    }
    if (!cache[domain][item.productId][item.variantId]) {
      cache[domain][item.productId][item.variantId] = {};
    }
    cache[domain][item.productId][item.variantId][locationId] = normalizeStockValue(item.minimumQuantity);
  });
  return cache;
}

/**
 * 正式模式載入 store（＋若之後開放租借）最低庫存。
 * Load min-stocks from backend for the products page.
 *
 * @returns {Promise<{store: Object, rental: Object}>}
 */
function loadAdminMinStockCacheFromBackend() {
  // 目前正式模式只顯示商店頁；仍預先載入 store 閾值
  // Backend mode currently shows store only; preload store thresholds
  return AdminAPI.minStocks.list({ inventoryDomain: 'store' })
    .then(function (response) {
      var items = (response && response.data) || [];
      return buildMinStockCacheFromApiItems(items);
    })
    .catch(function (error) {
      AdminAPI.handleError(error, '載入最低庫存設定失敗');
      return { store: {}, rental: {} };
    });
}

/**
 * 取得指定商品、指定分店 / 營地的最低庫存閾值。
 * 若 adminMinStockCache 裡找不到對應的值，回傳全域預設值 PRODUCT_MIN_STOCK_DEFAULT。
 *
 * Get the minimum stock threshold for a given product and location.
 * Falls back to PRODUCT_MIN_STOCK_DEFAULT if not found in adminMinStockCache.
 *
 * @param {string} productType  - 'store' 或 'rental'
 * @param {string} productId    - 商品 ID，例如 'P001' / 'R001'
 * @param {string} locationId   - 分店 / 營地 ID，例如 'branch-001' / 'camp-001'
 * @param {string} [variantId]  - 規格 ID（可選；支援 min_stock.json 規格層級）
 * @returns {number} 最低庫存值（整數，≥ 0）
 */
function getMinStockValue(productType, productId, locationId, variantId) {
  var typeCache    = adminMinStockCache[productType] || {};
  var productCache = typeCache[productId] || {};

  // 新格式：productCache[variantId][locationId]
  // New format: per-variant thresholds
  if (variantId && productCache[variantId] && typeof productCache[variantId] === 'object') {
    var variantVal = productCache[variantId][locationId];
    if (variantVal !== undefined) {
      var parsedVariant = parseInt(variantVal, 10);
      return isNaN(parsedVariant) ? PRODUCT_MIN_STOCK_DEFAULT : Math.max(parsedVariant, 0);
    }
  }

  // 舊格式：productCache[locationId]（商品層級，向後相容）
  // Legacy format: product-level location keys
  var val = productCache[locationId];

  if (val !== undefined && !isLocationStockMap(productCache)) {
    var parsed = parseInt(val, 10);
    return isNaN(parsed) ? PRODUCT_MIN_STOCK_DEFAULT : Math.max(parsed, 0);
  }

  return PRODUCT_MIN_STOCK_DEFAULT;
}

/**
 * 取得商店商品中庫存低於最低值的分店 ID 陣列。
 * Returns an array of branchIds where actual stock < minimum stock.
 *
 * @param {Object} product - 商店商品物件
 * @returns {string[]}
 */
function getLowBranchIds(product) {
  if (!product) { return []; }

  var variants = normalizeProductVariants(product);

  function isBranchLow(branchId) {
    return variants.some(function (variant) {
      var qty = normalizeStockValue((variant.branch || {})[branchId]);
      return qty < getMinStockValue('store', product.id, branchId, variant.id);
    });
  }

  return ADMIN_PRODUCT_BRANCH_IDS.filter(isBranchLow);
}

/**
 * 取得租借商品中庫存低於最低值的營地 key 陣列。
 * Returns an array of campKeys where actual stock < minimum stock.
 *
 * @param {Object} rental - 租借商品物件（含 campByKey 欄位）
 * @returns {string[]}
 */
function getLowCampKeys(rental) {
  if (!rental) { return []; }

  var normalizedRental = normalizeRentalItem(rental);
  var variants = normalizeRentalVariants(normalizedRental);
  var campByKey = normalizedRental.campByKey || {};

  return ADMIN_RENTAL_CAMP_IDS.filter(function (key) {
    return variants.some(function (variant) {
      var qty = normalizeStockValue((variant.camp || {})[key]);
      return qty < getMinStockValue('rental', normalizedRental.id, key, variant.id);
    });
  });
}

window.initProducts = function () {
  $(document).off('.products');

  syncBackendProductUi();
  bindCatalogMasterUi();

  // 每次進入重置分類 / 品牌篩選
  productFilterState = { category: [], brand: [] };

  // 切換到商品頁時，最低庫存模式重置為正常模式，避免狀態殘留
  // Reset min-stock mode when navigating back to products page
  isMinStockMode = false;

  bindProductViewTabs();

  // 進頁即更新租借表營區表頭（取代 HTML 寫死的舊假名）
  // Refresh rental camp headers on entry (replaces stale hardcoded names in HTML)
  renderRentalCampTableHeadCells(ADMIN_RENTAL_CAMP_IDS.slice());

  // ── 讀取並消費 pendingNavFilter（從 KPI 卡片「低庫存商品」跳來時） ──
  var _showLowStock = false;
  if (window.pendingNavFilter && window.pendingNavFilter.section === 'products') {
    _showLowStock           = !!window.pendingNavFilter.lowStockOnly;
    window.pendingNavFilter = null; // 消費後立即清除
  }

  // 並行載入 products.json 與 min_stock.json，兩者都就緒後才渲染表格。
  // min_stock.json 載入失敗時靜默降級，全部使用預設值 PRODUCT_MIN_STOCK_DEFAULT。
  // Load products.json and min_stock.json in parallel; render only when both are ready.
  // If min_stock.json fails, silently fall back to PRODUCT_MIN_STOCK_DEFAULT for all items.
  var productsDeferred = $.Deferred();
  loadAdminJsonResource({
    adminList: AdminAPI && AdminAPI.products && AdminAPI.products.list,
    // Admin keeps its inventory/rental fixture separate from the public API product contract.
    jsonPath: MockDataPaths.adminProducts || MockDataPaths.products,
    emptyValue: [],
    errorMessage: '載入商品失敗',
    onSuccess: function (data) { productsDeferred.resolve(data); },
    onError: function () { productsDeferred.resolve([]); }
  });

  // 正式模式從後端載入分類與品牌 ID，Mock 模式沿用本地顯示值。
  var lookupsDeferred = $.Deferred();
  if (isAdminProductBackendEnabled()) {
    AdminAPI.products.getLookups()
      .then(function (response) {
        lookupsDeferred.resolve((response && response.data) || { categories: [], brands: [] });
      })
      .catch(function (error) {
        AdminAPI.handleError(error, '載入商品分類與品牌失敗');
        lookupsDeferred.resolve({ categories: [], brands: [] });
      });
  } else {
    lookupsDeferred.resolve(null);
  }

  var minStockPromise = isAdminProductBackendEnabled()
    ? loadAdminMinStockCacheFromBackend()
    : $.getJSON(MockDataPaths.minStock).then(null, function () {
      // 靜默降級：min_stock.json 不存在或格式錯誤時，回傳空物件
      return $.Deferred().resolve({}).promise();
    });

  $.when(
    productsDeferred.promise(),
    minStockPromise,
    lookupsDeferred.promise()
  ).done(function (productsResult, minStockResult, lookupsResult) {
    // Ajax 回傳 [data, status, jqXHR]；自訂 deferred 直接回傳 data 陣列
    function unwrapAjaxResult(result) {
      if (Array.isArray(result) && result.length >= 1 && Array.isArray(result[0])) {
        return result[0];
      }
      return result;
    }
    var products = unwrapAjaxResult(productsResult);
    var minStock = unwrapAjaxResult(minStockResult);

    if (lookupsResult) {
      adminProductLookups = lookupsResult;
    }

    adminMinStockCache = (minStock && typeof minStock === 'object') ? minStock : {};
    adminProductsCache = (Array.isArray(products) ? products : []).map(function (product) {
      return isAdminProductBackendEnabled()
        ? mapAdminProductResponse(product)
        : normalizeProductBranch(product);
    });
    loadProductFormComboboxOptions();
    applyProductCategoryFilterAndRender();

    // 低庫存導航：渲染完成後，捲動到第一列含紅色庫存數字的商品並顯示提示
    if (_showLowStock) {
      // 稍微延遲確保 DOM 已完整插入
      setTimeout(function () {
        var $firstLowStock = $('#productsTableBody tr').has('.stock-display-value.text-danger').first();
        if ($firstLowStock.length) {
          // 滾動到低庫存列（目標列上方保留 64px 間距，避免被 topbar 遮住）
          $('html, body').animate({
            scrollTop: $firstLowStock.offset().top - 64
          }, 300);
          window.showAdminToast('已標示庫存不足的商品（紅色數字）', 'info');
        } else {
          window.showAdminToast('目前所有商品庫存充足', 'info');
        }
      }, 100);
    }
  }).fail(function () {
    $('#productsTableBody').html(
      '<tr><td colspan="' + getStoreTableColspan() + '" class="text-center text-danger py-4">' +
      '<i class="fas fa-exclamation-triangle me-2"></i>載入商品數據失敗' +
      '</td></tr>'
    );
  });

  // 頁面初始化時即預載租借資料（Eager Loading）
  // 確保使用者尚未切換到租借頁籤就開啟調撥 Modal 時，adminRentalsCache 已可用
  // loadRentalProducts() 內有 adminRentalsLoaded 冪等保護，不會重複請求
  loadRentalProducts();

  bindProductFormComboboxEvents();
  resetProductComboboxFields();

  bindProductDescriptionEditorEvents();

  // ── 分類篩選：點漏斗開關 dropdown ──
  $(document).on('click.products',
    '#productsTable .filter-icon, #rentalProductsTable .filter-icon',
    function (e) {
      e.stopPropagation();
      var $dropdown = $(this).closest('.filter-th').find('.filter-dropdown');
      $('#productsTable .filter-dropdown, #rentalProductsTable .filter-dropdown')
        .not($dropdown)
        .addClass('d-none');
      $dropdown.toggleClass('d-none');
    }
  );

  $(document).on('click.products',
    '#productsTable .filter-dropdown, #rentalProductsTable .filter-dropdown',
    function (e) { e.stopPropagation(); }
  );

  $(document).on('change.products',
    '#productsTable .filter-dropdown input, #rentalProductsTable .filter-dropdown input',
    function () {
      var $th = $(this).closest('.filter-th');
      var filterKey = $th.data('filter-key');

      if (filterKey === 'brand') {
        collectProductBrandFilter($th);
      } else {
        collectProductCategoryFilter($th);
      }

      applyProductCategoryFilterAndRender();
    }
  );

  $(document).on('click.products', '#btnClearProductFilters', function () {
    productFilterState = { category: [], brand: [] };
    applyProductCategoryFilterAndRender();
  });

  $(document).on('click.products', function () {
    $('#productsTable .filter-dropdown, #rentalProductsTable .filter-dropdown')
      .addClass('d-none');
  });

  // ── 最低庫存設定模式切換 ──────────────────────────────────────────────────
  // Min-stock mode toggle: switch between normal stock view and minimum threshold edit view
  $(document).on('click.products', '#toggleMinStockMode', function () {
    isMinStockMode = !isMinStockMode;
    updateMinStockModeUI();
    // 重新渲染目前可見的頁籤表格（保留分類篩選）
    applyProductCategoryFilterAndRender();
  });

  // 從列表開啟新增商品 Modal 時，清空上一次編輯狀態
  $(document).on('click.products', '[data-bs-target="#addProductModal"]', function () {
    resetProductModalForm();
  });

  // 選擇新圖片時追加至列表並更新預覽 / Append newly selected files to image list
  $(document).on('change.products', '#newProductImages', function () {
    appendNewProductImageFiles(this.files);
  });

  // 正式模式以圖片 URL 加入預覽，實際上傳功能留待 Cloud Storage 線程。
  $(document).on('click.products', '#addBackendProductImageUrl', function () {
    var url = String($('#backendProductImageUrl').val() || '').trim();
    if (!url || !(url.indexOf('/assets/') === 0 || /^https?:\/\//i.test(url))) {
      window.showAdminToast('圖片網址必須使用 /assets/... 或 http(s)', 'danger');
      return;
    }
    var $form = $('#addProductForm');
    var items = getProductImageItems($form);
    if (!items.some(function (item) { return item.src === url; })) {
      items.push({ id: 'path:' + url, type: 'path', src: url });
      setProductImageItems($form, items);
    }
    $('#backendProductImageUrl').val('');
    refreshProductImagePreviews();
  });

  // 移除預覽圖（X 按鈕）/ Remove image from list
  $(document).on('click.products', '.product-image-remove-btn', function (e) {
    e.preventDefault();
    e.stopPropagation();
    handleProductImageRemove(String($(this).data('item-id') || ''));
  });

  // 新增商品 Modal：切換租借商品 switch
  // 行為依目前模式而異：
  //   新增模式 → 阻止切為 ON（租借商品不可手動新增，需透過商店商品編輯設定）
  //   商店編輯模式 → ON：顯示租借營地設定；OFF：驗證所有租借庫存為 0 後才可切換
  //   租借編輯模式 → switch 不顯示，此 handler 不應被觸發
  $(document).on('change.products', '#newProductIsRental', function () {
    var $form = $('#addProductForm');
    var editType = $form.data('edit-type') || 'store';
    var editProductId = $form.data('edit-product-id');
    var isChecked = $(this).is(':checked');

    // ── 新增模式（無 edit-product-id）──────────────────────────────────────
    // Add mode: prevent switch from being turned ON
    if (!editProductId) {
      if (isChecked) {
        $(this).prop('checked', false);
        window.showAdminToast('租借商品請透過商店商品名稱點擊編輯設定，不可在新增時直接切換', 'warning');
      }
      return;
    }

    // ── 商店編輯模式 ────────────────────────────────────────────────────────
    if (editType === 'store') {
      if (isChecked) {
        // ON：載入或建立租借資料，顯示營地設定區塊
        var product = findAdminProductById(editProductId);
        var existingRentalId = product ? product.rentalId : null;
        if (existingRentalId) {
          var linkedRental = findAdminRentalById(existingRentalId);
          syncRentalFormState(true, true, true);
          if (linkedRental) {
            populateRentalVariantCards(linkedRental, product);
          } else {
            syncRentalVariantCardsFromStoreVariants();
          }
        } else {
          syncRentalFormState(true, true, true);
          syncRentalVariantCardsFromStoreVariants();
        }
      } else {
        // OFF：驗證所有租借規格營地數量皆為 0，才允許切換
        var allZero = true;
        $('#rentalVariantStockList .variant-camp-qty-input').each(function () {
          if (normalizeStockValue($(this).val()) > 0) {
            allZero = false;
            return false;
          }
        });

        if (!allZero) {
          $(this).prop('checked', true);
          window.showAdminToast('請先將所有租借規格營地庫存歸零，才能停用租借商品設定', 'danger');
          return;
        }

        // 允許切換：隱藏營地區塊
        syncRentalFormState(false, false, true);
      }
    }
  });

  // 新增規格卡片 / Add variant stock card
  $(document).on('click.products', '#addProductVariant', function () {
    addProductVariantCard(null, getProductModalStockMode());
    $('#productVariantCardList .variant-stock-card:last .variant-color').trigger('focus');
  });

  // 刪除規格卡片 / Remove variant card
  $(document).on('click.products', '.remove-product-variant-btn', function () {
    var $card = $(this).closest('.variant-stock-card');
    var cardCount = $('#productVariantCardList .variant-stock-card').length;

    if (cardCount <= 1) {
      window.showAdminToast('至少需要保留一個規格', 'warning');
      return;
    }

    var total = parseInt($card.find('.variant-total-display').text(), 10) || 0;
    if (total > 0) {
      window.showAdminToast(
        '此規格尚有庫存 ' + total + ' 件，請先將庫存歸零後再刪除',
        'warning'
      );
      return;
    }

    $card.closest('.variant-card-col').remove();
    refreshVariantCardTitles();
    syncRentalVariantCardsFromStoreVariants();
    updateProductTotalStockDisplay();
    syncGlobalStockFieldVisibility();
    syncVariantRemoveButtonState();
  });

  // 規格卡片：顏色/尺寸變更時同步標題與租借標籤
  $(document).on('input.products', '.variant-color, .variant-size', function () {
    refreshVariantCardTitles();
  });

  // 規格卡片：收合/展開庫存區
  $(document).on('click.products', '.variant-collapse-toggle', function () {
    var $card = $(this).closest('.variant-stock-card');
    $card.toggleClass('variant-stock-card-collapsed');
    var collapsed = $card.hasClass('variant-stock-card-collapsed');
    $card.find('.variant-stock-card__body').toggleClass('d-none', collapsed);
    $(this).find('i')
      .toggleClass('fa-chevron-down', collapsed)
      .toggleClass('fa-chevron-up', !collapsed);
  });

  // 租借規格卡片：收合/展開營地庫存區
  $(document).on('click.products', '.rental-variant-collapse-toggle', function () {
    var $card = $(this).closest('.rental-variant-stock-card');
    $card.toggleClass('rental-variant-stock-card-collapsed');
    var collapsed = $card.hasClass('rental-variant-stock-card-collapsed');
    $card.find('.rental-variant-stock-card__body').toggleClass('d-none', collapsed);
    $(this).find('i')
      .toggleClass('fa-chevron-down', collapsed)
      .toggleClass('fa-chevron-up', !collapsed);
  });

  // 列表：展開/收合規格明細子列
  $(document).on('click.products', '.variant-expand-chip', function (e) {
    e.stopPropagation();
    toggleProductVariantExpand($(this).closest('tr'));
  });

  // 規格卡片：庫存輸入即時加總
  $(document).on('input.products', '.variant-main-add-qty, .variant-branch-qty-input', function () {
    updateVariantCardTotal($(this).closest('.variant-stock-card'));
  });

  // 租借規格卡片：庫存輸入即時加總
  $(document).on('input.products', '.variant-camp-qty-input', function () {
    updateRentalVariantCardTotal($(this).closest('.rental-variant-stock-card'));
  });

  // 最低庫存模式：inline 輸入異動時同步 ✓ 按鈕狀態
  // Min-stock mode: sync confirm button when threshold inputs change
  $(document).on('input.products change.products', '.stock-input[data-min-stock-field]', function () {
    var $row = $(this).closest('tr');
    if ($row.hasClass('variant-detail-row')) {
      var productId = $row.data('parent-product-id');
      var inventoryType = $row.data('inventory-type') || 'store';
      var tableBodyId = inventoryType === 'rental' ? '#rentalProductsTableBody' : '#productsTableBody';
      $row = $(tableBodyId + ' tr[data-product-id="' + productId + '"][data-inventory-type="' + inventoryType + '"]');
    }
    syncStockConfirmState($row);
  });

  // 鉛筆：最低庫存模式整列進入編輯 / Pencil → enter min-stock edit mode
  $(document).on('click.products', '.stock-edit-btn', function () {
    if (!isMinStockMode) { return; }
    enterStockEditMode($(this).closest('tr'));
  });

  // X：取消最低庫存編輯並還原 / Cancel min-stock edits
  $(document).on('click.products', '.stock-cancel-btn', function () {
    exitStockEditMode($(this).closest('tr'), true);
  });

  // ✓：儲存最低庫存設定（不走庫存異動流程）/ Save min-stock thresholds only
  $(document).on('click.products', '.stock-confirm-btn', function () {
    if (!isMinStockMode) { return; }

    var $row = $(this).closest('tr');
    var productId = $row.data('product-id');
    var inventoryType = $row.data('inventory-type') || 'store';
    var $detailRows = getVariantDetailRowsForMainRow($row);
    var rawMinValues = $row.add($detailRows).find('.stock-input[data-min-stock-field]').map(function () {
      return $(this).val();
    }).get();

    if (hasNegativeRawStockValues(rawMinValues)) {
      window.showAdminToast('最低庫存不可為負數', 'danger');
      return;
    }

    var $confirmBtn = $(this);
    $confirmBtn.prop('disabled', true);
    // 正式模式：等 API 成功才離開編輯；失敗保留輸入
    // Backend: leave edit mode only after API success
    Promise.resolve(saveMinStockValues($row, productId, inventoryType)).then(function (ok) {
      if (ok !== false) {
        exitStockEditMode($row, false);
      } else {
        syncStockConfirmState($row);
      }
    }).catch(function () {
      syncStockConfirmState($row);
    });
  });

  // 將商店與租借已通過確定檢查的庫存異動，合併成一筆庫存異動紀錄。
  // Merge store and rental pending items into one movement record.
  $(document).on('click.products', '#generateMovementRecord', function () {
    var allItems = pendingMovementItems.concat(pendingRentalMovementItems);

    if (allItems.length === 0) {
      window.showAdminToast('目前沒有可生成的庫存異動明細', 'info');
      return;
    }

    var record = {
      id: window.createMovementRecordId(),
      createdAt: formatMovementDate(new Date()),
      employeeId: getCurrentAdminId(),
      items: allItems
    };

    if (typeof window.addMovementRecord === 'function') {
      window.addMovementRecord(record);
    } else {
      window.generatedMovementRecords = window.generatedMovementRecords || [];
      window.generatedMovementRecords.unshift(record);
    }

    // 清空兩個佇列
    // Clear both store and rental pending queues
    pendingMovementItems = [];
    pendingRentalMovementItems = [];
    updateMovementGenerateButtonState();
    window.showAdminToast('已產生庫存異動紀錄 ' + window.formatMovementId(record.id));
  });

  // 調撥按鈕（租借 tab）：找對應商店商品（mock: rentalId；backend: itemId），再開啟調撥 Modal
  // Transfer button (rental tab): resolve linked store product, then open transfer modal
  $(document).on('click.products', '.transfer-from-rental-btn', function () {
    var rentalId = $(this).data('rental-id');
    var rental = findAdminRentalById(rentalId);
    var storeProduct = findStoreProductByRentalId(rentalId);
    if (!storeProduct && rental && rental.itemId) {
      storeProduct = findStoreProductByItemId(rental.itemId);
    }
    if (storeProduct) {
      // 確保租借快取已載入（Backend 可能尚未切過租借 tab）
      var openModal = function () {
        openTransferToRentalModal(storeProduct.id);
      };
      if (isAdminProductBackendEnabled() && !adminRentalsLoaded) {
        loadRentalProducts();
        // 簡單延遲：load 是 async；改用短輪詢／再點一次會比較穩，這裡直接等 list then
        AdminAPI.rentals.list({ page: 0, size: 100, sort: 'id,asc' })
          .then(function (response) {
            adminRentalsCache = ((response && response.data) || []).map(mapAdminRentalResponse);
            adminRentalsLoaded = true;
            openModal();
          })
          .catch(function (error) {
            AdminAPI.handleError(error, '載入租借商品失敗');
          });
        return;
      }
      openModal();
    } else {
      window.showAdminToast('此租借商品無對應的商店商品，無法從分店調撥', 'warning');
    }
  });

  // 上架定價（租借 tab，正式模式）
  $(document).on('click.products', '.rental-listings-btn', function () {
    var rentalId = $(this).data('rental-id');
    openRentalListingsModal(rentalId);
  });

  $(document).on('change.products', '#rentalListingVariantSelect', function () {
    // 切換規格前先把目前列寫回暫存，避免未存檔內容遺失
    persistCurrentRentalListingRowsToState();
    renderRentalListingRowsForSelectedVariant();
  });

  $(document).on('click.products', '#submitRentalListings', function () {
    submitRentalListingsModal();
  });

  // 規格切換：更新來源分店庫存顯示與各營地「目前庫存」列
  // Variant change: refresh branch stock display and camp current-qty rows
  $(document).on('change.products', '#transferVariantSelect', function () {
    onTransferVariantChange();
  });

  // 來源分店切換：依選取值切換 Mode 1（分店→營地）或 Mode 2（營地互轉）
  // Source branch changed: switch between Mode 1 (branch→camp) and Mode 2 (camp transfer)
  $(document).on('change.products', '#transferSourceBranch', function () {
    var val = $(this).val();
    if (val === 'camp-transfer') {
      switchTransferMode('camp');
    } else {
      switchTransferMode('branch');
    }
  });

  // 更動數量（delta）輸入：即時更新計數器
  // Delta input: update counter on every keystroke
  $(document).on('input.products', '.transfer-camp-delta', function () {
    syncTransferDeltaCounter();
  });

  // 確認調撥
  $(document).on('click.products', '#submitTransferToRental', function () {
    submitTransferToRental();
  });

  // 編輯商品：點擊商品名稱開啟新增商品 Modal，並從快取帶入資料
  $(document).on('click.products', '.edit-product-name', function () {
    var $row = $(this).closest('tr');
    var inventoryType = $row.data('inventory-type') || 'store';
    var productId = $row.data('product-id');

    if (inventoryType === 'rental') {
      var rental = findAdminRentalById(productId);

      if (!rental) {
        window.showAdminToast('找不到租借商品 ' + productId + ' 的資料', 'danger');
        return;
      }

      // 正式模式：名稱點擊改開「上架定價」Modal（舊 addProductModal 欄位模型不符）
      if (isAdminProductBackendEnabled()) {
        openRentalListingsModal(productId);
        return;
      }

      fillRentalModal(rental);
      bootstrap.Modal.getOrCreateInstance(document.getElementById('addProductModal')).show();
      return;
    }

    var product = findAdminProductById(productId);

    if (!product) {
      window.showAdminToast('找不到商品 ' + productId + ' 的資料', 'danger');
      return;
    }

    fillProductModal(product);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('addProductModal')).show();
  });

  // 新增一列規格（舊 handler 已改為 variant card，保留避免重複綁定）
  // Legacy variant row handlers removed — see variant card handlers above.

  // 新增商品
  $(document).on('click.products', '#submitAddProduct', function () {
    var name               = $('#newProductName').val().trim();
    var brand              = getProductComboboxValue('brand');
    var price              = parseInt($('#newProductPrice').val(), 10) || 0;
    var stock              = parseInt($('#newProductStock').val(), 10) || 0;
    var category           = getProductComboboxValue('category') || '其他';
    var isRental           = $('#newProductIsRental').is(':checked');
    var description    = getProductDescriptionHtml();
    var $form = $('#addProductForm');
    var editProductId = $form.data('edit-product-id');
    var existingStatus = $form.data('existing-status') || 'active';
    var editType = $form.data('edit-type') || 'store';
    var stockMode = editProductId ? 'edit' : 'add';

    // ── 路徑判斷：租借編輯 vs 商店（新增 or 編輯）──────────────────────────
    // Route: rental edit path OR store path (new/edit)
    // 租借編輯：editType === 'rental'
    // 商店新增/編輯：其他情況（含商店編輯時 switch ON 狀態）
    var isRentalEditPath = (editType === 'rental');

    // 正式模式使用精簡 Request，等待 API 成功後才更新畫面快取。
    if (isAdminProductBackendEnabled()) {
      submitBackendProductForm(editType === 'store' ? editProductId : null);
      return;
    }

    // 驗證：名稱必填；非租借編輯路徑時售價也必填
    if (!name || (!isRentalEditPath && price <= 0)) {
      window.showAdminToast(isRentalEditPath ? '請填寫商品名稱' : '請填寫商品名稱和有效的價格', 'danger');
      return;
    }

    if (isRentalEditPath) {
      var rentalEditId = editProductId;
      var rentalVariantState = collectRentalVariantsWithStock();
      var rentalVariants = rentalVariantState.variants;
      var rentalCamps;

      if (rentalEditId) {
        if (hasNegativeRawStockValues(rentalVariantState.rawValues)) {
          window.showAdminToast('庫存數量不可為負數', 'danger');
          return;
        }
        rentalCamps = aggregateRentalCampFromVariants(rentalVariants);
      } else {
        if (hasNegativeRawStockValues([$('#newRentalWarehouseStock').val()])) {
          window.showAdminToast('庫存數量不可為負數', 'danger');
          return;
        }
        var rentalWarehouseQty = normalizeStockValue($('#newRentalWarehouseStock').val());
        rentalCamps = buildInitialRentalCamps(rentalWarehouseQty);
        rentalVariants = [{
          id: generateVariantId(),
          color: '',
          size: '',
          label: '預設規格',
          camp: (function () {
            var campStock = createEmptyCampStock();
            campStock[ADMIN_RENTAL_WAREHOUSE_ID] = rentalWarehouseQty;
            return campStock;
          })(),
          total: rentalWarehouseQty
        }];
      }

      var oldRentalForMovement = rentalEditId ? findAdminRentalById(rentalEditId) : null;
      var rentalMovementItemsToAdd = [];

      if (rentalEditId && oldRentalForMovement) {
        var rentalMovementResult = buildMovementItemsForVariantRentalChange(oldRentalForMovement, rentalVariants);
        if (!rentalMovementResult.valid) {
          window.showAdminToast(rentalMovementResult.message, 'danger');
          return;
        }
        rentalMovementItemsToAdd = rentalMovementResult.items;
      }

      var rentalItem = {
        id: rentalEditId || 'R-NEW-' + Date.now(),
        image: resolveRentalImageForSave($form),
        name: name,
        brand: brand,
        category: category || '其他',
        variants: rentalVariants,
        camp: rentalCamps
      };

      rentalItem = upsertAdminRentalCache(rentalItem);
      syncLinkedStoreProductBrand(rentalItem.id, brand);

      if (rentalMovementItemsToAdd.length > 0) {
        pendingRentalMovementItems = pendingRentalMovementItems.concat(rentalMovementItemsToAdd);
        updateMovementGenerateButtonState();
      }

      applyProductCategoryFilterAndRender();
      loadProductFormComboboxOptions();

      resetProductModalForm();
      switchProductView('rental');
      var rentalModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('addProductModal'));
      rentalModal.hide();
      window.showAdminToast('租借商品「' + name + '」已' + (editProductId ? '更新' : '新增'));
      return;
    }

    var storeEditId = editType === 'store' ? editProductId : null;
    var variantState = getProductVariantsWithStock(stockMode);
    var variants = variantState.variants;

    if (!variants.length) {
      window.showAdminToast('請至少新增一筆規格', 'danger');
      return;
    }

    if (variantState.duplicateLabel) {
      window.showAdminToast('規格「' + variantState.duplicateLabel + '」重複，請修改', 'danger');
      return;
    }

    if (hasNegativeRawStockValues(variantState.rawValues)) {
      window.showAdminToast('庫存數量不可為負數', 'danger');
      return;
    }

    var newBranchStock = aggregateBranchFromVariants(variants);
    var newTotalStock = aggregateTotalFromVariants(variants);
    var resolvedImages = resolveProductImagesForSave($form);
    var oldProductForSave = storeEditId ? findAdminProductById(storeEditId) : null;
    var newProduct = {
      id: storeEditId || 'P-NEW-' + Date.now(),
      image: resolvedImages.image,
      name: name,
      brand: brand,
      category: category || '其他',
      spec: variants.length ? variants[0].label : '',
      variants: variants,
      description: description,
      price: price,
      totalStock: newTotalStock,
      branch: newBranchStock,
      status: $('#newProductStatus').val() || existingStatus,
      images: resolvedImages.images,
      specifications: cleanLegacySpecifications(
        oldProductForSave ? oldProductForSave.specifications : {}
      )
    };

    if (storeEditId) {
      var oldProduct = oldProductForSave;
      if (oldProduct) {
        var movementResult = buildMovementItemsForVariantBranchChange(oldProduct, variants);
        if (!movementResult.valid) {
          window.showAdminToast(movementResult.message, 'danger');
          return;
        }
        if (movementResult.items.length > 0) {
          pendingMovementItems = pendingMovementItems.concat(movementResult.items);
          updateMovementGenerateButtonState();
        }
      }
    }

    // ── CHG-04：管理 rentalId / rentalEnabled ──────────────────────────────
    if (storeEditId) {
      var oldStoreProduct = findAdminProductById(storeEditId);
      if (isRental) {
        var existingRentalId = oldStoreProduct ? oldStoreProduct.rentalId : null;
        var newRentalId = existingRentalId || ('R-NEW-' + Date.now());
        var rentalVariantStateForStore = collectRentalVariantsWithStock();
        var rentalVariantsForStore = rentalVariantStateForStore.variants;

        if (hasNegativeRawStockValues(rentalVariantStateForStore.rawValues)) {
          window.showAdminToast('庫存數量不可為負數', 'danger');
          return;
        }
        var storeLinkedRentalItem = {
          id: newRentalId,
          image: resolvedImages.image,
          name: name,
          brand: brand,
          category: category || '其他',
          variants: rentalVariantsForStore,
          camp: aggregateRentalCampFromVariants(rentalVariantsForStore)
        };

        var oldLinkedRental = existingRentalId ? findAdminRentalById(existingRentalId) : null;
        if (oldLinkedRental) {
          var linkedMovementResult = buildMovementItemsForVariantRentalChange(oldLinkedRental, rentalVariantsForStore);
          if (!linkedMovementResult.valid) {
            window.showAdminToast(linkedMovementResult.message, 'danger');
            return;
          }
          if (linkedMovementResult.items.length > 0) {
            pendingRentalMovementItems = pendingRentalMovementItems.concat(linkedMovementResult.items);
            updateMovementGenerateButtonState();
          }
        }

        var savedLinkedRental = upsertAdminRentalCache(storeLinkedRentalItem);
        newProduct.rentalId = savedLinkedRental.id;
        newProduct.rentalEnabled = true;

      } else {
        newProduct.rentalId = oldStoreProduct ? oldStoreProduct.rentalId : null;
        newProduct.rentalEnabled = false;
      }
    } else {
      var autoRentalId = 'R-NEW-' + Date.now();
      var autoRentalVariants = variants.map(function (variant) {
        return {
          id: variant.id,
          color: variant.color,
          size: variant.size,
          label: variant.label,
          camp: createEmptyCampStock(),
          total: 0
        };
      });
      var autoRentalItem = upsertAdminRentalCache({
        id: autoRentalId,
        image: resolvedImages.image,
        name: name,
        brand: brand,
        category: category || '其他',
        variants: autoRentalVariants,
        camp: buildInitialRentalCamps(0)
      });
      newProduct.rentalId = autoRentalItem.id;
      newProduct.rentalEnabled = false;
    }

    upsertAdminProductCache(newProduct);
    applyProductCategoryFilterAndRender();
    loadProductFormComboboxOptions();

    resetProductModalForm();

    var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('addProductModal'));
    modal.hide();

    window.showAdminToast('商品「' + name + '」已' + (editProductId ? '更新' : '新增'));
  });
};

/**
 * 依 isMinStockMode 狀態更新 UI：
 * - 切換按鈕文字、樣式（outline-warning ↔ warning 填色）
 * - 顯示 / 隱藏 #minStockModeHint 提示文字
 * - 表格 thead 加上 / 移除 min-stock-mode-header class（黃色背景）
 * - 整個 table 加上 / 移除 min-stock-mode class
 *
 * Updates UI elements based on the current isMinStockMode state.
 */
function updateMinStockModeUI() {
  var $btn = $('#toggleMinStockMode');

  if (isMinStockMode) {
    // 進入設定模式
    $btn
      .removeClass('btn-outline-warning')
      .addClass('btn-warning')
      .html('<i class="fas fa-times me-1"></i>離開設定模式');

    $('#minStockModeHint').removeClass('d-none');

    // 表格 header 加黃色背景
    $('#productsTable thead, #rentalProductsTable thead')
      .addClass('min-stock-mode-header');

    // 整個 table 加模式 class
    $('#productsTable, #rentalProductsTable')
      .addClass('min-stock-mode');

    $('.min-stock-edit-col').removeClass('d-none');
  } else {
    // 離開設定模式
    $btn
      .removeClass('btn-warning')
      .addClass('btn-outline-warning')
      .html('<i class="fas fa-sliders-h me-1"></i>設定最低庫存');

    $('#minStockModeHint').addClass('d-none');

    $('#productsTable thead, #rentalProductsTable thead')
      .removeClass('min-stock-mode-header');

    $('#productsTable, #rentalProductsTable')
      .removeClass('min-stock-mode');

    $('.min-stock-edit-col').addClass('d-none');
  }
}

/**
 * 儲存最低庫存設定：讀取該列所有分店 / 營地的步進器數值。
 * Mock：寫入 adminMinStockCache；正式模式：PUT /api/admin/min-stocks，成功後才更新 cache。
 * 不產生庫存異動紀錄（pendingMovementItems 不受影響）。
 *
 * Saves minimum stock values. Backend mode persists via AdminAPI.minStocks.upsert.
 *
 * @param {jQuery} $row          - 目標 <tr>
 * @param {string} productId     - 商品 ID
 * @param {string} inventoryType - 'store' 或 'rental'
 * @returns {boolean|Promise<boolean>} 是否儲存成功
 */
function saveMinStockValues($row, productId, inventoryType) {
  if (!productId || !inventoryType) { return false; }

  var $allRows = $row.add(getVariantDetailRowsForMainRow($row));
  var collected = [];
  var fallbackVariantId = resolveSingleVariantIdForMinStock(productId, inventoryType);

  $allRows.find('.stock-input[data-min-stock-field]').each(function () {
    var $input = $(this);
    var fieldId = $input.data('min-stock-field');
    var variantId = $input.data('variant-id') || fallbackVariantId;
    var val = normalizeStockValue($input.val());
    collected.push({
      fieldId: fieldId,
      variantId: variantId ? String(variantId) : '',
      value: val,
      $input: $input
    });
  });

  // 正式模式必須有 variantId（DB 以 variant × location 為 PK）
  // Backend requires variantId because DB PK is (variant, location)
  if (isAdminProductBackendEnabled()) {
    var missingVariant = collected.some(function (item) { return !item.variantId; });
    if (missingVariant) {
      window.showAdminToast('找不到規格 ID，無法儲存最低庫存', 'danger');
      return false;
    }

    var payload = {
      inventoryDomain: inventoryType,
      items: collected.map(function (item) {
        return {
          variantId: item.variantId,
          locationId: toApiMinStockLocationId(inventoryType, item.fieldId),
          minimumQuantity: item.value
        };
      })
    };

    return AdminAPI.minStocks.upsert(payload).then(function (response) {
      applyMinStockValuesToCache(productId, inventoryType, collected);
      // 若後端回傳最新值，再覆蓋一次（保持與 GET 一致）
      var items = (response && response.data) || [];
      if (items.length) {
        var merged = buildMinStockCacheFromApiItems(items);
        if (!adminMinStockCache[inventoryType]) {
          adminMinStockCache[inventoryType] = {};
        }
        Object.keys(merged[inventoryType] || {}).forEach(function (pid) {
          adminMinStockCache[inventoryType][pid] = Object.assign(
            {},
            adminMinStockCache[inventoryType][pid] || {},
            merged[inventoryType][pid]
          );
        });
      }
      syncStockDisplayFromInputs($row);
      window.showAdminToast('商品 ' + productId + ' 最低庫存已儲存');
      return true;
    }).catch(function (error) {
      AdminAPI.handleError(error, '儲存最低庫存失敗');
      return false;
    });
  }

  applyMinStockValuesToCache(productId, inventoryType, collected);
  syncStockDisplayFromInputs($row);
  window.showAdminToast('商品 ' + productId + ' 最低庫存已儲存');
  return true;
}

/**
 * 單規格商品：從 cache 取出唯一 variant.id，供主列 input 補齊。
 * Resolve the only variant id for a single-variant product/rental.
 */
function resolveSingleVariantIdForMinStock(productId, inventoryType) {
  if (inventoryType === 'rental') {
    var rental = findAdminRentalById(productId);
    var rentalVariants = normalizeRentalVariants(normalizeRentalItem(rental || {}));
    return rentalVariants.length === 1 ? (rentalVariants[0].id || '') : '';
  }
  var product = (adminProductsCache || []).find(function (item) {
    return item && item.id === productId;
  });
  var variants = normalizeProductVariants(product || {});
  return variants.length === 1 ? (variants[0].id || '') : '';
}

/**
 * 把收集到的欄位寫入 adminMinStockCache（記憶體）。
 * Write collected min-stock fields into the in-memory cache.
 */
function applyMinStockValuesToCache(productId, inventoryType, collected) {
  if (!adminMinStockCache[inventoryType]) {
    adminMinStockCache[inventoryType] = {};
  }
  if (!adminMinStockCache[inventoryType][productId]) {
    adminMinStockCache[inventoryType][productId] = {};
  }

  collected.forEach(function (item) {
    if (item.variantId) {
      if (!adminMinStockCache[inventoryType][productId][item.variantId]) {
        adminMinStockCache[inventoryType][productId][item.variantId] = {};
      }
      adminMinStockCache[inventoryType][productId][item.variantId][item.fieldId] = item.value;
    } else {
      adminMinStockCache[inventoryType][productId][item.fieldId] = item.value;
    }
    item.$input
      .attr('data-original-qty', item.value)
      .data('original-qty', item.value);
  });
}

function bindProductViewTabs() {
  $(document).on('click.products', '.admin-product-tab', function () {
    switchProductView($(this).data('products-view'));
  });
}

function switchProductView(view) {
  var nextView = view === 'rental' ? 'rental' : 'store';

  $('.admin-product-tab')
    .removeClass('active')
    .attr('aria-selected', 'false');

  $('.admin-product-tab[data-products-view="' + nextView + '"]')
    .addClass('active')
    .attr('aria-selected', 'true');

  $('.admin-products-panel').each(function () {
    var $panel = $(this);
    $panel.toggleClass('d-none', $panel.data('products-panel') !== nextView);
  });

  if (nextView === 'rental') {
    loadRentalProducts();
  }
}

function loadRentalProducts() {
  // Mock：已載入就只重繪；Backend：每次進入都重抓（避免殘留假 cache）
  // Mock: skip refetch if loaded; Backend: always refetch from API
  if (adminRentalsLoaded && !isAdminProductBackendEnabled()) {
    loadProductFormComboboxOptions();
    applyProductCategoryFilterAndRender();
    return;
  }

  $('#rentalProductsTableBody').html(
    '<tr><td colspan="' + getRentalTableColspan() + '" class="text-center py-4">' +
    '<div class="spinner-border spinner-border-sm me-2" style="color: var(--admin-brand-accent);"></div>' +
    '<span class="text-muted">載入租借商品中...</span>' +
    '</td></tr>'
  );

  if (isAdminProductBackendEnabled()) {
    AdminAPI.rentals.list({ page: 0, size: 100, sort: 'id,asc' })
      .then(function (response) {
        var rows = (response && response.data) || [];
        adminRentalsCache = rows.map(mapAdminRentalResponse);
        adminRentalsLoaded = true;
        loadProductFormComboboxOptions();
        applyProductCategoryFilterAndRender();
        // 表格重繪後再套用轉換按鈕顯示（依 readiness）
        syncBackendProductUi();
      })
      .catch(function (error) {
        AdminAPI.handleError(error, '載入租借商品失敗');
        $('#rentalProductsTableBody').html(
          '<tr><td colspan="' + getRentalTableColspan() + '" class="text-center text-danger py-4">' +
          '<i class="fas fa-exclamation-triangle me-2"></i>載入租借商品失敗</td></tr>'
        );
      });
    return;
  }

  $.getJSON(MockDataPaths.rentalSkus, function (rentals) {
    var pendingItems = adminRentalsCache.slice();
    var rentalIdMap = {};

    adminRentalsCache = (rentals || []).map(normalizeRentalItem);
    adminRentalsCache.forEach(function (item) {
      rentalIdMap[item.id] = true;
    });

    pendingItems.forEach(function (item) {
      if (!rentalIdMap[item.id]) {
        adminRentalsCache.unshift(item);
      }
    });

    adminRentalsLoaded = true;
    loadProductFormComboboxOptions();
    applyProductCategoryFilterAndRender();
  }).fail(function () {
    $('#rentalProductsTableBody').html(
      '<tr><td colspan="' + getRentalTableColspan() + '" class="text-center text-danger py-4">' +
      '<i class="fas fa-exclamation-triangle me-2"></i>載入租借商品數據失敗' +
      '</td></tr>'
    );
  });
}

/**
 * 把後端 AdminRentalResponse 轉成租借表格用的 UI cache。
 * Map backend rental SKU response into adminRentalsCache shape.
 * 注意：租借 on-hand 不在此 API；正式模式表格庫存欄先顯示 0（庫存走異動／轉換）。
 */
function mapAdminRentalResponse(rental) {
  var variants = (rental && rental.variants ? rental.variants : []).map(function (variant) {
    return {
      id: variant.id,
      sku: variant.sku,
      color: variant.color || '',
      size: variant.size || '',
      specification: variant.specification,
      label: variant.specification || buildVariantLabel(variant.color, variant.size),
      status: variant.status,
      camp: createEmptyCampStock(),
      total: 0
    };
  });

  return normalizeRentalItem({
    id: rental && rental.id,
    itemId: rental && rental.itemId,
    status: rental && rental.status,
    name: rental && rental.name,
    categoryId: rental && rental.categoryId,
    category: (rental && rental.category) || '其他',
    brandId: rental && rental.brandId,
    brand: (rental && rental.brand) || '',
    description: (rental && rental.description) || '',
    image: PRODUCT_IMAGE_PLACEHOLDER,
    variants: variants
  });
}

// 將租借商品資料統一成 camp 陣列，庫存由各營地 quantity 加總取得。
// 同時產生 campByKey 物件（C001 主倉 + C002–C009 營區），方便表格按欄位讀取。
// Also builds campByKey {campgroundId: quantity} for table columns.
function normalizeRentalItem(item) {
  var camps = normalizeRentalCamps(item && (item.camp || item.storageCamp), item && item.quantity);
  var variants = normalizeRentalVariants(item);

  if (!item || !item.variants || !item.variants.length) {
    if (variants.length === 1 && camps.length) {
      variants[0].camp = createEmptyCampStock();
      camps.forEach(function (camp) {
        var campId = camp.campgroundId || getCampIdByName(camp.name);
        if (campId) {
          variants[0].camp[campId] = camp.quantity;
        } else {
          variants[0].camp[camp.name] = camp.quantity;
        }
      });
      variants[0].total = getBranchTotal(variants[0].camp);
    }
  }

  var campByKey = createEmptyCampStock();
  variants.forEach(function (variant) {
    Object.keys(variant.camp || {}).forEach(function (campKey) {
      if (campByKey[campKey] === undefined) {
        campByKey[campKey] = 0;
      }
      campByKey[campKey] += normalizeStockValue(variant.camp[campKey]);
    });
  });

  camps = aggregateRentalCampFromVariants(variants);

  return {
    id: item && item.id ? item.id : 'R-NEW-' + Date.now(),
    image: (item && item.image) || PRODUCT_IMAGE_PLACEHOLDER,
    name: (item && item.name) || '未命名租借商品',
    brand: (item && item.brand) ? String(item.brand).trim() : '',
    category: (item && item.category) || '其他',
    variants: variants,
    camp: camps,
    campByKey: campByKey
  };
}

// 依租借商品 ID 從目前快取中取出資料。
function findAdminRentalById(rentalId) {
  return (adminRentalsCache || []).find(function (item) {
    return item.id === rentalId;
  });
}

// 新增或更新租借商品快取（權威來源：rental-skus）。
// Mock 模式更新 memory cache；正式模式勿走舊 updateRental（請用 rentals／listings／conversions）。
// Source of truth (mock): rental-skus. Backend writes go through dedicated AdminAPI namespaces.
function upsertAdminRentalCache(rentalItem) {
  if (isAdminProductBackendEnabled()) {
    // 正式模式：不在此假寫庫存；呼叫端應改打 AdminAPI.rentals / listings / conversions
    return null;
  }
  var normalizedItem = normalizeRentalItem(rentalItem);
  var index = adminRentalsCache.findIndex(function (item) {
    return item.id === normalizedItem.id;
  });

  if (index >= 0) {
    adminRentalsCache[index] = normalizedItem;
  } else {
    adminRentalsCache.unshift(normalizedItem);
  }

  if (typeof AdminAPI !== 'undefined' && AdminAPI.products) {
    AdminAPI.products.updateRental(normalizedItem.id, normalizedItem).catch(function (err) {
      AdminAPI.handleError(err, '同步租借商品失敗');
    });
  }

  // Mock：提示開發者 stock 衍生檔需手動同步（後端應在 transaction 內完成）
  if (typeof AdminAPI !== 'undefined' && AdminAPI.isBackendEnabled && !AdminAPI.isBackendEnabled()) {
    console.info(
      '[rental-skus] 已更新 cache。正式環境請同步 camp-equipment.stock（npm run sync:listings）'
    );
  }

  return normalizedItem;
}

// 租借列表的庫存確認：讀取所有營地（含主倉）的數值，自動計算 total，寫回快取並更新畫面。
// Rental stock confirm: read all camp values (including main), auto-compute total, update cache and UI.
function confirmRentalStockChange($row, rentalId, $button) {
  var rental = findAdminRentalById(rentalId);

  if (!rental) {
    window.showAdminToast('找不到租借商品 ' + rentalId + ' 的資料', 'danger');
    return;
  }

  // 先檢查原始輸入不可為負數，再 normalize 寫入 nextCampByKey
  // Validate raw inputs before normalizeStockValue clamps negatives to 0
  var rawCampValues = $row.find('.stock-input').map(function () {
    return $(this).val();
  }).get();
  if (hasNegativeRawStockValues(rawCampValues)) {
    window.showAdminToast('庫存數量不可為負數', 'danger');
    return;
  }

  // 讀取所有固定營地（含主倉）欄位值
  // Read all fixed camp values including main warehouse
  var nextCampByKey = {};

  ADMIN_RENTAL_CAMP_IDS.forEach(function (campId) {
    nextCampByKey[campId] = getRowStockValue($row, campId);
  });

  // total 由固定營地加總自動計算（不再驗證手動輸入的 rental-total）
  // total is always auto-computed from preset camp sum — validation check removed
  var totalStock = ADMIN_RENTAL_CAMP_IDS.reduce(function (sum, key) {
    return sum + normalizeStockValue(nextCampByKey[key]);
  }, 0);

  confirmRentalStockChangeWithReason($row, rental, rentalId, nextCampByKey, totalStock);
}

/**
 * 租借表格列確認庫存異動的核心邏輯（從 confirmRentalStockChange 拆出）。
 * Core logic for confirming rental stock changes from the table row.
 *
 * @param {jQuery} $row           - 目標 <tr>
 * @param {Object} rental         - 租借商品物件
 * @param {string} rentalId       - 租借商品 ID
 * @param {Object} nextCampByKey  - { campId: qty }
 * @param {number} totalStock     - 新總庫存
 */
function confirmRentalStockChangeWithReason($row, rental, rentalId, nextCampByKey, totalStock) {
  // 先產生異動 items（需在寫回快取前，才能比對舊數量）
  // Must build movement items before updating rental.campByKey (needs old values for comparison)
  var movementResult = buildMovementItemsForRentalChange(rental, nextCampByKey);
  if (!movementResult.valid) {
    window.showAdminToast(movementResult.message, 'danger');
    return;
  }

  // 寫回快取的 campByKey 與 camp 陣列
  rental.campByKey = nextCampByKey;
  rental.camp = buildCampArrayFromKey(nextCampByKey);

  // 更新唯讀 total 欄位的靜態顯示數字
  // Refresh the read-only rental-total display cell
  $row.find('.total-stock-value').text(totalStock);
  refreshRowLowStockCells($row, getLowCampKeys(rental));
  setRowOriginalStockValues($row);
  syncStockConfirmState($row);

  // 將異動明細推入租借待處理佇列，並同步按鈕啟用狀態
  // Push movement items to rental pending queue and refresh button state
  if (movementResult.items.length > 0) {
    pendingRentalMovementItems = pendingRentalMovementItems.concat(movementResult.items);
    updateMovementGenerateButtonState();
  }

  window.showAdminToast('租借商品 ' + rentalId + ' 數量已更新');
  exitStockEditMode($row, false);
}

// 依 campByKey 物件重建 camp 陣列（僅固定 C001–C009；寫回 rental-skus.json）。
// Rebuilds camp[] from campByKey for persistence (preset camps only).
function buildCampArrayFromKey(campByKey) {
  var source = campByKey || {};
  var result = [];

  ADMIN_RENTAL_CAMP_IDS.forEach(function (id) {
    result.push({
      campgroundId: id,
      name: ADMIN_RENTAL_CAMP_FULL_NAMES[id],
      quantity: normalizeStockValue(source[id])
    });
  });

  return result;
}

// 切換租借模式時，顯示固定營地清單，並讓初始庫存改由營地數量加總決定。
// Show/hide rental camp section and toggle readonly on stock input.
//
// @param {boolean} isRental     - 是否切換為租借狀態
// @param {boolean} isEditMode   - true = 租借編輯，false/undefined = 租借新增
// @param {boolean} isStoreEdit  - true = 商店編輯模式（不修改售價 required / 庫存 readonly）
function syncRentalFormState(isRental, isEditMode, isStoreEdit) {
  $('#rentalCampField').toggleClass('d-none', !isRental);

  // 商店編輯模式下不修改售價的 required 與庫存 readonly（售價仍為必填）
  // In store-edit mode, do NOT change price required or stock readonly
  if (!isStoreEdit) {
    $('#newProductPrice').prop('required', !isRental);
    $('#newProductStock')
      .prop('readonly', isRental)
      .toggleClass('bg-light', isRental);
  }

  if (isRental) {
    if (isEditMode) {
      $('#rentalAddModeSection').addClass('d-none');
      $('#rentalEditModeSection').removeClass('d-none');
      if ($('#addProductForm').data('edit-type') === 'store') {
        syncRentalVariantCardsFromStoreVariants();
      }
    } else {
      // 新增模式：顯示主倉進貨欄，隱藏營地分配區
      $('#rentalAddModeSection').removeClass('d-none');
      $('#rentalEditModeSection').addClass('d-none');
    }
  } else {
    // 非租借：兩區都隱藏（由 rentalCampField d-none 覆蓋）
    $('#rentalAddModeSection').addClass('d-none');
    $('#rentalEditModeSection').addClass('d-none');
  }
}

// 統一設定新增 / 編輯商品 Modal 的標題與送出按鈕文字。
function setProductModalMode(mode) {
  var isEdit = mode === 'edit';
  var iconClass = isEdit ? 'fa-pen' : 'fa-plus';

  $('#addProductModalLabel').html(
    '<i class="fas ' + iconClass + ' me-2"></i>' + (isEdit ? '編輯商品' : '新增商品')
  );
  $('#submitAddProduct').html(
    '<i class="fas ' + iconClass + ' me-1"></i>' + (isEdit ? '更新商品' : '建立商品')
  );
}

function normalizeProductBranch(product) {
  if (!product) {
    return product;
  }

  ensureProductVariantStock(product);

  // 僅保留固定分店 key（忽略舊資料中的自訂分店）
  // Keep preset branch keys only (drop legacy custom branch keys)
  product.branch = aggregateBranchFromVariants(product.variants);
  product.totalStock = aggregateTotalFromVariants(product.variants);
  delete product.stock;
  return product;
}


/**
 * 商店表格列確認庫存異動的核心邏輯，從 .stock-confirm-btn handler 拆出。
 * Core logic for confirming store stock changes from the table row.
 *
 * @param {jQuery} $row        - 目標 <tr>
 * @param {Object} product     - 商店商品物件
 * @param {Object} branchStock - { branchId: qty } 新分店庫存
 * @param {number} totalStock  - 新總庫存
 */
function confirmStoreStockChange($row, product, branchStock, totalStock) {
  var movementResult = buildMovementItemsForBranchChange(product, branchStock);
  if (!movementResult.valid) {
    window.showAdminToast(movementResult.message, 'danger');
    return;
  }

  product.totalStock = totalStock;
  product.branch = branchStock;
  delete product.stock;

  $row.find('.total-stock-value').text(totalStock);
  refreshRowLowStockCells($row, getLowBranchIds(product));
  setRowOriginalStockValues($row);
  syncStockConfirmState($row);

  if (movementResult.items.length > 0) {
    pendingMovementItems = pendingMovementItems.concat(movementResult.items);
    updateMovementGenerateButtonState();
  }

  window.showAdminToast('商品 ' + product.id + ' 庫存數量已更新');
  exitStockEditMode($row, false);
}

function splitBranchStock(totalStock) {
  // 商店主倉設為 0，只將庫存平均分配給實體分店（不含 main）
  // Store main warehouse starts at 0; only distribute among physical branches (excluding main)
  var total = Math.max(parseInt(totalStock, 10) || 0, 0);
  var physicalBranches = ADMIN_PRODUCT_BRANCH_IDS.filter(function (id) {
    return id !== ADMIN_STORE_WAREHOUSE_ID;
  });
  var baseQty = Math.floor(total / physicalBranches.length);
  var remainder = total % physicalBranches.length;
  var branchStock = {};

  branchStock[ADMIN_STORE_WAREHOUSE_ID] = 0;
  physicalBranches.forEach(function (branchId, index) {
    branchStock[branchId] = baseQty + (index < remainder ? 1 : 0);
  });

  return branchStock;
}

/**
 * 新增商品時建立初始分店庫存物件。
 * 進貨全部進主倉，實體分店（A/B/C）初始為 0。
 *
 * When adding a new product, put all initial stock in the main warehouse;
 * physical branches start at zero.
 *
 * @param {number} warehouseQty - 主倉進貨量
 * @returns {Object} { main: qty, 'branch-001': 0, 'branch-002': 0, 'branch-003': 0 }
 */
function createInitialBranchStock(warehouseQty) {
  var qty = Math.max(normalizeStockValue(warehouseQty), 0);
  var result = {};
  result[ADMIN_STORE_WAREHOUSE_ID] = qty;
  ADMIN_PRODUCT_BRANCH_IDS.forEach(function (id) {
    if (id !== ADMIN_STORE_WAREHOUSE_ID) {
      result[id] = 0;
    }
  });
  return result;
}

/**
 * 新增租借商品時建立初始 camp 陣列。
 * 進貨全部進主倉，所有固定營地初始庫存為 0。
 *
 * When adding a new rental product, put all initial stock in the main camp;
 * all other camps start at zero.
 *
 * @param {number} warehouseQty - 主倉進貨量
 * @returns {Array<{name: string, quantity: number}>}
 */
function buildInitialRentalCamps(warehouseQty) {
  var qty = Math.max(normalizeStockValue(warehouseQty), 0);
  // 使用 ADMIN_RENTAL_CAMP_FULL_NAMES 取得完整名稱（對應 rental-skus.json 的 camp[].name）
  // Use full camp names to match rental-skus.json camp[].name format
  return ADMIN_RENTAL_CAMP_IDS.map(function (id) {
    var campName = ADMIN_RENTAL_CAMP_FULL_NAMES[id] || id;
    return {
      name: campName,
      quantity: id === ADMIN_RENTAL_WAREHOUSE_ID ? qty : 0
    };
  });
}

function getProductTotalStock(product) {
  var totalStock = parseInt(product && product.totalStock, 10);
  if (!isNaN(totalStock)) {
    return Math.max(totalStock, 0);
  }

  if (product && product.branch && typeof product.branch === 'object') {
    return getBranchTotal(product.branch);
  }

  var stock = parseInt(product && product.stock, 10);
  return isNaN(stock) ? 0 : Math.max(stock, 0);
}

function getProductBranchStock(product, branchId) {
  if (!product || !product.branch || typeof product.branch !== 'object') {
    return 0;
  }

  return normalizeStockValue(product.branch[branchId]);
}

function normalizeStockValue(value) {
  var qty = parseInt(value, 10);
  return isNaN(qty) ? 0 : Math.max(qty, 0);
}

/**
 * 檢查原始輸入值是否含負數（在 normalizeStockValue 截斷為 0 之前檢查）。
 * Check raw input values for negatives before normalizeStockValue clamps them to 0.
 *
 * @param {Array<number|string>} rawValues - 使用者輸入的原始數字
 * @returns {boolean} true = 有負數
 */
function hasNegativeRawStockValues(rawValues) {
  return rawValues.some(function (value) {
    var raw = parseInt(value, 10);
    return !isNaN(raw) && raw < 0;
  });
}

/**
 * 收集 Modal 內租借庫存欄位的原始輸入值（固定營地 C001–C009）。
 * Collects raw rental stock input values from the product modal (preset camps only).
 *
 * @returns {Array<string|number>}
 */
function collectRawRentalModalStockValues() {
  return collectRentalVariantsWithStock().rawValues;
}

// 「租借主倉」對應 ADMIN_RENTAL_WAREHOUSE_ID（C001）。
// "租借主倉" maps to ADMIN_RENTAL_WAREHOUSE_ID (C001).
function getCampIdByName(name) {
  var trimmed = String(name || '').trim();

  if (trimmed === ADMIN_RENTAL_WAREHOUSE_LABEL || trimmed === ADMIN_RENTAL_CAMP_FULL_NAMES.C001) {
    return ADMIN_RENTAL_WAREHOUSE_ID;
  }

  var found = null;

  Object.keys(ADMIN_RENTAL_CAMP_FULL_NAMES).forEach(function (id) {
    if (ADMIN_RENTAL_CAMP_FULL_NAMES[id] === trimmed) {
      found = id;
    }
  });

  // 同時嘗試比對簡稱（例如 campByKey 存的是簡稱）
  // Also try short labels
  if (!found) {
    Object.keys(ADMIN_RENTAL_CAMP_LABELS).forEach(function (id) {
      if (ADMIN_RENTAL_CAMP_LABELS[id] === trimmed) {
        found = id;
      }
    });
  }

  return found;
}

// 正規化租借商品的 camp 欄位，支援新版陣列與舊版單一字串。
function normalizeRentalCamps(campValue, legacyQuantity) {
  var camps = [];

  if (Array.isArray(campValue)) {
    camps = campValue.map(function (camp) {
      if (typeof camp === 'string') {
        return { name: camp.trim(), quantity: 0 };
      }

      return {
        campgroundId: camp.campgroundId !== undefined ? camp.campgroundId : null,
        name: (camp && (camp.name || camp.camp || camp.title)) || '',
        quantity: normalizeStockValue(camp && camp.quantity !== undefined ? camp.quantity : camp && camp.stock)
      };
    });
  } else if (campValue && typeof campValue === 'object') {
    if (campValue.name || campValue.camp || campValue.title) {
      camps = [{
        name: campValue.name || campValue.camp || campValue.title,
        quantity: normalizeStockValue(campValue.quantity !== undefined ? campValue.quantity : campValue.stock)
      }];
    } else {
      camps = Object.keys(campValue).map(function (name) {
        return {
          name: name,
          quantity: normalizeStockValue(campValue[name])
        };
      });
    }
  } else if (typeof campValue === 'string' && campValue.trim()) {
    camps = [{
      name: campValue.trim(),
      quantity: normalizeStockValue(legacyQuantity)
    }];
  }

  return camps.filter(function (camp) {
    return camp.name;
  }).map(function (camp) {
    var campId = camp.campgroundId || getCampIdByName(camp.name);
    return {
      campgroundId: campId || camp.campgroundId,
      name: String(camp.name).trim(),
      quantity: normalizeStockValue(camp.quantity)
    };
  });
}

// 計算租借商品所有營地的庫存總量。
function getRentalCampTotal(camps) {
  return (camps || []).reduce(function (sum, camp) {
    return sum + normalizeStockValue(camp && camp.quantity);
  }, 0);
}

// 從租借商品物件計算列表要顯示的庫存總量。
function getRentalTotalStock(rental) {
  return getRentalCampTotal(normalizeRentalCamps(rental && rental.camp, rental && rental.quantity));
}

// 快速調整租借總量時，將差額寫回既有營地數量。
function setRentalCampTotal(camps, nextTotal) {
  var targetTotal = normalizeStockValue(nextTotal);
  var normalizedCamps = normalizeRentalCamps(camps);

  if (normalizedCamps.length === 0) {
    return [{ name: '未指定營地', quantity: targetTotal }];
  }

  var currentTotal = getRentalCampTotal(normalizedCamps);
  var delta = targetTotal - currentTotal;

  if (delta > 0) {
    normalizedCamps[0].quantity += delta;
  } else if (delta < 0) {
    var remaining = Math.abs(delta);
    for (var index = normalizedCamps.length - 1; index >= 0 && remaining > 0; index -= 1) {
      var reducibleQty = Math.min(normalizedCamps[index].quantity, remaining);
      normalizedCamps[index].quantity -= reducibleQty;
      remaining -= reducibleQty;
    }
  }

  return normalizedCamps;
}

function getBranchTotal(branchStock) {
  if (!branchStock || typeof branchStock !== 'object') {
    return 0;
  }

  return Object.keys(branchStock).reduce(function (sum, branchKey) {
    return sum + normalizeStockValue(branchStock[branchKey]);
  }, 0);
}

function getBranchLabel(branchId) {
  return ADMIN_PRODUCT_BRANCH_LABELS[branchId] || branchId;
}

function buildMovementItemsForBranchChange(product, nextBranchStock) {
  var sources = [];
  var receivers = [];
  var items = [];

  getBranchKeysUnionForChange(product, nextBranchStock).forEach(function (branchId) {
    var previousQty = getProductBranchStock(product, branchId);
    var nextQty = normalizeStockValue(nextBranchStock && nextBranchStock[branchId]);
    var delta = nextQty - previousQty;

    if (delta < 0) {
      sources.push({
        branchId: branchId,
        storeName: getBranchLabel(branchId),
        quantity: Math.abs(delta)
      });
    } else if (delta > 0) {
      receivers.push({
        branchId: branchId,
        storeName: getBranchLabel(branchId),
        quantity: delta
      });
    }
  });

  if (sources.length === 0 && receivers.length === 0) {
    return { valid: true, message: '', items: [] };
  }

  if (sources.length === 0) {
    // 只有增加（來自進貨）→ type = '進貨'
    // Only increases → procurement, type = '進貨'
    receivers.forEach(function (receiver) {
      items.push({
        productName: product.name,
        quantity: receiver.quantity,
        fromStore: '進貨',
        toStore: receiver.storeName,
        type: '進貨'
      });
    });
    return { valid: true, message: '', items: items };
  }

  // 有增有減：配對 source → receiver，type = '移轉'（商店內部調配）
  // Has both increases and decreases: pair sources to receivers, type = '移轉' (internal reallocation)
  var sourceIndex = 0;
  receivers.forEach(function (receiver) {
    var remainingReceiverQty = receiver.quantity;

    while (remainingReceiverQty > 0 && sourceIndex < sources.length) {
      var source = sources[sourceIndex];
      var moveQty = Math.min(source.quantity, remainingReceiverQty);

      items.push({
        productName: product.name,
        quantity: moveQty,
        fromStore: source.storeName,
        toStore: receiver.storeName,
        type: '移轉'
      });

      source.quantity -= moveQty;
      remainingReceiverQty -= moveQty;
      if (source.quantity === 0) { sourceIndex += 1; }
    }

    if (remainingReceiverQty > 0) {
      // 來源不足 → 補充進貨
      // Insufficient source → supplement from procurement
      items.push({
        productName: product.name,
        quantity: remainingReceiverQty,
        fromStore: '進貨',
        toStore: receiver.storeName,
        type: '進貨'
      });
    }
  });

  // 剩餘 source 未被 receiver 吸收 → 損耗
  // Remaining source not absorbed by receiver → loss
  while (sourceIndex < sources.length) {
    var s = sources[sourceIndex];
    if (s.quantity > 0) {
      items.push({
        productName: product.name,
        quantity: s.quantity,
        fromStore: s.storeName,
        toStore: '—',
        type: '損耗'
      });
    }
    sourceIndex += 1;
  }

  return { valid: true, message: '', items: items };
}

/**
 * 比對各規格分店庫存變化，產生含規格名稱的異動紀錄。
 * Compare per-variant branch stock changes and build movement items.
 */
function buildMovementItemsForVariantBranchChange(product, nextVariants) {
  var allItems = [];
  var oldVariants = normalizeProductVariants(product);
  var oldVariantMap = {};
  var nextVariantMap = {};

  oldVariants.forEach(function (variant) {
    oldVariantMap[variant.id] = variant;
  });

  (nextVariants || []).forEach(function (variant) {
    nextVariantMap[variant.id] = variant;
  });

  var variantIds = {};
  oldVariants.forEach(function (variant) { variantIds[variant.id] = true; });
  (nextVariants || []).forEach(function (variant) { variantIds[variant.id] = true; });

  Object.keys(variantIds).forEach(function (variantId) {
    var oldVariant = oldVariantMap[variantId] || {
      id: variantId,
      label: '',
      branch: createEmptyBranchStock()
    };
    var nextVariant = nextVariantMap[variantId] || {
      id: variantId,
      label: oldVariant.label,
      branch: createEmptyBranchStock()
    };
    var pseudoProduct = {
      id: product.id,
      name: formatMovementProductName(product.name, nextVariant.label ? nextVariant : oldVariant),
      branch: oldVariant.branch || createEmptyBranchStock()
    };
    var movementResult = buildMovementItemsForBranchChange(pseudoProduct, nextVariant.branch || createEmptyBranchStock());
    if (!movementResult.valid) {
      return;
    }
    allItems = allItems.concat(movementResult.items);
  });

  return { valid: true, message: '', items: allItems };
}

/**
 * 比對各規格營地庫存變化，產生含規格名稱的租借異動紀錄。
 * Compare per-variant camp stock changes and build rental movement items.
 */
function buildMovementItemsForVariantRentalChange(rental, nextVariants) {
  var allItems = [];
  var oldVariants = normalizeRentalVariants(rental);
  var oldVariantMap = {};
  var nextVariantMap = {};

  oldVariants.forEach(function (variant) {
    oldVariantMap[variant.id] = variant;
  });

  (nextVariants || []).forEach(function (variant) {
    nextVariantMap[variant.id] = variant;
  });

  var variantIds = {};
  oldVariants.forEach(function (variant) { variantIds[variant.id] = true; });
  (nextVariants || []).forEach(function (variant) { variantIds[variant.id] = true; });

  Object.keys(variantIds).forEach(function (variantId) {
    var oldVariant = oldVariantMap[variantId] || {
      id: variantId,
      label: '',
      camp: createEmptyCampStock()
    };
    var nextVariant = nextVariantMap[variantId] || {
      id: variantId,
      label: oldVariant.label,
      camp: createEmptyCampStock()
    };
    var pseudoRental = {
      id: rental.id,
      name: formatMovementProductName(rental.name, nextVariant.label ? nextVariant : oldVariant),
      campByKey: oldVariant.camp || createEmptyCampStock()
    };
    var movementResult = buildMovementItemsForRentalChange(pseudoRental, nextVariant.camp || createEmptyCampStock());
    if (!movementResult.valid) {
      return;
    }
    allItems = allItems.concat(movementResult.items);
  });

  return { valid: true, message: '', items: allItems };
}

/**
 * 比對租借商品各營地的舊數量（rental.campByKey）與新數量（nextCampByKey），
 * 產生庫存異動 items 陣列，格式與商店異動相同。
 *
 * Compare old camp quantities (rental.campByKey) with new (nextCampByKey),
 * return movement items with campName as fromStore/toStore.
 *
 * @param {Object} rental       - 租借商品物件（含 campByKey 舊值）
 * @param {Object} nextCampByKey - 確認後的新數量 { 'camp-001': 5, ... }
 * @returns {{ valid: boolean, message: string, items: Array }}
 */
function buildMovementItemsForRentalChange(rental, nextCampByKey) {
  var sources = [];
  var receivers = [];
  var items = [];

  // 只比對固定營地 ID（C001–C009）
  // Diff preset camp IDs only (C001–C009)
  ADMIN_RENTAL_CAMP_IDS.forEach(function (key) {
    var previousQty = normalizeStockValue((rental.campByKey || {})[key]);
    var nextQty = normalizeStockValue((nextCampByKey || {})[key]);
    var delta = nextQty - previousQty;

    var campLabel = ADMIN_RENTAL_CAMP_LABELS[key] || key;

    if (delta < 0) {
      sources.push({ campKey: key, campLabel: campLabel, quantity: Math.abs(delta) });
    } else if (delta > 0) {
      receivers.push({ campKey: key, campLabel: campLabel, quantity: delta });
    }
  });

  // 沒有任何變動
  if (sources.length === 0 && receivers.length === 0) {
    return { valid: true, message: '', items: [] };
  }

  // 只有增加 → 全部標記為「進貨」
  // Only increases → mark all as '進貨'
  if (sources.length === 0) {
    receivers.forEach(function (receiver) {
      items.push({
        productName: rental.name,
        quantity: receiver.quantity,
        fromStore: '進貨',
        toStore: receiver.campLabel,
        type: '進貨'
      });
    });
    return { valid: true, message: '', items: items };
  }

  // 有增有減 → 配對配送（租借內部移轉，type = '移轉'）
  // Has both increases and decreases → internal rental reallocation, type = '移轉'
  var sourceIndex = 0;
  receivers.forEach(function (receiver) {
    var remaining = receiver.quantity;

    while (remaining > 0 && sourceIndex < sources.length) {
      var source = sources[sourceIndex];
      var moveQty = Math.min(source.quantity, remaining);

      items.push({
        productName: rental.name,
        quantity: moveQty,
        fromStore: source.campLabel,
        toStore: receiver.campLabel,
        type: '移轉'
      });

      source.quantity -= moveQty;
      remaining -= moveQty;
      if (source.quantity === 0) { sourceIndex += 1; }
    }

    if (remaining > 0) {
      // 補充進貨
      items.push({
        productName: rental.name,
        quantity: remaining,
        fromStore: '進貨',
        toStore: receiver.campLabel,
        type: '進貨'
      });
    }
  });

  // 剩餘 source 未被 receiver 吸收 → 損耗
  // Remaining source not absorbed → loss
  while (sourceIndex < sources.length) {
    var s = sources[sourceIndex];
    if (s.quantity > 0) {
      items.push({
        productName: rental.name,
        quantity: s.quantity,
        fromStore: s.campLabel,
        toStore: '—',
        type: '損耗'
      });
    }
    sourceIndex += 1;
  }

  return { valid: true, message: '', items: items };
}

function getStockInputValue($input) {
  return normalizeStockValue($input.val());
}

function getRowStockValue($row, fieldName) {
  return getStockInputValue($row.find('.stock-input[data-stock-field="' + fieldName + '"]'));
}

// 檢查同一列庫存欄位是否異動，並同步 ✓ 按鈕狀態（正常 / 最低庫存模式共用）。
// Sync confirm button state for both normal stock edit and min-stock edit modes.
function syncStockConfirmState($row) {
  if (!$row.hasClass('stock-row-editing')) {
    return;
  }

  var $editRows = $row.add(getVariantDetailRowsForMainRow($row));
  var hasChanged = $editRows.find('.stock-input').toArray().some(function (input) {
    var $input = $(input);
    var originalQty = normalizeStockValue($input.attr('data-original-qty'));
    return getStockInputValue($input) !== originalQty;
  });

  syncStockInputFeedback($row);
  $row.find('.stock-confirm-btn').prop('disabled', !hasChanged);
}

/**
 * 取得主列對應的規格明細子列。
 * Get variant detail rows linked to a main product table row.
 *
 * @param {jQuery} $mainRow
 * @returns {jQuery}
 */
function getVariantDetailRowsForMainRow($mainRow) {
  if (!$mainRow || !$mainRow.length || $mainRow.hasClass('variant-detail-row')) {
    return $();
  }

  var productId = $mainRow.data('product-id');
  if (!productId) {
    return $();
  }

  var inventoryType = $mainRow.data('inventory-type') || 'store';
  var tableBodyId = inventoryType === 'rental' ? '#rentalProductsTableBody' : '#productsTableBody';
  return $(tableBodyId + ' tr.variant-detail-row[data-parent-product-id="' + productId + '"]');
}

/**
 * 將 inline input 的數值同步到瀏覽模式的 span 顯示。
 * Sync inline input values to read-only display spans.
 */
function syncStockDisplayFromInputs($row) {
  var $rows = $row.hasClass('variant-detail-row')
    ? $row
    : $row.add(getVariantDetailRowsForMainRow($row));

  $rows.find('.stock-input-inline').each(function () {
    var $input = $(this);
    var qty = getStockInputValue($input);
    var stockField = $input.data('stock-field');
    var minStockField = $input.data('min-stock-field');
    var variantId = $input.data('variant-id');
    var $scope = $input.closest('tr');

    if (stockField) {
      $scope.find('.stock-display-value[data-stock-field="' + stockField + '"]').text(qty);
    }

    if (minStockField) {
      var selector = '.stock-display-value[data-min-stock-field="' + minStockField + '"]';
      if (variantId) {
        selector += '[data-variant-id="' + variantId + '"]';
      }
      $scope.find(selector).text(qty);
    }
  });
}

/**
 * 進入整列庫存編輯模式（同時只允許一列）。
 * Enter stock edit mode for the entire row (only one row at a time).
 */
function enterStockEditMode($row) {
  $('tr.stock-row-editing').not($row).each(function () {
    exitStockEditMode($(this), true);
  });

  var $detailRows = getVariantDetailRowsForMainRow($row);
  if (isMinStockMode && $detailRows.length && !$row.hasClass('variant-rows-expanded')) {
    toggleProductVariantExpand($row);
    $detailRows = getVariantDetailRowsForMainRow($row);
  }

  $row.addClass('stock-row-editing');
  var $editRows = $row.add($detailRows);
  $editRows.find('.stock-display-value').addClass('d-none');
  $editRows.find('.stock-input-inline').removeClass('d-none');
  $row.find('.stock-edit-btn').addClass('d-none');
  $row.find('.stock-edit-actions').removeClass('d-none');
  syncStockConfirmState($row);
}

/**
 * 離開整列庫存編輯模式。
 * Exit stock edit mode for the row.
 * @param {jQuery}  $row
 * @param {boolean} revert - true：還原 data-original-qty
 */
function exitStockEditMode($row, revert) {
  var $detailRows = getVariantDetailRowsForMainRow($row);
  var $allRows = $row.add($detailRows);

  if (revert) {
    $allRows.find('.stock-input-inline').each(function () {
      var original = normalizeStockValue($(this).attr('data-original-qty'));
      $(this).val(original);
    });
    syncStockInputFeedback($row);
  }

  syncStockDisplayFromInputs($row);

  $row.removeClass('stock-row-editing');
  $detailRows.removeClass('variant-detail-editing');
  $allRows.find('.stock-display-value').removeClass('d-none');
  $allRows.find('.stock-input-inline').addClass('d-none');
  $row.find('.stock-edit-btn').removeClass('d-none');
  $row.find('.stock-edit-actions').addClass('d-none');
  $row.find('.stock-confirm-btn').prop('disabled', true);
}

// 確認庫存後，將目前欄位值寫回原始值，作為下一次異動比較基準。
function setRowOriginalStockValues($row) {
  $row.find('.stock-input').each(function () {
    var $input = $(this);
    var qty = getStockInputValue($input);

    $input
      .val(qty)
      .attr('data-original-qty', qty)
      .data('original-qty', qty);
  });

  syncStockInputFeedback($row);
  syncStockDisplayFromInputs($row);
}

// 依變更方向標示庫存欄位顏色。
// total-stock / rental-total 已改為靜態顯示，不再是 stock-input，無需處理。
// Colors stock inputs based on change direction.
// total-stock / rental-total are now static displays (not stock-inputs), so skip them.
function syncStockInputFeedback($row) {
  $row.find('.stock-input').each(function () {
    var $input = $(this);
    var currentQty = getStockInputValue($input);
    var originalQty = normalizeStockValue($input.attr('data-original-qty'));

    $input.removeClass('stock-input-increase stock-input-decrease');

    // 所有可編輯的分店/主倉/營地欄位：直接與原始值比較
    // All editable branch / main / camp fields: compare directly to original value
    if (currentQty > originalQty) {
      $input.addClass('stock-input-increase');
    } else if (currentQty < originalQty) {
      $input.addClass('stock-input-decrease');
    }
  });
}

// 商店或租借任一有待處理異動，就啟用「產生異動紀錄」按鈕。
// Enable the button if either store or rental pending queue has items.
function updateMovementGenerateButtonState() {
  var hasItems = pendingMovementItems.length > 0 || pendingRentalMovementItems.length > 0;
  $('#generateMovementRecord').prop('disabled', !hasItems);
}

// 取得目前登入員工 ID，寫入新建立的庫存異動紀錄。
function getCurrentAdminId() {
  return sessionStorage.getItem('adminId') || '—';
}

function formatMovementDate(date) {
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

/**
 * 建立商店商品的單個庫存 <td>。
 * 正常模式：顯示實際庫存，不足格數字加紅色 class 與 tooltip。
 * 最低庫存模式：顯示最低庫存設定值，無橘色標示，確定按鈕走 saveMinStockValues 流程。
 *
 * Builds a single store product stock <td>.
 * Normal mode: actual stock, low cells get red text + tooltip.
 * Min-stock mode: show the minimum threshold value, no orange highlighting.
 *
 * @param {Object}   product      - 商店商品物件
 * @param {string}   branchId     - 分店 ID
 * @param {string}   label        - 分店顯示名稱
 * @param {string[]} lowBranchIds - 庫存不足的分店 ID 陣列
 * @returns {string} <td> HTML 字串
 */
function buildStoreStockCell(product, branchId, label, lowBranchIds) {
  var isLowCell = lowBranchIds.indexOf(branchId) !== -1;
  var variants = normalizeProductVariants(product);
  var hasMultipleVariants = variants.length > 1;

  if (isMinStockMode) {
    if (hasMultipleVariants) {
      return '<td class="stock-cell text-center text-muted">—</td>';
    }

    var singleVariantId = variants[0] && variants[0].id ? variants[0].id : '';
    var minVal = getMinStockValue('store', product.id, branchId, singleVariantId);
    return '<td class="stock-cell">' +
      buildMinStockCellContent(branchId, minVal, label, singleVariantId) +
      '</td>';
  }

  // 正常模式
  var qty = getProductBranchStock(product, branchId);
  var cellClass = isLowCell ? 'stock-cell stock-cell-below-min' : 'stock-cell';
  var tooltipAttr = isLowCell
    ? ' title="目前 ' + qty + ' 件，最低需 ' + getMinStockValue('store', product.id, branchId) + ' 件"'
    : '';

  return '<td class="' + cellClass + '"' + tooltipAttr + '>' +
    buildStockCellContent(branchId, qty, label, isLowCell) +
    '</td>';
}

/**
 * 建立租借商品的單個庫存 <td>。
 * 與 buildStoreStockCell 邏輯相同，但針對租借營地。
 *
 * Builds a single rental product stock <td> for a camp/warehouse.
 *
 * @param {Object}   rental      - 租借商品物件
 * @param {string}   campKey     - 營地 ID / 自訂名稱
 * @param {string}   label       - 顯示名稱
 * @param {Object}   campByKey   - 各營地目前庫存 { campKey: qty }
 * @param {string[]} lowCampKeys - 庫存不足的營地 key 陣列
 * @returns {string} <td> HTML 字串
 */
function buildRentalStockCell(rental, campKey, label, campByKey, lowCampKeys) {
  var isLowCell = lowCampKeys.indexOf(campKey) !== -1;
  var normalizedRental = normalizeRentalItem(rental);
  var variants = normalizeRentalVariants(normalizedRental);
  var hasMultipleVariants = variants.length > 1;

  if (isMinStockMode) {
    if (hasMultipleVariants) {
      return '<td class="stock-cell text-center text-muted">—</td>';
    }

    var singleRentalVariantId = variants[0] && variants[0].id ? variants[0].id : '';
    var minVal = getMinStockValue('rental', normalizedRental.id, campKey, singleRentalVariantId);
    return '<td class="stock-cell">' +
      buildMinStockCellContent(campKey, minVal, label, singleRentalVariantId) +
      '</td>';
  }

  var qty = normalizeStockValue(campByKey[campKey]);
  var cellClass = isLowCell ? 'stock-cell stock-cell-below-min' : 'stock-cell';
  var tooltipAttr = isLowCell
    ? ' title="目前 ' + qty + ' 件，最低需 ' + getMinStockValue('rental', rental.id, campKey) + ' 件"'
    : '';

  return '<td class="' + cellClass + '"' + tooltipAttr + '>' +
    buildStockCellContent(campKey, qty, label, isLowCell) +
    '</td>';
}

/**
 * 最低庫存模式庫存格：瀏覽 span + 隱藏 inline input（與 buildStockCellContent 相同結構）。
 * Min-stock mode cell: display span + hidden inline input (same pattern as normal stock edit).
 *
 * @param {string} fieldName - 分店 / 營地 ID
 * @param {number} minQty    - 目前設定的最低庫存值
 * @param {string} label     - 顯示名稱
 * @param {string} [variantId] - 規格 ID（多規格時使用）
 * @returns {string} HTML 字串
 */
function buildMinStockCellContent(fieldName, minQty, label, variantId) {
  var safeQty = normalizeStockValue(minQty);
  var variantAttr = variantId
    ? ' data-variant-id="' + escapeHtml(variantId) + '"'
    : '';

  return '<span class="stock-display-value"' + variantAttr + ' ' +
    'data-min-stock-field="' + escapeHtml(fieldName) + '">' + safeQty + '</span>' +
    '<input type="number" class="form-control form-control-sm stock-input stock-input-inline d-none" ' +
    'min="0" value="' + safeQty + '" data-original-qty="' + safeQty + '" ' +
    'data-min-stock-field="' + escapeHtml(fieldName) + '"' + variantAttr + ' ' +
    'aria-label="' + escapeHtml(label) + ' 最低庫存">';
}

/**
 * 在確認庫存異動後，重新整理該列各格子的紅色低庫存標示。
 * 僅在正常模式下執行（最低庫存模式下不顯示橘色）。
 *
 * Refreshes red low-stock cell highlights after a stock confirmation.
 * Only applies in normal (non-min-stock) mode.
 *
 * @param {jQuery}   $row        - 目標 <tr>
 * @param {string[]} lowFieldIds - 庫存不足的 field ID 陣列（branchId 或 campKey）
 */
function refreshRowLowStockCells($row, lowFieldIds) {
  if (isMinStockMode) { return; }

  $row.find('td.stock-cell').each(function () {
    $(this).removeClass('stock-cell-below-min').removeAttr('title');
  });

  $row.find('.stock-display-value').removeClass('text-danger');

  lowFieldIds.forEach(function (fieldId) {
    var $input = $row.find('.stock-input[data-stock-field="' + fieldId + '"]');
    var $display = $row.find('.stock-display-value[data-stock-field="' + fieldId + '"]');
    if (!$input.length && !$display.length) {
      return;
    }

    var qty = $input.length ? getStockInputValue($input) : parseInt($display.text(), 10) || 0;
    var $td = ($input.length ? $input : $display).closest('td');
    var inventoryType = $row.data('inventory-type') || 'store';
    var productId = $row.data('product-id');
    var minVal = getMinStockValue(inventoryType, productId, fieldId);

    $td.addClass('stock-cell-below-min')
      .attr('title', '目前 ' + qty + ' 件，最低需 ' + minVal + ' 件');
    $display.addClass('text-danger');
  });
}

/**
 * 正常模式庫存格：瀏覽 span + 隱藏 inline input。
 * Normal mode stock cell: display span + hidden inline input.
 */
function buildStockCellContent(fieldName, qty, label, isLowCell) {
  var safeQty = normalizeStockValue(qty);
  var displayClass = isLowCell ? ' text-danger' : '';

  return '<span class="stock-display-value' + displayClass + '">' + safeQty + '</span>';
}

/**
 * 最後一欄「修改庫存數量」：右側 sticky，每列一組 ✏️ / ✓ / ✗。
 * Last column: right sticky stock edit actions (one pencil per row).
 */
function buildStockEditColumnCell() {
  var cellClass = 'sticky-col sticky-col-right sticky-col-stock-edit text-center';
  var editTitle = '設定最低庫存';

  return '<td class="' + cellClass + '">' +
    '<div class="stock-edit-actions-wrap">' +
      '<button type="button" class="btn btn-link btn-sm p-0 stock-edit-btn" title="' + editTitle + '">' +
        '<i class="fas fa-pencil-alt text-primary"></i>' +
      '</button>' +
      '<div class="stock-edit-actions d-none">' +
        '<button type="button" class="btn btn-link btn-sm p-0 stock-confirm-btn" title="儲存" disabled>' +
          '<i class="fas fa-check text-primary"></i>' +
        '</button>' +
        '<button type="button" class="btn btn-link btn-sm p-0 stock-cancel-btn" title="取消">' +
          '<i class="fas fa-times text-danger"></i>' +
        '</button>' +
      '</div>' +
    '</div>' +
    '</td>';
}

/** 舊 mock 資料中不應再出現在 specifications 的欄位 / Deprecated spec keys */
var DEPRECATED_SPECIFICATION_KEYS = {
  '規格': true,
  '分類': true,
  '售價': true,
  '狀態': true
};

/**
 * 移除 specifications 中與商品主欄位重複的舊 key。
 * Strip legacy duplicate keys from specifications object.
 */
function cleanLegacySpecifications(specifications) {
  var cleaned = {};

  if (!specifications || typeof specifications !== 'object') {
    return cleaned;
  }

  Object.keys(specifications).forEach(function (key) {
    if (!DEPRECATED_SPECIFICATION_KEYS[key]) {
      cleaned[key] = specifications[key];
    }
  });

  return cleaned;
}

/**
 * 組合規格顯示文字，例如「藍色、L」。
 * Build variant label from color and size parts.
 */
function buildVariantLabel(color, size) {
  return [color, size].filter(function (part) {
    return !!part;
  }).join('、');
}

/**
 * 從商品物件取得規格陣列（支援 variants / spec / 舊 specifications 格式）。
 * Normalize variants from product data with backward compatibility.
 */
function normalizeProductVariants(product) {
  var variants = [];

  if (product.variants && product.variants.length) {
    variants = product.variants.map(function (variant) {
      var color = (variant.color || '').trim();
      var size = (variant.size || '').trim();
      return {
        id: (variant.id || '').trim(),
        sku: String(variant.sku || '').trim(),
        color: color,
        size: size,
        specification: String(variant.specification || '').trim(),
        label: (variant.label || '').trim() || String(variant.specification || '').trim() || buildVariantLabel(color, size),
        price: variant.price == null ? '' : String(variant.price),
        status: variant.status || 'active',
        availableQuantity: normalizeStockValue(variant.availableQuantity),
        branch: cloneBranchStock(variant.branch),
        camp: cloneCampStock(variant.camp),
        total: normalizeStockValue(variant.total)
      };
    });
  } else if (product.spec) {
    variants = [{
      id: '',
      color: String(product.spec).trim(),
      size: '',
      label: String(product.spec).trim(),
      branch: createEmptyBranchStock(),
      camp: createEmptyCampStock(),
      total: 0
    }];
  } else {
    var legacySpec = product.specifications && product.specifications['規格'];
    if (legacySpec) {
      variants = [{
        id: '',
        color: String(legacySpec).trim(),
        size: '',
        label: String(legacySpec).trim(),
        branch: createEmptyBranchStock(),
        camp: createEmptyCampStock(),
        total: 0
      }];
    }
  }

  return variants;
}

/**
 * 確保商品 variants 皆含 branch 庫存；舊資料將 product.branch 遷移至第一個規格。
 * Ensure each variant has branch stock; migrate legacy product.branch to first variant.
 */
function ensureProductVariantStock(product) {
  if (!product) {
    return product;
  }

  var variants = normalizeProductVariants(product);
  var hasVariantBranchStock = variants.some(function (variant) {
    return variant.branch && getBranchTotal(variant.branch) > 0;
  });

  if (!variants.length) {
    variants = [{
      id: '',
      color: '',
      size: '',
      label: '',
      branch: createEmptyBranchStock(),
      camp: createEmptyCampStock(),
      total: 0
    }];
  }

  if (!hasVariantBranchStock && product.branch && typeof product.branch === 'object') {
    variants[0].branch = cloneBranchStock(product.branch);
    for (var i = 1; i < variants.length; i++) {
      variants[i].branch = createEmptyBranchStock();
    }
  }

  variants.forEach(function (variant, index) {
    if (!variant.id) {
      variant.id = product.id ? ('v-' + product.id + '-' + index) : generateVariantId();
    }
    if (!variant.branch || typeof variant.branch !== 'object') {
      variant.branch = createEmptyBranchStock();
    }
    // 只保留固定分店 ID，丟棄舊自訂 key
    // Keep preset branch IDs only; drop legacy custom keys
    variant.branch = cloneBranchStock(variant.branch);
    variant.total = getBranchTotal(variant.branch);
  });

  product.variants = variants;
  product.branch = aggregateBranchFromVariants(variants);
  product.totalStock = aggregateTotalFromVariants(variants);
  return product;
}

/**
 * 正規化租借商品規格；舊資料將 campByKey 遷移至單一規格。
 * Normalize rental variants; migrate legacy campByKey to a single variant.
 */
function normalizeRentalVariants(rental) {
  if (!rental) {
    return [];
  }

  var variants = [];

  if (rental.variants && rental.variants.length) {
    variants = rental.variants.map(function (variant) {
      var color = (variant.color || '').trim();
      var size = (variant.size || '').trim();
      return {
        id: (variant.id || '').trim(),
        color: color,
        size: size,
        label: (variant.label || '').trim() || buildVariantLabel(color, size),
        camp: cloneCampStock(variant.camp),
        total: normalizeStockValue(variant.total)
      };
    });
  } else {
    var campByKey = rental.campByKey || {};
    if (!Object.keys(campByKey).length) {
      campByKey = createEmptyCampStock();
      normalizeRentalCamps(rental.camp).forEach(function (camp) {
        var campId = camp.campgroundId || getCampIdByName(camp.name);
        // 只接受固定營地 ID，忽略舊自訂名稱
        // Accept preset camp IDs only; ignore legacy custom names
        if (campId && isFixedCampId(campId)) {
          campByKey[campId] = camp.quantity;
        }
      });
    }
    variants = [{
      id: '',
      color: '',
      size: '',
      label: '',
      camp: cloneCampStock(campByKey),
      total: getBranchTotal(campByKey)
    }];
  }

  variants.forEach(function (variant, index) {
    if (!variant.id) {
      variant.id = rental.id ? ('v-' + rental.id + '-' + index) : generateVariantId();
    }
    // 只保留固定營地 ID，丟棄舊自訂 key
    // Keep preset camp IDs only; drop legacy custom keys
    variant.camp = cloneCampStock(variant.camp);
    variant.total = getBranchTotal(variant.camp);
  });

  return variants;
}

/** 確保租借商品含 variants 並同步 camp / campByKey 快取（僅固定營地） */
function ensureRentalVariantStock(rental) {
  if (!rental) {
    return rental;
  }

  rental.variants = normalizeRentalVariants(rental);
  var campByKey = createEmptyCampStock();

  rental.variants.forEach(function (variant) {
    ADMIN_RENTAL_CAMP_IDS.forEach(function (campKey) {
      campByKey[campKey] += normalizeStockValue((variant.camp || {})[campKey]);
    });
  });

  rental.campByKey = campByKey;
  rental.camp = aggregateRentalCampFromVariants(rental.variants);
  return rental;
}

/** 取得 Modal 目前是新增或編輯模式 / Modal stock mode: add or edit */
function getProductModalStockMode() {
  return $('#addProductForm').data('edit-product-id') ? 'edit' : 'add';
}

/** 依模式切換規格卡片 UI（新增=主倉進貨；編輯=各分店分配） */
function setVariantStockSectionMode(mode) {
  var isEdit = mode === 'edit';

  $('#variantStockModeHint').text(
    isEdit
      ? '編輯各規格在各分店的庫存數量'
      : '可新增多種規格；各規格數量先進主倉，建立後可分配至各分店'
  );

  syncGlobalStockFieldVisibility();
}

/** 有規格卡片時隱藏全域主倉進貨欄 / Hide global stock field when variant cards exist */
function syncGlobalStockFieldVisibility() {
  var hasCards = $('#productVariantCardList .variant-stock-card').length > 0;
  var isEdit = getProductModalStockMode() === 'edit';
  if (hasCards || isEdit) {
    $('#newProductStockCol').addClass('d-none');
  } else {
    $('#newProductStockCol').removeClass('d-none');
  }
}

/** 清空規格卡片列表 / Clear variant cards */
function clearProductVariantList() {
  $('#productVariantCardList').empty();
  $('#rentalVariantStockList').empty();
  updateProductTotalStockDisplay();
}

/**
 * 建立商店規格卡片內的分店列表 HTML（左 label、右 input）。
 * Build preset branch quantity inputs as horizontal input-group rows.
 */
function buildVariantBranchListHtml(branchStock) {
  var html = '<div class="variant-branch-list vstack gap-1">';
  ADMIN_PRODUCT_BRANCH_IDS.forEach(function (branchId) {
    var label = ADMIN_PRODUCT_BRANCH_LABELS[branchId] || branchId;
    var qty = normalizeStockValue(branchStock && branchStock[branchId]);
    html +=
      '<div class="input-group input-group-sm">' +
        '<span class="input-group-text branch-label">' + escapeHtml(label) + '</span>' +
        '<input type="number" class="form-control variant-branch-qty-input" ' +
        'min="0" value="' + qty + '" data-branch-id="' + escapeHtml(branchId) + '" ' +
        'aria-label="' + escapeHtml(label) + ' 存放數量">' +
      '</div>';
  });
  html += '</div>';
  return html;
}

/**
 * 建立租借規格卡片內的營地列表 HTML（左 label、右 input）。
 * Build preset camp quantity inputs as horizontal input-group rows.
 */
function buildVariantCampListHtml(campStock) {
  var html = '<div class="variant-camp-list vstack gap-1">';
  ADMIN_RENTAL_CAMP_IDS.forEach(function (campId) {
    var label = ADMIN_RENTAL_CAMP_LABELS[campId] || campId;
    var qty = normalizeStockValue(campStock && campStock[campId]);
    html +=
      '<div class="input-group input-group-sm">' +
        '<span class="input-group-text camp-label">' + escapeHtml(label) + '</span>' +
        '<input type="number" class="form-control variant-camp-qty-input" ' +
        'min="0" value="' + qty + '" data-camp-id="' + escapeHtml(campId) + '" ' +
        'aria-label="' + escapeHtml(label) + ' 存放數量">' +
      '</div>';
  });
  html += '</div>';
  return html;
}

/** 取得規格卡片標題文字 / Get variant card display title from color + size */
function getVariantCardTitle($card) {
  var color = $card.find('.variant-color').val().trim();
  var size = $card.find('.variant-size').val().trim();
  return buildVariantLabel(color, size);
}

/** 更新單張規格卡片標題 / Refresh one variant card title and index */
function updateVariantCardTitle($card) {
  var cardIndex = $('#productVariantCardList .variant-stock-card').index($card) + 1;
  var label = getVariantCardTitle($card);
  $card.find('.variant-card-index').text('規格 ' + cardIndex);
  $card.find('.variant-card-title')
    .text(label)
    .toggleClass('d-none', !label);
}

/** 更新所有規格卡片標題 / Refresh all variant card titles */
function refreshVariantCardTitles() {
  $('#productVariantCardList .variant-stock-card').each(function () {
    updateVariantCardTitle($(this));
  });
  refreshRentalVariantCardLabels();
  syncVariantRemoveButtonState();
}

/**
 * 依規格數量更新刪除按鈕（至少保留一個規格）。
 * Toggle remove buttons: hidden/disabled when only one variant card remains.
 */
function syncVariantRemoveButtonState() {
  var $cards = $('#productVariantCardList .variant-stock-card');
  var canRemove = $cards.length > 1;

  $cards.find('.remove-product-variant-btn').each(function () {
    $(this)
      .prop('disabled', !canRemove)
      .toggleClass('d-none', !canRemove)
      .attr('title', canRemove ? '刪除此規格' : '至少需要保留一個規格');
  });
}

/**
 * 動態新增商店規格卡片（含分店庫存欄位）。
 * Append one store variant stock card to the modal.
 */
function addProductVariantCard(variant, mode) {
  var stockMode = mode || getProductModalStockMode();
  var isEdit = stockMode === 'edit';
  var variantData = variant || {};
  var hasPersistedVariant = !!variantData.id;
  var variantId = variantData.id || generateVariantId();
  var branchStock = cloneBranchStock(variantData.branch);
  var mainAddQty = normalizeStockValue(branchStock[ADMIN_STORE_WAREHOUSE_ID]);
  var initialTitle = (variantData.label || buildVariantLabel(variantData.color, variantData.size) || '');
  var cardIndex = $('#productVariantCardList .variant-stock-card').length + 1;

  var $wrapper = $('<div>', { class: 'col-6 variant-card-col' });
  var $card = $('<div>', {
    class: 'variant-stock-card border rounded p-2',
    'data-variant-id': variantId,
    'data-persisted-variant-id': hasPersistedVariant ? variantData.id : ''
  });

  var $toolbar = $('<div>', { class: 'variant-stock-card__toolbar' });
  $toolbar.append(
    $('<span>', { class: 'variant-card-index' }).text('規格 ' + cardIndex),
    $('<span>', { class: 'variant-card-title' + (initialTitle ? '' : ' d-none') }).text(initialTitle),
    $('<button>', {
      type: 'button',
      class: 'btn btn-link btn-sm p-0 variant-collapse-toggle d-none',
      title: '展開/收合庫存'
    }).html('<i class="fas fa-chevron-up"></i>'),
    $('<span>', { class: 'ms-auto small text-muted' }).html(
      '小計 <strong class="variant-total-display">0</strong> 件'
    ),
    $('<button>', {
      type: 'button',
      class: 'btn btn-link btn-sm text-danger p-0 remove-product-variant-btn flex-shrink-0',
      title: '刪除此規格'
    }).html('<i class="fas fa-times"></i>')
  );

  var $body = $('<div>', { class: 'variant-stock-card__body' });
  $body.append(
    $('<label>', { class: 'form-label form-label-sm' }).text('顏色'),
    $('<input>', {
      type: 'text',
      class: 'form-control form-control-sm variant-color',
      placeholder: '例：藍色'
    }).val(variantData.color || ''),
    $('<label>', { class: 'form-label form-label-sm mt-1' }).text('尺寸'),
    $('<input>', {
      type: 'text',
      class: 'form-control form-control-sm variant-size',
      placeholder: '例：L'
    }).val(variantData.size || ''),
    $('<label>', { class: 'form-label form-label-sm mt-1' }).text('SKU'),
    $('<input>', {
      type: 'text',
      class: 'form-control form-control-sm variant-sku',
      maxlength: '64',
      placeholder: '例：TENT-OLIVE'
    }).val(variantData.sku || ''),
    $('<label>', { class: 'form-label form-label-sm mt-1' }).text('規格說明'),
    $('<input>', {
      type: 'text',
      class: 'form-control form-control-sm variant-specification',
      maxlength: '200',
      placeholder: '例：深橄欖綠 / L'
    }).val(variantData.specification || initialTitle),
    $('<div>', { class: 'row g-2 mt-0' }).append(
      $('<div>', { class: 'col-7' }).append(
        $('<label>', { class: 'form-label form-label-sm' }).text('售價'),
        $('<input>', {
          type: 'number',
          class: 'form-control form-control-sm variant-price',
          min: '0',
          step: '0.01',
          placeholder: '3200.00'
        }).val(variantData.price || $('#newProductPrice').val() || '')
      ),
      $('<div>', { class: 'col-5' }).append(
        $('<label>', { class: 'form-label form-label-sm' }).text('狀態'),
        $('<select>', { class: 'form-select form-select-sm variant-status' }).append(
          $('<option>', { value: 'active' }).text('啟用'),
          $('<option>', { value: 'inactive' }).text('停用')
        ).val(variantData.status || 'active')
      )
    )
  );

  if (isAdminProductBackendEnabled()) {
    $body.append(
      $('<div>', { class: 'small text-muted mt-2 border-top pt-2' })
        .text('庫存由庫存異動功能管理，此處只維護商品規格。')
    );
  } else if (isEdit) {
    $body.append(
      $('<div>', { class: 'mt-2 variant-branch-section' }).append(
        $(buildVariantBranchListHtml(branchStock))
      )
    );
  } else {
    $body.append(
      $('<label>', { class: 'form-label form-label-sm mt-1' }).text('此規格進主倉數量'),
      $('<input>', {
        type: 'number',
        class: 'form-control form-control-sm variant-main-add-qty variant-qty-input-narrow',
        min: '0',
        value: mainAddQty,
        'aria-label': '此規格進主倉數量'
      })
    );
  }

  $card.append($toolbar, $body);
  $wrapper.append($card);
  $('#productVariantCardList').append($wrapper);

  updateVariantCardTitle($card);
  updateVariantCardTotal($card);
  syncRentalVariantCardsFromStoreVariants();
  syncGlobalStockFieldVisibility();
  syncVariantRemoveButtonState();
  return $card;
}

/**
 * 動態新增租借規格卡片（含營地庫存欄位）。
 * Append one rental variant stock card to the modal.
 */
function addRentalVariantCard(variant) {
  var variantData = variant || {};
  var variantId = variantData.id || generateVariantId();
  var campStock = cloneCampStock(variantData.camp);
  var label = (variantData.label || buildVariantLabel(variantData.color, variantData.size) || '');
  var cardIndex = $('#rentalVariantStockList .rental-variant-stock-card').length + 1;

  var $wrapper = $('<div>', { class: 'col-6 variant-card-col' });
  var $card = $('<div>', {
    class: 'rental-variant-stock-card border rounded p-2',
    'data-variant-id': variantId,
    'data-variant-color': variantData.color || '',
    'data-variant-size': variantData.size || ''
  });

  var $toolbar = $('<div>', { class: 'variant-stock-card__toolbar' });
  $toolbar.append(
    $('<span>', { class: 'variant-card-index variant-card-title' })
      .text(buildRentalVariantCardTitle(cardIndex, label)),
    $('<button>', {
      type: 'button',
      class: 'btn btn-link btn-sm p-0 rental-variant-collapse-toggle d-none',
      title: '展開/收合營地庫存'
    }).html('<i class="fas fa-chevron-up"></i>'),
    $('<span>', { class: 'ms-auto small text-muted' }).html(
      '小計 <strong class="rental-variant-total-display">0</strong> 件'
    )
  );

  var $body = $('<div>', { class: 'rental-variant-stock-card__body' });
  $body.append(
    $('<div>', { class: 'form-label form-label-sm text-muted mb-1' }).text('各營地庫存'),
    $(buildVariantCampListHtml(campStock))
  );

  $card.append($toolbar, $body);
  $wrapper.append($card);
  $('#rentalVariantStockList').append($wrapper);

  updateRentalVariantCardTotal($card);
  return $card;
}

/** 組合租借規格卡片標題 / Build rental variant card toolbar title */
function buildRentalVariantCardTitle(cardIndex, label) {
  return '規格 ' + cardIndex + (label ? ' · ' + label : '');
}

/** 取得規格在列表中顯示的加總庫存 / Get variant total for list display */
function getVariantDisplayTotal(variant, inventoryType) {
  if (!variant) {
    return 0;
  }
  if (variant.total != null) {
    return normalizeStockValue(variant.total);
  }
  if (inventoryType === 'rental') {
    return getBranchTotal(variant.camp || {});
  }
  return getBranchTotal(variant.branch || {});
}

/**
 * 從規格卡片收集分店庫存（僅固定分店）。
 * Collect branch stock from one variant card (preset branches only).
 */
function collectVariantBranchStockFromCard($card) {
  var branchStock = createEmptyBranchStock();

  $card.find('.variant-branch-list .variant-branch-qty-input').each(function () {
    var branchId = $(this).data('branch-id');
    if (branchId && isFixedBranchId(branchId)) {
      branchStock[branchId] = normalizeStockValue($(this).val());
    }
  });

  return branchStock;
}

/**
 * 從租借規格卡片收集營地庫存（僅固定營地）。
 * Collect camp stock from one rental variant card (preset camps only).
 */
function collectVariantCampStockFromCard($card) {
  var campStock = createEmptyCampStock();

  $card.find('.variant-camp-list .variant-camp-qty-input').each(function () {
    var campId = $(this).data('camp-id');
    if (campId && isFixedCampId(campId)) {
      campStock[campId] = normalizeStockValue($(this).val());
    }
  });

  return campStock;
}

/** 更新單張商店規格卡片的小計 / Update one store variant card subtotal */
function updateVariantCardTotal($card) {
  var mode = getProductModalStockMode();
  var total = 0;

  if (mode === 'add') {
    total = normalizeStockValue($card.find('.variant-main-add-qty').val());
  } else {
    total = getBranchTotal(collectVariantBranchStockFromCard($card));
  }

  $card.find('.variant-total-display').text(total);
  updateProductTotalStockDisplay();
}

/** 更新單張租借規格卡片的小計 / Update one rental variant card subtotal */
function updateRentalVariantCardTotal($card) {
  var total = getBranchTotal(collectVariantCampStockFromCard($card));
  $card.find('.rental-variant-total-display').text(total);
}

/** 更新商品總庫存顯示 / Update product total stock display */
function updateProductTotalStockDisplay() {
  var total = 0;
  $('#productVariantCardList .variant-stock-card').each(function () {
    total += parseInt($(this).find('.variant-total-display').text(), 10) || 0;
  });
  $('#editProductTotalStock').text(total);
}

/**
 * 依商店規格卡片同步租借規格卡片（保留既有營地數量）。
 * Sync rental variant cards from store variant cards while preserving camp stock.
 */
function syncRentalVariantCardsFromStoreVariants() {
  if (!$('#rentalEditModeSection').is(':visible') && $('#rentalCampField').hasClass('d-none')) {
    return;
  }

  var existingCampByVariantId = {};
  $('#rentalVariantStockList .rental-variant-stock-card').each(function () {
    var variantId = $(this).data('variant-id');
    existingCampByVariantId[variantId] = collectVariantCampStockFromCard($(this));
  });

  $('#rentalVariantStockList').empty();

  $('#productVariantCardList .variant-stock-card').each(function () {
    var $storeCard = $(this);
    var variantId = $storeCard.data('variant-id');
    var color = $storeCard.find('.variant-color').val().trim();
    var size = $storeCard.find('.variant-size').val().trim();
    addRentalVariantCard({
      id: variantId,
      color: color,
      size: size,
      label: buildVariantLabel(color, size),
      camp: existingCampByVariantId[variantId] || createEmptyCampStock()
    });
  });
}

/** 更新租借規格卡片的顯示標籤 / Refresh rental variant card labels */
function refreshRentalVariantCardLabels() {
  $('#rentalVariantStockList .rental-variant-stock-card').each(function () {
    var $card = $(this);
    var variantId = $card.data('variant-id');
    var $storeCard = $('#productVariantCardList .variant-stock-card[data-variant-id="' + variantId + '"]');
    if (!$storeCard.length) {
      return;
    }
    var color = $storeCard.find('.variant-color').val().trim();
    var size = $storeCard.find('.variant-size').val().trim();
    var label = buildVariantLabel(color, size);
    var cardIndex = $('#rentalVariantStockList .rental-variant-stock-card').index($card) + 1;
    $card.attr('data-variant-color', color);
    $card.attr('data-variant-size', size);
    $card.find('.variant-card-index.variant-card-title')
      .text(buildRentalVariantCardTitle(cardIndex, label));
  });
}

/**
 * 從 Modal 收集所有商店規格（含庫存）。
 * Collect all store variants with stock from modal cards.
 */
function getProductVariantsWithStock(mode) {
  var stockMode = mode || getProductModalStockMode();
  var variants = [];
  var labels = {};
  var rawValues = [];

  $('#productVariantCardList .variant-stock-card').each(function () {
    var $card = $(this);
    var color = $card.find('.variant-color').val().trim();
    var size = $card.find('.variant-size').val().trim();
    var specification = $card.find('.variant-specification').val().trim();
    var label = specification || buildVariantLabel(color, size);

    if (!color && !size && !specification) {
      return;
    }

    if (labels[label]) {
      labels[label] = 2;
    } else {
      labels[label] = 1;
    }

    var branchStock;
    if (stockMode === 'add') {
      var mainQty = normalizeStockValue($card.find('.variant-main-add-qty').val());
      rawValues.push($card.find('.variant-main-add-qty').val());
      branchStock = createInitialBranchStock(mainQty);
    } else {
      rawValues = rawValues.concat(
        $card.find('.variant-branch-qty-input').map(function () { return $(this).val(); }).get()
      );
      branchStock = collectVariantBranchStockFromCard($card);
    }

    variants.push({
      id: $card.data('variant-id') || generateVariantId(),
      persistedId: $card.attr('data-persisted-variant-id') || null,
      sku: $card.find('.variant-sku').val().trim(),
      color: color,
      size: size,
      label: label,
      specification: specification || label,
      price: $card.find('.variant-price').val() || $('#newProductPrice').val() || '0',
      status: $card.find('.variant-status').val() || 'active',
      branch: branchStock,
      total: getBranchTotal(branchStock)
    });
  });

  var duplicateLabel = Object.keys(labels).find(function (label) {
    return labels[label] > 1;
  });

  return {
    variants: variants,
    duplicateLabel: duplicateLabel || null,
    rawValues: rawValues
  };
}

/**
 * 從 Modal 收集所有租借規格（含營地庫存）。
 * Collect all rental variants with camp stock from modal cards.
 */
function collectRentalVariantsWithStock() {
  var variants = [];
  var rawValues = [];

  $('#rentalVariantStockList .rental-variant-stock-card').each(function () {
    var $card = $(this);
    var variantId = $card.data('variant-id');
    var $storeCard = $('#productVariantCardList .variant-stock-card[data-variant-id="' + variantId + '"]');
    var color = String($card.data('variant-color') || '').trim();
    var size = String($card.data('variant-size') || '').trim();

    if ($storeCard.length) {
      color = $storeCard.find('.variant-color').val().trim();
      size = $storeCard.find('.variant-size').val().trim();
    }

    var label = buildVariantLabel(color, size);

    rawValues = rawValues.concat(
      $card.find('.variant-camp-qty-input').map(function () { return $(this).val(); }).get()
    );

    var campStock = collectVariantCampStockFromCard($card);
    variants.push({
      id: variantId || generateVariantId(),
      color: color,
      size: size,
      label: label,
      camp: campStock,
      total: getBranchTotal(campStock)
    });
  });

  return {
    variants: variants,
    rawValues: rawValues
  };
}

/**
 * 編輯商品時，將 variants 回填到 Modal 規格卡片。
 * Populate variant stock cards when editing a store product.
 */
function populateProductVariantCards(product, mode) {
  clearProductVariantList();
  var stockMode = mode || 'edit';
  var variants = normalizeProductVariants(product);

  if (!variants.length) {
    addProductVariantCard(null, stockMode);
  } else {
    variants.forEach(function (variant) {
      var $card = addProductVariantCard(variant, stockMode);
      // 多規格時仍顯示展開/收合按鈕，但預設全部展開
      // Multi-variant: show collapse toggle, default all expanded
      if (stockMode === 'edit' && variants.length > 1) {
        $card.find('.variant-collapse-toggle').removeClass('d-none');
      }
    });
  }

  setVariantStockSectionMode(stockMode);
  updateProductTotalStockDisplay();
  syncVariantRemoveButtonState();
}

/** 依商店規格對應租借營地庫存 / Match rental camp stock to a store variant */
function findRentalCampForStoreVariant(rentalVariants, storeVariant, index) {
  var matched = (rentalVariants || []).find(function (rentalVariant) {
    return rentalVariant.id && storeVariant.id && rentalVariant.id === storeVariant.id;
  });
  if (matched && matched.camp) {
    return cloneCampStock(matched.camp);
  }
  if (rentalVariants[index] && rentalVariants[index].camp) {
    return cloneCampStock(rentalVariants[index].camp);
  }
  if (index === 0 && rentalVariants.length === 1 && rentalVariants[0].camp) {
    return cloneCampStock(rentalVariants[0].camp);
  }
  return createEmptyCampStock();
}

/**
 * 回填租借規格卡片；標題優先使用商店規格（顏色/尺寸），不使用商品名稱。
 * Populate rental variant cards; titles come from linked store variants when available.
 *
 * @param {Object} rental       - 租借商品
 * @param {Object} [storeProduct] - 關聯商店商品（可選，未傳則自動查找）
 */
function populateRentalVariantCards(rental, storeProduct) {
  $('#rentalVariantStockList').empty();
  if (!rental) {
    return;
  }

  var rentalVariants = normalizeRentalVariants(rental);
  var storeProductResolved = storeProduct || findStoreProductByRentalId(rental.id);
  var storeVariants = storeProductResolved ? normalizeProductVariants(storeProductResolved) : [];
  var cardsToRender = [];

  if (storeVariants.length) {
    storeVariants.forEach(function (storeVariant, index) {
      cardsToRender.push({
        id: storeVariant.id,
        color: storeVariant.color,
        size: storeVariant.size,
        label: buildVariantLabel(storeVariant.color, storeVariant.size),
        camp: findRentalCampForStoreVariant(rentalVariants, storeVariant, index)
      });
    });
  } else {
    cardsToRender = rentalVariants.map(function (rentalVariant) {
      return {
        id: rentalVariant.id,
        color: rentalVariant.color,
        size: rentalVariant.size,
        label: rentalVariant.label || buildVariantLabel(rentalVariant.color, rentalVariant.size),
        camp: rentalVariant.camp
      };
    });
  }

  if (!cardsToRender.length) {
    return;
  }

  cardsToRender.forEach(function (variant) {
    var $card = addRentalVariantCard(variant);
    // 多規格時仍顯示展開/收合按鈕，但預設全部展開
    // Multi-variant: show collapse toggle, default all expanded
    if (cardsToRender.length > 1) {
      $card.find('.rental-variant-collapse-toggle').removeClass('d-none');
    }
  });
}

/** @deprecated 使用 getProductVariantsWithStock / Use getProductVariantsWithStock instead */
function getProductVariants() {
  return getProductVariantsWithStock().variants.map(function (variant) {
    return {
      color: variant.color,
      size: variant.size,
      label: variant.label
    };
  });
}

function findAdminProductById(productId) {
  return (adminProductsCache || []).find(function (product) {
    return product.id === productId;
  });
}

/**
 * 依 rentalId 找對應的商店商品。
 * Find the store product linked to a rental ID.
 */
function findStoreProductByRentalId(rentalId) {
  return (adminProductsCache || []).find(function (product) {
    return product.rentalId === rentalId;
  });
}

/**
 * 編輯租借 Modal 時取得品牌：優先 rental.brand，否則從關聯商店商品帶入。
 * Brand for rental edit form: rental.brand first, then linked store product.
 */
function getRentalBrandForForm(rental) {
  if (rental && rental.brand) {
    return String(rental.brand).trim();
  }

  var linkedStore = rental && rental.id ? findStoreProductByRentalId(rental.id) : null;
  return (linkedStore && linkedStore.brand) ? String(linkedStore.brand).trim() : '';
}

/**
 * 租借商品更新品牌時，同步寫回關聯的商店商品。
 * Sync brand from rental save to the linked store product.
 */
function syncLinkedStoreProductBrand(rentalId, brand) {
  var linkedStore = findStoreProductByRentalId(rentalId);

  if (!linkedStore) {
    return;
  }

  linkedStore.brand = brand;
  upsertAdminProductCache(linkedStore);
}

/**
 * 判斷商店商品是否已「啟用租借」。
 * Mock：看 rentalId／rentalEnabled。
 * Backend：同一 equipment itemId 已有對應租借 SKU 即可調撥。
 *
 * Returns true when rental is enabled / linkable for transfer.
 */
function isProductRentalEnabled(product) {
  if (!product) {
    return false;
  }
  if (isAdminProductBackendEnabled()) {
    return !!(product.itemId && findAdminRentalByItemId(product.itemId));
  }
  if (!product.rentalId) {
    return false;
  }
  if (product.rentalEnabled === undefined) {
    return true;
  }
  return !!product.rentalEnabled;
}

/** 依 equipment itemId 找租借 SKU（商店／租借共用 item）。 */
function findAdminRentalByItemId(itemId) {
  if (!itemId) {
    return null;
  }
  return (adminRentalsCache || []).find(function (item) {
    return item.itemId === itemId;
  }) || null;
}

/** 依 itemId 找商店商品（供租借 tab 調撥入口）。 */
function findStoreProductByItemId(itemId) {
  if (!itemId) {
    return null;
  }
  return (adminProductsCache || []).find(function (item) {
    return item.itemId === itemId;
  }) || null;
}

/**
 * 只保留已啟用租借的租借商品（供租借 tab 表格顯示）。
 * Backend：直接顯示 API 回傳的租借 SKU（不再依 mock rentalEnabled 過濾）。
 */
function filterEnabledRentals(rentals) {
  if (isAdminProductBackendEnabled()) {
    return rentals || [];
  }
  return (rentals || []).filter(function (rental) {
    var storeProduct = findStoreProductByRentalId(rental.id);
    return storeProduct && isProductRentalEnabled(storeProduct);
  });
}

// 商品 Modal 圖片預覽用的 blob URL（關閉 Modal 時需 revoke 避免記憶體洩漏）
// Blob URLs used for live file previews — revoke on modal reset to avoid leaks
var productPreviewObjectUrls = [];
var productGlightboxInstance = null;
var productImageSortableInstance = null;
var PRODUCT_IMAGE_GLIGHTBOX_GALLERY = 'product-images-gallery';

/** 釋放所有預覽用 blob URL / Revoke all preview blob URLs */
function revokeProductPreviewObjectUrls() {
  productPreviewObjectUrls.forEach(function (url) {
    URL.revokeObjectURL(url);
  });
  productPreviewObjectUrls = [];
}

/**
 * 記錄 blob URL 供之後釋放
 * Track a blob URL so it can be revoked later
 * @param {string} url
 * @returns {string}
 */
function trackProductPreviewObjectUrl(url) {
  if (url && url.indexOf('blob:') === 0) {
    productPreviewObjectUrls.push(url);
  }
  return url;
}

/** 銷毀 GLightbox 實例 / Destroy GLightbox instance */
function destroyProductGlightbox() {
  if (productGlightboxInstance && typeof productGlightboxInstance.destroy === 'function') {
    productGlightboxInstance.destroy();
  }
  productGlightboxInstance = null;
}

/** 銷毀 Sortable 實例 / Destroy Sortable instance */
function destroyProductImageSortable() {
  if (productImageSortableInstance) {
    productImageSortableInstance.destroy();
    productImageSortableInstance = null;
  }
}

/**
 * 依 DOM 順序同步 product-image-items
 * Sync image list order from sortable DOM
 */
function syncProductImageOrderFromDom() {
  var $form = $('#addProductForm');
  var itemMap = {};

  getProductImageItems($form).forEach(function (item) {
    itemMap[item.id] = item;
  });

  var newOrder = [];
  $('#newProductImagesSortable .product-image-preview-item').each(function () {
    var id = String($(this).attr('data-item-id') || '');
    if (itemMap[id]) {
      newOrder.push(itemMap[id]);
    }
  });

  if (newOrder.length) {
    setProductImageItems($form, newOrder);
  }
}

/** 初始化商品圖片拖曳排序 / Init drag-and-drop reorder for product images */
function initProductImageSortable() {
  destroyProductImageSortable();

  var el = document.getElementById('newProductImagesSortable');
  if (!el || typeof Sortable === 'undefined') {
    return;
  }

  productImageSortableInstance = Sortable.create(el, {
    animation: 150,
    handle: '.product-image-drag-handle',
    draggable: '.product-image-preview-item',
    ghostClass: 'product-image-sortable-ghost',
    onEnd: function () {
      syncProductImageOrderFromDom();
      refreshProductImagePreviews();
    }
  });
}

/** 重新綁定 GLightbox（動態 DOM 更新後呼叫） / Re-init GLightbox after DOM refresh */
function initProductGlightbox() {
  destroyProductGlightbox();
  if (typeof GLightbox === 'undefined') {
    return;
  }
  if (!$('#addProductModal .product-glightbox').length) {
    return;
  }
  productGlightboxInstance = GLightbox({
    selector: '#addProductModal .product-glightbox',
    touchNavigation: true,
    loop: true,
    // 關閉 zoom / drag，開啟時直接整圖 fit 視窗
    // Disable zoom/drag so images open fully fitted in viewport
    zoomable: false,
    draggable: false
  });
}

// 新選檔案 item id 序號 / Sequence for generated file item ids
var productImageFileSeq = 0;

/**
 * 產生唯一圖片項目 ID
 * Generate a unique image item id
 * @param {'file'} type
 * @returns {string}
 */
function createProductImageItemId(type) {
  productImageFileSeq += 1;
  if (type === 'file') {
    return 'file:' + Date.now() + '-' + productImageFileSeq;
  }
  return type;
}

/**
 * 從已儲存的 thumbnail / images 建立有序圖片列表
 * Build ordered image list from saved product.image and product.images
 *
 * @param {string} thumbnail
 * @param {string[]} images
 * @returns {Array<{id:string,type:string,src?:string,file?:File}>}
 */
function buildProductImageItemsFromSaved(thumbnail, images) {
  var list = [];
  var seen = {};

  if (Array.isArray(images) && images.length) {
    images.forEach(function (src) {
      if (src && !seen[src]) {
        seen[src] = true;
        list.push({ id: 'path:' + src, type: 'path', src: src });
      }
    });
    return list;
  }

  if (thumbnail && thumbnail !== PRODUCT_IMAGE_PLACEHOLDER) {
    list.push({ id: 'path:' + thumbnail, type: 'path', src: thumbnail });
  }

  return list;
}

/** 讀取 form 上的圖片列表 / Get image list from form data */
function getProductImageItems($form) {
  return ($form.data('product-image-items') || []).slice();
}

/** 寫入 form 上的圖片列表 / Save image list to form data */
function setProductImageItems($form, items) {
  $form.data('product-image-items', items || []);
}

/**
 * 取得單一圖片項目的預覽 URL
 * Get preview URL for one image item
 */
function getProductImageItemPreviewSrc(item) {
  if (item.type === 'file' && item.file) {
    return trackProductPreviewObjectUrl(URL.createObjectURL(item.file));
  }
  return item.src || PRODUCT_IMAGE_PLACEHOLDER;
}

/**
 * 將新選檔案追加至圖片列表（不清除既有圖）
 * Append newly selected files to the image list
 *
 * @param {FileList|File[]} fileList
 */
function appendNewProductImageFiles(fileList) {
  var files = fileList ? Array.prototype.slice.call(fileList) : [];
  if (!files.length) {
    return;
  }

  var $form = $('#addProductForm');
  var items = getProductImageItems($form);

  files.forEach(function (file) {
    items.push({
      id: createProductImageItemId('file'),
      type: 'file',
      file: file
    });
  });

  setProductImageItems($form, items);
  $('#newProductImages').val('');
  refreshProductImagePreviews();
}

/**
 * 建立帶 GLightbox、刪除與拖曳把手的預覽卡片
 * Build preview card with GLightbox, remove and drag handle
 */
function buildProductImagePreviewCardHtml(item, index) {
  var src = getProductImageItemPreviewSrc(item);
  var isMain = index === 0;

  var mainBadge = isMain
    ? '<span class="badge bg-primary product-image-main-badge">主圖</span>'
    : '';

  return (
    '<div class="product-image-preview-item position-relative' + (isMain ? ' is-main' : '') + '"' +
      ' data-item-id="' + escapeHtml(item.id) + '">' +
      mainBadge +
      '<button type="button" class="btn btn-sm btn-danger product-image-remove-btn"' +
        ' data-item-id="' + escapeHtml(item.id) + '"' +
        ' title="移除圖片" aria-label="移除圖片">' +
        '<i class="fas fa-times"></i></button>' +
      '<a href="' + escapeHtml(src) + '" class="glightbox product-glightbox"' +
        ' data-type="image"' +
        ' data-gallery="' + escapeHtml(PRODUCT_IMAGE_GLIGHTBOX_GALLERY) + '">' +
        '<img src="' + escapeHtml(src) + '" alt="商品圖片 ' + (index + 1) + '"' +
          ' class="product-image-preview-thumb"' +
          ' onerror="this.src=\'' + PRODUCT_IMAGE_PLACEHOLDER + '\'">' +
        '<span class="product-image-zoom-badge" title="放大預覽">' +
          '<i class="fas fa-search-plus"></i></span>' +
      '</a>' +
      '<button type="button" class="btn btn-sm btn-light product-image-drag-handle"' +
        ' title="拖曳調整順序" aria-label="拖曳調整順序">' +
        '<i class="fas fa-grip-vertical"></i></button>' +
    '</div>'
  );
}

/**
 * 儲存前解析 thumbnail / images（第一張為主圖）
 * Resolve thumbnail and images for save — first item is main image
 */
function resolveProductImagesForSave($form) {
  var items = getProductImageItems($form);
  var images = items.map(function (item) {
    if (item.type === 'file' && item.file) {
      return URL.createObjectURL(item.file);
    }
    return item.src;
  }).filter(Boolean);

  var thumbnail = images[0] || PRODUCT_IMAGE_PLACEHOLDER;
  return { image: thumbnail, images: images };
}

/** 儲存前解析租借商品主圖（取列表第一張）/ Resolve rental main image from list */
function resolveRentalImageForSave($form) {
  return resolveProductImagesForSave($form).image;
}

/** 從列表移除指定圖片 / Remove one image item by id */
function handleProductImageRemove(itemId) {
  if (!itemId) {
    return;
  }

  var $form = $('#addProductForm');
  var items = getProductImageItems($form).filter(function (item) {
    return item.id !== itemId;
  });

  setProductImageItems($form, items);
  refreshProductImagePreviews();
}

/** 清空商品 Modal 圖片預覽 / Clear product modal image previews */
function clearProductImagePreviews() {
  revokeProductPreviewObjectUrls();
  destroyProductGlightbox();
  destroyProductImageSortable();
  $('#newProductImagesPreview').html('<span class="text-muted small">尚未選擇圖片</span>');
}

/**
 * 渲染商品圖片列表預覽
 * Render unified product image list preview
 *
 * @param {Array} items
 */
function renderProductImageListPreview(items) {
  var $box = $('#newProductImagesPreview');

  if (!items || items.length === 0) {
    $box.html('<span class="text-muted small">尚未選擇圖片</span>');
    return;
  }

  var cards = items.map(function (item, index) {
    return buildProductImagePreviewCardHtml(item, index);
  }).join('');

  $box.html(
    '<div id="newProductImagesSortable" class="product-image-sortable d-flex flex-wrap gap-2 w-100">' +
    cards +
    '</div>'
  );
}

/**
 * 依 JSON 既有路徑渲染預覽（編輯模式開啟時使用）
 * Render previews from saved product paths (used when opening edit modal)
 */
function renderProductImagePreviews(thumbnail, images) {
  var $form = $('#addProductForm');
  setProductImageItems($form, buildProductImageItemsFromSaved(thumbnail, images));
  refreshProductImagePreviews();
}

/** 依 form 上的圖片列表重新渲染預覽 / Re-render previews from image list state */
function refreshProductImagePreviews() {
  revokeProductPreviewObjectUrls();
  destroyProductImageSortable();

  var $form = $('#addProductForm');
  renderProductImageListPreview(getProductImageItems($form));
  initProductGlightbox();
  initProductImageSortable();
}

// 將商店商品資料回填到新增商品 Modal，切換為編輯狀態。
// Populates the modal with store product data and switches to edit mode.
function fillProductModal(product) {
  resetProductModalForm();
  setProductModalMode('edit');

  $('#addProductForm')
    .data('edit-product-id', product.id)
    .data('edit-type', 'store')
    .data('existing-status', product.status || 'active');

  $('#newProductStockCol').addClass('d-none');
  $('#productVariantStockSection').removeClass('d-none');

  $('#newProductIsRentalWrapper').removeClass('d-none');
  var hasRental = isProductRentalEnabled(product);
  $('#newProductIsRental').prop('checked', hasRental);

  if (hasRental) {
    var linkedRental = findAdminRentalById(product.rentalId);
    syncRentalFormState(true, true, true);
    populateProductVariantCards(product, 'edit');
    if (linkedRental) {
      populateRentalVariantCards(linkedRental, product);
    } else {
      syncRentalVariantCardsFromStoreVariants();
    }
  } else {
    syncRentalFormState(false, false, true);
    populateProductVariantCards(product, 'edit');
  }

  $('#newProductStock').prop('readonly', false).removeClass('bg-light');
  $('#newProductName').val(product.name || '');
  setProductComboboxValue('category', product.category || '其他');
  setProductComboboxValue('brand', product.brand || '');
  $('#newProductPrice').val(product.price || '');
  $('#newProductStatus').val(product.status || 'active');
  setProductDescriptionHtml(product.description || '');

  renderProductImagePreviews(product.image || '', product.images || []);
  syncBackendProductUi();
}

// 將租借商品資料回填到新增商品 Modal，並帶入各營地庫存明細。
// Populates the modal with rental product data and switches to edit mode.
function fillRentalModal(rental) {
  resetProductModalForm();
  setProductModalMode('edit');

  $('#addProductForm')
    .data('edit-product-id', rental.id)
    .data('edit-type', 'rental')
    .data('existing-status', 'active');

  $('#newProductIsRentalWrapper').addClass('d-none');
  $('#newProductStockCol').addClass('d-none');
  $('#productVariantStockSection').addClass('d-none');

  $('#newProductIsRental').prop('checked', true);
  syncRentalFormState(true, true);
  $('#newProductName').val(rental.name || '');
  setProductComboboxValue('category', rental.category || '其他');
  setProductComboboxValue('brand', getRentalBrandForForm(rental));
  $('#newProductPrice').val('');
  populateRentalVariantCards(rental, findStoreProductByRentalId(rental.id));
  $('#newProductStock').val(getRentalTotalStock(rental)).prop('readonly', true).addClass('bg-light');
  renderProductImagePreviews(rental.image || '', []);
}

// 重設新增商品 Modal 的欄位、暫存狀態與租借營地清單。
// Resets all form fields, data attributes, and rental camp states.
function resetProductModalForm() {
  var form = $('#addProductForm')[0];
  if (form) {
    form.reset();
  }

  $('#addProductForm')
    .removeData('edit-product-id')
    .removeData('edit-type')
    .removeData('existing-status')
    .removeData('product-image-items');

  clearProductVariantList();
  $('#rentalVariantStockList').empty();

  $('#newRentalWarehouseStock').val(0);

  $('#newProductIsRental').prop('checked', false);
  $('#newProductStatus').val('active');
  $('#newProductStock').prop('readonly', false).removeClass('bg-light').val('0');
  setProductDescriptionHtml('');
  setProductModalMode('add');
  syncRentalFormState(false);

  $('#newProductIsRentalWrapper').addClass('d-none');
  $('#newProductStockCol').removeClass('d-none');
  $('#productVariantStockSection').removeClass('d-none');
  addProductVariantCard(null, 'add');
  setVariantStockSectionMode('add');
  $('#editProductTotalStock').text(0);
  resetProductComboboxFields();

  // （損耗備註欄位已移除，無需 reset）
  // Loss reason fields have been removed; nothing to reset here.

  clearProductImagePreviews();
  syncBackendProductUi();
}

/**
 * 從商品 Modal 建立後端允許的乾淨 Request。
 * 此處刻意不包含 branch、totalStock、rentalEnabled 或 camp。
 */
function buildAdminProductRequestFromForm() {
  var name = String($('#newProductName').val() || '').trim();
  var categoryName = getProductComboboxValue('category');
  var brandName = getProductComboboxValue('brand');
  var categoryId = findAdminCategoryId(categoryName);
  var brandId = findAdminBrandId(brandName);
  var variantState = getProductVariantsWithStock(getProductModalStockMode());

  if (!name) {
    throw new Error('請填寫商品名稱');
  }
  if (categoryId === null) {
    throw new Error('請選擇後端已建立的商品分類');
  }
  if (brandName && brandId === null) {
    throw new Error('請選擇後端已建立的品牌');
  }
  if (!variantState.variants.length) {
    throw new Error('請至少新增一筆規格');
  }

  var variants = variantState.variants.map(function (variant, index) {
    var price = Number(variant.price);
    if (!variant.sku) {
      throw new Error('規格 ' + (index + 1) + ' 請填寫 SKU');
    }
    if (!variant.specification) {
      throw new Error('規格 ' + (index + 1) + ' 請填寫規格說明');
    }
    if (!Number.isFinite(price) || price < 0) {
      throw new Error('規格 ' + (index + 1) + ' 售價格式錯誤');
    }

    return {
      id: variant.persistedId || null,
      sku: variant.sku,
      color: variant.color || null,
      size: variant.size || null,
      specification: variant.specification,
      price: price.toFixed(2),
      status: variant.status || 'active'
    };
  });

  var images = getProductImageItems($('#addProductForm')).map(function (item) {
    if (item.type === 'file') {
      throw new Error('正式模式請改用圖片 URL；目前尚未啟用檔案上傳');
    }
    return {
      url: item.src,
      altText: name
    };
  });

  return {
    name: name,
    description: getProductDescriptionHtml() || null,
    categoryId: categoryId,
    brandId: brandId,
    status: $('#newProductStatus').val() || 'active',
    images: images,
    variants: variants
  };
}

/** 正式後端商品送出流程，成功前不修改 adminProductsCache。 */
function submitBackendProductForm(productId) {
  var request;
  try {
    request = buildAdminProductRequestFromForm();
  } catch (error) {
    window.showAdminToast(error.message, 'danger');
    return;
  }

  var $button = $('#submitAddProduct');
  var originalHtml = $button.html();
  $button
    .prop('disabled', true)
    .html('<span class="spinner-border spinner-border-sm me-1"></span>儲存中');

  var operation = productId
    ? AdminAPI.products.update(productId, request)
    : AdminAPI.products.create(request);
  operation.then(function (response) {
    var saved = mapAdminProductResponse(response.data);
    var index = adminProductsCache.findIndex(function (product) {
      return product.id === saved.id;
    });
    if (index >= 0) {
      adminProductsCache[index] = saved;
    } else {
      adminProductsCache.unshift(saved);
    }

    applyProductCategoryFilterAndRender();
    loadProductFormComboboxOptions();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('addProductModal')).hide();
    resetProductModalForm();
    window.showAdminToast('商品「' + saved.name + '」已' + (productId ? '更新' : '建立'));
  }).catch(function (error) {
    AdminAPI.handleError(error, '儲存商品失敗');
  }).finally(function () {
    $button.prop('disabled', false).html(originalHtml);
    if (typeof window.applyEditPermission === 'function') {
      window.applyEditPermission('products', $('#addProductModal'));
    }
  });
}

/** Mock 模式只更新本地快取；正式模式由 submitBackendProductForm 等後端成功後再更新。 */
function upsertAdminProductCache(product) {
  product = normalizeProductBranch(product);
  var index = adminProductsCache.findIndex(function (item) {
    return item.id === product.id;
  });

  if (index >= 0) {
    adminProductsCache[index] = product;
  } else {
    adminProductsCache.unshift(product);
  }
}

/**
 * 建立總庫存欄（含展開鈕與規格數提示）。
 * Build total-stock cell with optional variant expand control.
 */
function buildStoreTotalStockCell(product, stock) {
  var variants = normalizeProductVariants(product);
  var variantCount = variants.length;
  var canExpand = variantCount > 1;

  var html = '<td class="sticky-col sticky-col-total-stock stock-cell text-center fw-semibold" ' +
    'data-total-stock-display>' +
    '<div class="variant-total-cell">';

  if (!isMinStockMode) {
    html += '<span class="total-stock-value">' + stock + '</span>';
  }

  if (canExpand) {
    html +=
      '<button type="button" class="variant-expand-chip" ' +
      'title="展開 ' + variantCount + ' 個規格明細" aria-label="展開 ' + variantCount + ' 個規格明細">' +
      '<i class="fas fa-chevron-down"></i>' +
      '<span>' + variantCount + '</span>' +
      '</button>';
  }

  html += '</div></td>';
  return html;
}

/**
 * 建立租借總庫存欄（含展開鈕與規格數提示）。
 * Build rental total-stock cell with optional variant expand control.
 */
function buildRentalTotalStockCell(rental, stock) {
  var variants = normalizeRentalVariants(rental);
  var variantCount = variants.length;
  var canExpand = variantCount > 1;

  var html = '<td class="sticky-col sticky-col-total-stock stock-cell text-center fw-semibold" ' +
    'data-total-stock-display>' +
    '<div class="variant-total-cell">';

  if (!isMinStockMode) {
    html += '<span class="total-stock-value">' + stock + '</span>';
  }

  if (canExpand) {
    html +=
      '<button type="button" class="variant-expand-chip" ' +
      'title="展開 ' + variantCount + ' 個規格明細" aria-label="展開 ' + variantCount + ' 個規格明細">' +
      '<i class="fas fa-chevron-down"></i>' +
      '<span>' + variantCount + '</span>' +
      '</button>';
  }

  html += '</div></td>';
  return html;
}

/** 規格明細子列：單一分店/營地數字格 / Variant detail qty cell (number only) */
function buildVariantDetailQtyCell(qty, isLow) {
  var displayClass = isLow ? ' text-danger' : '';
  return '<td class="stock-cell variant-detail-qty-cell text-center">' +
    '<span class="variant-qty-display' + displayClass + '">' + normalizeStockValue(qty) + '</span>' +
    '</td>';
}

/**
 * 建立商店商品規格明細子列（總庫存欄顯示規格名，分店欄只顯示數字）。
 * Build per-variant detail rows for store product table expand.
 */
function buildProductVariantDetailRows(product) {
  var variants = normalizeProductVariants(product);
  if (variants.length <= 1) {
    return '';
  }

  var branchColumnIds = ADMIN_PRODUCT_BRANCH_IDS.slice();

  return variants.map(function (variant) {
    var branchStock = variant.branch || {};
    var variantTotal = getVariantDisplayTotal(variant, 'store');
    var variantLabel = variant.label || '—';
    var row =
      '<tr class="variant-detail-row d-none" data-parent-product-id="' + escapeHtml(product.id) + '" ' +
      'data-inventory-type="store">' +
      '<td class="sticky-col sticky-col-img"></td>' +
      '<td class="sticky-col sticky-col-name"></td>' +
      '<td class="sticky-col sticky-col-category"></td>' +
      '<td class="sticky-col sticky-col-brand variant-detail-label">' +
      '<span class="variant-name-sub" title="' + escapeHtml(variantLabel) + '">' +
      escapeHtml(variantLabel) +
      '</span>' +
      '</td>';

    if (isMinStockMode) {
      row += '<td class="sticky-col sticky-col-total-stock"></td>';
    } else {
      row += '<td class="sticky-col sticky-col-total-stock text-center fw-semibold">' +
        '<span class="variant-total-sum">' + variantTotal + '</span>' +
        '</td>';
    }

    branchColumnIds.forEach(function (branchId) {
      var label = getBranchLabel(branchId);
      if (isMinStockMode) {
        var minVal = getMinStockValue('store', product.id, branchId, variant.id);
        row += '<td class="stock-cell">' +
          buildMinStockCellContent(branchId, minVal, label, variant.id) +
          '</td>';
      } else {
        var qty = normalizeStockValue(branchStock[branchId]);
        var isLow = qty < getMinStockValue('store', product.id, branchId, variant.id);
        row += buildVariantDetailQtyCell(qty, isLow);
      }
    });

    row += (isMinStockMode ? '<td class="sticky-col sticky-col-right"></td>' : '') + '</tr>';
    return row;
  }).join('');
}

/**
 * 建立租借商品規格明細子列。
 * Build per-variant detail rows for rental product table expand.
 */
function buildRentalVariantDetailRows(rental) {
  var normalizedRental = normalizeRentalItem(rental);
  var variants = normalizeRentalVariants(normalizedRental);
  if (variants.length <= 1) {
    return '';
  }

  var campColumnIds = rentalTableCampColumnIds.length
    ? rentalTableCampColumnIds
    : ADMIN_RENTAL_CAMP_IDS;

  return variants.map(function (variant) {
    var campStock = variant.camp || {};
    var variantTotal = getVariantDisplayTotal(variant, 'rental');
    var variantLabel = variant.label || '—';
    var row =
      '<tr class="variant-detail-row d-none" data-parent-product-id="' + escapeHtml(normalizedRental.id) + '" ' +
      'data-inventory-type="rental">' +
      '<td class="sticky-col sticky-col-img"></td>' +
      '<td class="sticky-col sticky-col-name"></td>' +
      '<td class="sticky-col sticky-col-category"></td>' +
      '<td class="sticky-col sticky-col-brand variant-detail-label">' +
      '<span class="variant-name-sub" title="' + escapeHtml(variantLabel) + '">' +
      escapeHtml(variantLabel) +
      '</span>' +
      '</td>' +
      '<td class="sticky-col sticky-col-action"></td>';

    if (isMinStockMode) {
      row += '<td class="sticky-col sticky-col-total-stock"></td>';
    } else {
      row += '<td class="sticky-col sticky-col-total-stock text-center fw-semibold">' +
        '<span class="variant-total-sum">' + variantTotal + '</span>' +
        '</td>';
    }

    campColumnIds.forEach(function (campId) {
      var label = getRentalCampColumnLabel(campId);
      if (isMinStockMode) {
        var minVal = getMinStockValue('rental', normalizedRental.id, campId, variant.id);
        row += '<td class="stock-cell">' +
          buildMinStockCellContent(campId, minVal, label, variant.id) +
          '</td>';
      } else {
        var qty = normalizeStockValue(campStock[campId]);
        var isLow = qty < getMinStockValue('rental', normalizedRental.id, campId, variant.id);
        row += buildVariantDetailQtyCell(qty, isLow);
      }
    });

    row += (isMinStockMode ? '<td class="sticky-col sticky-col-right"></td>' : '') + '</tr>';
    return row;
  }).join('');
}

/**
 * 切換商品列表列的規格明細展開狀態。
 * Toggle variant detail rows visibility for a product table main row.
 */
function toggleProductVariantExpand($mainRow) {
  var productId = $mainRow.data('product-id');
  var inventoryType = $mainRow.data('inventory-type') || 'store';
  var tableBodyId = inventoryType === 'rental' ? '#rentalProductsTableBody' : '#productsTableBody';
  var $detailRows = $(tableBodyId + ' tr.variant-detail-row[data-parent-product-id="' + productId + '"]');
  var isExpanded = $mainRow.hasClass('variant-rows-expanded');

  if (isExpanded) {
    $detailRows.addClass('d-none');
    $mainRow.removeClass('variant-rows-expanded');
    $mainRow.find('.variant-expand-chip i').removeClass('fa-chevron-up').addClass('fa-chevron-down');
  } else {
    $detailRows.removeClass('d-none');
    $mainRow.addClass('variant-rows-expanded');
    $mainRow.find('.variant-expand-chip i').removeClass('fa-chevron-down').addClass('fa-chevron-up');
  }
}

function buildProductRow(p) {
  var stock    = getProductTotalStock(p);
  var imgSrc   = p.image || PRODUCT_IMAGE_PLACEHOLDER;
  // 在正常模式下，取得庫存不足的分店 ID 清單，用於紅色數字標示
  var lowBranchIds = isMinStockMode ? [] : getLowBranchIds(p);

  // 欄位順序：圖片 | 名稱 | 分類 | 總庫存(唯讀) | 主倉 | 分店A | 分店B | 分店C
  return '<tr data-product-id="' + escapeHtml(p.id) + '" data-inventory-type="store">' +

    // ── 固定欄 1：圖片 ──
    '<td class="sticky-col sticky-col-img">' +
    '<img src="' + escapeHtml(imgSrc) + '" width="20" height="20" class="rounded object-fit-cover product-table-thumb"' +
    ' onerror="this.src=\'' + PRODUCT_IMAGE_PLACEHOLDER + '\'">' +
    '</td>' +

    // ── 固定欄 2：商品名稱（點擊開啟編輯 Modal）──
    '<td class="sticky-col sticky-col-name fw-semibold">' +
    '<span class="admin-cell-link product-name-cell edit-product-name" ' +
    'title="編輯商品：' + escapeHtml(p.name) + '">' +
    escapeHtml(p.name) +
    '</span>' +
    '<span class="badge ms-1 ' + (p.status === 'inactive' ? 'bg-secondary' : 'bg-success') + '">' +
    (p.status === 'inactive' ? '下架' : '上架') +
    '</span>' +
    '</td>' +

    // ── 固定欄 3：分類 ──
    '<td class="sticky-col sticky-col-category">' +
    '<span class="badge bg-light text-dark border">' + escapeHtml(p.category || '—') + '</span>' +
    '</td>' +

    // ── 固定欄 4：品牌 ──
    '<td class="sticky-col sticky-col-brand">' +
    '<span class="text-muted small product-brand-cell" title="' + escapeHtml(getProductBrandDisplay(p)) + '">' +
    escapeHtml(getProductBrandDisplay(p)) +
    '</span>' +
    '</td>' +

    // ── 固定欄 5：總庫存量（唯讀；可展開規格明細）──
    buildStoreTotalStockCell(p, stock) +

    // ── 可捲動欄：商店主倉 + 固定三家分店（僅固定據點）──
    buildStoreStockCell(p, ADMIN_STORE_WAREHOUSE_ID, ADMIN_STORE_WAREHOUSE_LABEL, lowBranchIds) +
    ADMIN_PRODUCT_BRANCH_IDS.filter(function (branchId) {
      return branchId !== ADMIN_STORE_WAREHOUSE_ID;
    }).map(function (branchId) {
      return buildStoreStockCell(p, branchId, getBranchLabel(branchId), lowBranchIds);
    }).join('') +
    (isMinStockMode ? buildStockEditColumnCell() : '') +

    '</tr>';
}

function buildRentalRow(item) {
  var rental     = normalizeRentalItem(item);
  var stock      = getRentalTotalStock(rental);
  var campByKey  = rental.campByKey || {};
  // 在正常模式下，取得庫存不足的營地 key 清單，用於紅色數字標示
  var lowCampKeys = isMinStockMode ? [] : getLowCampKeys(rental);

  var campColumnIds = rentalTableCampColumnIds.length
    ? rentalTableCampColumnIds
    : ADMIN_RENTAL_CAMP_IDS;
  var campCols = buildRentalCampStockCellsHtml(rental, campColumnIds, campByKey, lowCampKeys);

  // 欄位順序（依 SDD v1.0）：圖片 | 名稱 | 分類 | 操作 | 總租借庫存(唯讀) | 主倉 | 各營區（可捲動）
  // Column order (SDD v1.0): img | name | category | action | rental-total(readonly) | main | camps (scrollable)
  return '<tr data-product-id="' + escapeHtml(rental.id) + '" data-inventory-type="rental">' +

    // ── 固定欄 1：圖片 ──
    '<td class="sticky-col sticky-col-img">' +
    '<img src="' + escapeHtml(rental.image) + '" width="20" height="20" class="rounded object-fit-cover product-table-thumb"' +
    ' onerror="this.src=\'' + PRODUCT_IMAGE_PLACEHOLDER + '\'">' +
    '</td>' +

    // ── 固定欄 2：商品名稱（點擊開啟編輯 Modal）──
    '<td class="sticky-col sticky-col-name fw-semibold">' +
    '<span class="admin-cell-link product-name-cell edit-product-name" ' +
    'title="編輯商品：' + escapeHtml(rental.name) + '">' +
    escapeHtml(rental.name) +
    '</span>' +
    '</td>' +

    // ── 固定欄 3：分類 ──
    '<td class="sticky-col sticky-col-category">' +
    '<span class="badge bg-light text-dark border">' + escapeHtml(rental.category || '其他') + '</span>' +
    '</td>' +

    // ── 固定欄 4：品牌 ──
    '<td class="sticky-col sticky-col-brand">' +
    '<span class="text-muted small product-brand-cell" title="' + escapeHtml(getProductBrandDisplay(rental)) + '">' +
    escapeHtml(getProductBrandDisplay(rental)) +
    '</span>' +
    '</td>' +

    // ── 固定欄 5：操作（調撥／上架定價）──
    '<td class="sticky-col sticky-col-action">' +
    '<div class="d-flex flex-column gap-1">' +
    (!isMinStockMode
      ? '<button type="button" class="btn btn-sm btn-outline-primary transfer-from-rental-btn" title="從商店調撥" ' +
        'data-rental-id="' + escapeHtml(rental.id) + '">' +
        '調撥' +
        '</button>'
      : '') +
    (isAdminProductBackendEnabled() && !isMinStockMode
      ? '<button type="button" class="btn btn-sm btn-outline-secondary rental-listings-btn" title="營區上架與定價" ' +
        'data-rental-id="' + escapeHtml(rental.id) + '">' +
        '上架定價' +
        '</button>'
      : '') +
    '</div>' +
    '</td>' +

    // ── 固定欄 6：總租借庫存（唯讀；可展開規格明細）──
    buildRentalTotalStockCell(rental, stock) +

    // ── 可捲動欄：租借主倉 + 各營區（順序與動態表頭一致）──
    campCols +
    (isMinStockMode ? buildStockEditColumnCell() : '') +

    '</tr>';
}

// ════════════════════════════════════════════════════════════
// 跨類型調撥：商店 → 租借（單向，不可逆）
// Cross-type transfer: Store → Rental (one-way, irreversible)
// 庫存真相在 variants[]；Modal 必須先選規格再讀寫
// Stock truth lives in variants[]; modal must select a variant first
// ════════════════════════════════════════════════════════════

/**
 * 取得目前調撥 Modal 選中的規格 ID。
 * Get selected transfer variant ID from modal.
 */
function getSelectedTransferVariantId() {
  return $('#transferVariantSelect').val()
    || $('#transferToRentalModal').data('selected-variant-id')
    || '';
}

/**
 * 從商店商品找規格（依 variant.id）。
 * Find store product variant by id.
 */
function findStoreVariant(product, variantId) {
  if (!product || !variantId) {
    return null;
  }
  var found = null;
  normalizeProductVariants(product).forEach(function (variant) {
    if (!found && variant.id === variantId) {
      found = variant;
    }
  });
  return found;
}

/**
 * 從租借商品找規格（依 variant.id；商店／租借通常共用同一 id）。
 * Find rental variant by id (usually shared with store variant id).
 */
function findRentalVariant(rental, variantId) {
  if (!rental || !variantId) {
    return null;
  }
  var found = null;
  normalizeRentalVariants(rental).forEach(function (variant) {
    if (!found && variant.id === variantId) {
      found = variant;
    }
  });
  return found;
}

/**
 * 取得某規格在某分店的庫存（規格層，非商品加總）。
 * Get stock for one variant at one branch (variant-level, not product aggregate).
 */
function getVariantBranchStock(product, variantId, branchId) {
  var variant = findStoreVariant(product, variantId);
  if (!variant || !variant.branch) {
    return 0;
  }
  return normalizeStockValue(variant.branch[branchId]);
}

/**
 * 規格對齊用指紋：顏色＋尺寸＋規格說明（忽略大小寫）。
 * Fingerprint for matching store ↔ rental variants when IDs differ (e.g. V001 vs RSV-R001-01).
 */
function getVariantMatchKey(variant) {
  if (!variant) {
    return '';
  }
  return [
    String(variant.color || '').trim(),
    String(variant.size || '').trim(),
    String(variant.specification || variant.label || '').trim()
  ].join('|').toLowerCase();
}

/**
 * 列出「商店與租借都能對上的」規格。
 * 優先相同 id；否則用顏色／尺寸／規格說明對齊（seed：V001 ↔ RSV-R001-01）。
 * @returns {Array<{id:string,rentalVariantId:string,label:string}>}
 */
function getTransferableVariants(product, rental) {
  ensureProductVariantStock(product);
  ensureRentalVariantStock(rental);

  var rentalById = {};
  var rentalByKey = {};
  normalizeRentalVariants(rental).forEach(function (variant) {
    if (variant.id) {
      rentalById[variant.id] = variant;
    }
    var key = getVariantMatchKey(variant);
    if (key && !rentalByKey[key]) {
      rentalByKey[key] = variant;
    }
  });

  var result = [];
  normalizeProductVariants(product).forEach(function (variant) {
    if (!variant.id) {
      return;
    }
    var matched = rentalById[variant.id] || rentalByKey[getVariantMatchKey(variant)];
    if (!matched || !matched.id) {
      return;
    }
    result.push({
      id: variant.id,
      rentalVariantId: matched.id,
      label: variant.label || matched.label || variant.id
    });
  });
  return result;
}

/**
 * 依選中規格重填「來源分店」下拉（顯示該規格各分店庫存）。
 * Rebuild source-branch dropdown using selected variant's branch stock.
 */
function refreshTransferSourceBranchOptions(product, variantId) {
  var previousBranch = $('#transferSourceBranch').val();
  var $sourceBranch = $('#transferSourceBranch').empty();
  // 來源分店：僅固定分店（含商店主倉）；正式模式不提供「營地互轉」（那是同領域異動，非 conversions）
  // Source branches: preset store locations; Backend mode hides camp-transfer (use inventory-movements)
  var branchKeys = ADMIN_PRODUCT_BRANCH_IDS.slice();

  branchKeys.forEach(function (branchId) {
    var qty = getVariantBranchStock(product, variantId, branchId);
    var label = getBranchLabel(branchId);
    $('<option>', { value: branchId })
      .text(label + '（' + qty + ' 件）')
      .appendTo($sourceBranch);
  });

  if (!isAdminProductBackendEnabled()) {
    // 最後加入「營地互轉」選項（Mode 2 入口，僅 Mock）
    $('<option>', { value: 'camp-transfer' }).text('── 營地互轉 ──').appendTo($sourceBranch);
  }

  // 盡量保留先前選取；若已不存在則回到第一個分店
  if (previousBranch && $sourceBranch.find('option[value="' + previousBranch + '"]').length) {
    $sourceBranch.val(previousBranch);
  } else {
    $sourceBranch.prop('selectedIndex', 0);
  }
}

/**
 * 規格下拉變更時：同步 data、分店庫存、營地列。
 * When variant select changes: sync data, branch stock, camp rows.
 */
function onTransferVariantChange() {
  var variantId = $('#transferVariantSelect').val() || '';
  var rentalVariantId = getSelectedTransferRentalVariantId();
  $('#transferToRentalModal').data('selected-variant-id', variantId);
  $('#transferToRentalModal').data('dest-rental-variant-id', rentalVariantId);

  var productId = $('#transferToRentalModal').data('source-product-id');
  var rentalId = $('#transferToRentalModal').data('target-rental-id');
  var product = findAdminProductById(productId);
  var rental = findAdminRentalById(rentalId);

  if (!product || !rental || !variantId) {
    return;
  }

  var currentMode = $('#transferSourceBranch').val();
  refreshTransferSourceBranchOptions(product, variantId);

  // 若原本在營地互轉，切規格後仍維持 Mode 2
  if (currentMode === 'camp-transfer') {
    $('#transferSourceBranch').val('camp-transfer');
    switchTransferMode('camp');
  } else {
    switchTransferMode('branch');
  }

  resetTransferCampRows(rental, rentalVariantId);
  syncTransferDeltaCounter();
}

/**
 * 取得目前調撥 Modal 選中的「租借規格」ID（可能與商店規格 ID 不同）。
 * Get destination rental variant id from selected option data attribute.
 */
function getSelectedTransferRentalVariantId() {
  var $opt = $('#transferVariantSelect option:selected');
  var fromData = $opt.attr('data-rental-variant-id') || $opt.data('rental-variant-id');
  return fromData
    || $('#transferToRentalModal').data('dest-rental-variant-id')
    || getSelectedTransferVariantId();
}

/**
 * 開啟調至租借 Modal，並將商品資料帶入各欄位。
 * Opens the transfer-to-rental modal and populates it with product data.
 * Mock：依 product.rentalId；Backend：依同一 itemId 找租借 SKU。
 * @param {string} productId - 商店商品 ID
 */
function openTransferToRentalModal(productId) {
  var product = findAdminProductById(productId);

  if (!product) {
    window.showAdminToast('找不到商品 ' + productId + ' 的資料', 'danger');
    return;
  }

  // 驗證：租借必須已啟用／可對應才可調撥
  if (!isProductRentalEnabled(product)) {
    window.showAdminToast(
      isAdminProductBackendEnabled()
        ? '找不到同一裝備（itemId）的租借 SKU，無法調撥'
        : '此商品尚未啟用租借，請先於編輯中開啟「是否為租借商品」',
      'danger'
    );
    return;
  }

  var rental = product.rentalId
    ? findAdminRentalById(product.rentalId)
    : null;
  if (!rental && product.itemId) {
    rental = findAdminRentalByItemId(product.itemId);
  }
  if (!rental) {
    window.showAdminToast('租借商品資料不存在，請聯繫管理員', 'danger');
    return;
  }

  // 確保規格庫存結構就緒（舊資料會遷移到 variants）
  ensureProductVariantStock(product);
  ensureRentalVariantStock(rental);

  var transferable = getTransferableVariants(product, rental);
  if (!transferable.length) {
    window.showAdminToast('此商品沒有可對應的租借規格，無法調撥', 'danger');
    return;
  }

  // 填入規格下拉（商店 id + data-rental-variant-id）
  var $variantSelect = $('#transferVariantSelect').empty();
  transferable.forEach(function (item) {
    $('<option>', {
      value: item.id,
      'data-rental-variant-id': item.rentalVariantId,
      text: item.label + (item.rentalVariantId !== item.id ? ' → ' + item.rentalVariantId : '')
    }).appendTo($variantSelect);
  });
  var variantId = $variantSelect.val();
  var rentalVariantId = $variantSelect.find('option:selected').attr('data-rental-variant-id') || variantId;

  // 儲存商品 ID、租借 ID、規格 ID，供確認調撥時使用
  $('#transferToRentalModal')
    .data('source-product-id', productId)
    .data('target-rental-id', rental.id)
    .data('selected-variant-id', variantId)
    .data('dest-rental-variant-id', rentalVariantId);

  // 填入商品名稱（唯讀）
  $('#transferProductName').text(product.name + ' → ' + rental.name);

  if (isAdminProductBackendEnabled()) {
    $('#transferConversionReason').val('商店調撥至租借');
  }

  // 依選中規格填入來源分店下拉（含庫存件數）
  refreshTransferSourceBranchOptions(product, variantId);

  // 確保目前庫存欄可見、delta 最小值 >= 0（Mode 1 初始狀態）
  $('#transferSourceStockCol').removeClass('d-none');
  syncTransferSourceStock();

  // 重置多行營地分配清單（顯示「該規格」在各營地的庫存）
  resetTransferCampRows(rental, rentalVariantId);
  syncTransferDeltaCounter();

  // 開啟 Modal
  bootstrap.Modal.getOrCreateInstance(document.getElementById('transferToRentalModal')).show();
}

/**
 * 依目前選取的「規格 × 來源分店」，更新「目前庫存」靜態顯示。
 * Updates current stock from selected variant × source branch.
 */
function syncTransferSourceStock() {
  // Mode 2（營地互轉）時目前庫存欄已隱藏，不需更新
  // Mode 2 (camp-transfer): source stock col is hidden, skip update
  if ($('#transferSourceBranch').val() === 'camp-transfer') { return; }

  var productId = $('#transferToRentalModal').data('source-product-id');
  var product = findAdminProductById(productId);
  var branchId = $('#transferSourceBranch').val();
  var variantId = getSelectedTransferVariantId();

  if (!product || !branchId || !variantId) {
    $('#transferSourceStock').text('0');
    return;
  }

  var qty = getVariantBranchStock(product, variantId, branchId);
  $('#transferSourceStock').text(qty + ' 件');
}

// ════════════════════════════════════════════════════════════
// 多行營地分配輔助函式群
// Multi-row camp distribution helper functions
// ════════════════════════════════════════════════════════════

/**
 * 取得目前「規格 × 來源分店」的庫存（數字）。
 * Returns current selected variant × source branch stock as a number.
 */
function getTransferSourceStockValue() {
  var productId = $('#transferToRentalModal').data('source-product-id');
  var product   = findAdminProductById(productId);
  var branchId  = $('#transferSourceBranch').val();
  var variantId = getSelectedTransferVariantId();
  return getVariantBranchStock(product, variantId, branchId);
}

/**
 * 清空 #transferCampRows，將「選中規格」在各固定營地的庫存各產生一列。
 * Clears camp rows and builds one row per camp using selected variant stock.
 * @param {Object} rental    - 目標租借商品物件
 * @param {string} variantId - 選中的規格 ID
 */
function resetTransferCampRows(rental, variantId) {
  $('#transferCampRows').empty();

  var resolvedVariantId = variantId || getSelectedTransferVariantId();
  var campOptions = buildTransferCampOptions(rental, resolvedVariantId);

  // 每個固定營地（含主倉）產生靜態列（無 ✕，無下拉）
  // Each fixed camp (incl. main) gets a static preset row (no X, no dropdown)
  campOptions.forEach(function (opt) {
    appendTransferCampRow(opt.value, opt.label, opt.currentQty);
  });
}

/**
 * 產生「選中規格」固定營地選項（C001–C009，含租借主倉）。
 * Builds preset camp options from the selected rental variant's camp map.
 * @param {Object} rental    - 目標租借商品物件
 * @param {string} variantId - 規格 ID
 * @returns {Array} 選項陣列 { value, label, currentQty }
 */
function buildTransferCampOptions(rental, variantId) {
  var rentalVariant = findRentalVariant(rental, variantId);
  // 規格層 camp；找不到規格時退回加總 campByKey（相容舊資料）
  // Prefer variant.camp; fall back to aggregated campByKey for legacy safety
  var campByKey = (rentalVariant && rentalVariant.camp)
    ? rentalVariant.camp
    : (rental.campByKey || {});

  var options = [];

  ADMIN_RENTAL_CAMP_IDS.forEach(function (campId) {
    var label = ADMIN_RENTAL_CAMP_LABELS[campId] || campId;
    var qty   = normalizeStockValue(campByKey[campId]);
    options.push({ value: campId, label: label, currentQty: qty });
  });

  return options;
}

/**
 * 在 #transferCampRows 新增一列「固定營地列」（靜態格式，無 ✕，無下拉）。
 * 格式：[靜態營地名稱] [當前庫存（唯讀）] [更動數量（delta input，預設 0）]
 *
 * Appends a preset fixed camp row (static name, read-only stock, delta input).
 * @param {string} campKey    - 營地 key（存入 data-camp-key）
 * @param {string} campLabel  - 顯示名稱
 * @param {number} currentQty - 該營地目前庫存（0 以上）
 */
function appendTransferCampRow(campKey, campLabel, currentQty) {
  // 營地名稱（靜態文字）
  var $name = $('<span>', { class: 'transfer-camp-name flex-grow-1' }).text(campLabel);

  // 當前庫存（唯讀標籤，存入 data-current-qty 方便讀取）
  var $curQty = $('<span>', {
    class: 'input-group-text transfer-camp-current-qty text-muted',
    style: 'min-width: 56px;',
    'data-current-qty': currentQty
  }).text(currentQty + ' 件');

  // 更動數量（delta）輸入框，Mode 1 預設 min=0，Mode 2 時由 switchTransferMode 移除 min
  var $delta = $('<input>', {
    type:  'number',
    class: 'form-control form-control-sm transfer-camp-delta',
    min:   0,
    value: 0,
    style: 'width: 60px;'
  });

  // 組合成一列（row），data-camp-key 供提交時識別
  var $row = $('<div>', {
    class:           'd-flex gap-2 align-items-center transfer-camp-row',
    'data-camp-key': campKey
  }).append($name).append($curQty).append($delta);

  $('#transferCampRows').append($row);
}

/**
 * 切換調撥 Modal 的操作模式。
 * Mode 'branch'：分店→營地（來源庫存欄可見，delta >= 0）
 * Mode 'camp'  ：營地互轉（來源庫存欄隱藏，delta 可為負）
 *
 * Switches between Mode 1 (branch→camp) and Mode 2 (camp transfer).
 * @param {string} mode - 'branch' 或 'camp'
 */
function switchTransferMode(mode) {
  if (mode === 'camp') {
    // 隱藏目前庫存欄（Mode 2 不需要來源分店庫存）
    $('#transferSourceStockCol').addClass('d-none');
    // 移除 delta 最小值限制，允許負數（營地可扣減）
    $('.transfer-camp-delta').removeAttr('min');
    // 更新說明文字
    $('#transferModeHint').text('填入各營地的增減數量（正數 = 增加，負數 = 減少；送出時驗證不可出現負庫存）');
  } else {
    // Mode 1 (branch)：顯示目前庫存欄
    $('#transferSourceStockCol').removeClass('d-none');
    syncTransferSourceStock();
    // 恢復 delta 最小值 0（不可輸入負數）並清除已輸入的負值
    $('.transfer-camp-delta').attr('min', 0).each(function () {
      if (parseInt($(this).val()) < 0) { $(this).val(0); }
    });
    // 更新說明文字
    $('#transferModeHint').text('以下為本次從來源分店調入各營地的數量（0 = 不異動）');
  }
  // 兩種模式都清除紅框
  $('.transfer-camp-delta').removeClass('is-invalid');
  syncTransferDeltaCounter();
}

/**
 * 更新計數器：依目前模式顯示不同資訊，並即時標記負庫存紅框。
 *
 * Mode 1（分店→營地）：計算所有正 delta 合計，顯示「總計轉入 N 件」
 * Mode 2（營地互轉） ：計算淨 delta（可正可負），顯示「淨變動 N 件」，
 *   並對每列檢查「當前庫存 + delta >= 0」，不足者加 is-invalid 紅框。
 *
 * Updates #transferDistributionCounter and per-row validation.
 */
function syncTransferDeltaCounter() {
  var isCampMode = ($('#transferSourceBranch').val() === 'camp-transfer');
  var netDelta = 0;

  if (isCampMode) {
    // ── Mode 2：逐列檢查負庫存 ──────────────────────
    $('#transferCampRows .transfer-camp-row').each(function () {
      var $row      = $(this);
      var $deltaInp = $row.find('.transfer-camp-delta');
      var delta     = parseInt($deltaInp.val()) || 0;
      var curQty    = parseInt($row.find('.transfer-camp-current-qty').attr('data-current-qty')) || 0;
      netDelta += delta;

      // 若該列最終庫存會變負數，加紅框警告
      var wouldBeNegative = (curQty + delta) < 0;
      $deltaInp.toggleClass('is-invalid', wouldBeNegative);
    });

    $('#transferDistributionCounter')
      .text('淨變動 ' + (netDelta >= 0 ? '+' : '') + netDelta + ' 件')
      .toggleClass('text-danger', netDelta < 0)
      .toggleClass('text-muted', netDelta >= 0);

  } else {
    // ── Mode 1：加總正 delta，無紅框驗證 ──────────
    $('#transferCampRows .transfer-camp-delta').each(function () {
      var v = parseInt($(this).val()) || 0;
      if (v > 0) { netDelta += v; }
      // Mode 1 不做紅框，清除
      $(this).removeClass('is-invalid');
    });

    $('#transferDistributionCounter')
      .text('總計轉入 ' + netDelta + ' 件')
      .removeClass('text-danger')
      .addClass('text-muted');
  }
}

/**
 * 調撥入口：依目前選取的來源分店判斷模式，分派到對應提交函式。
 * Dispatch function: routes to Mode 1 or Mode 2 based on source branch selection.
 *
 * Backend：Mode 1 打 inventory-conversions（createDraft → post）；Mode 2 不支援。
 * Mock：維持舊的 memory cache 路徑。
 */
function submitTransferToRental() {
  var mode = $('#transferSourceBranch').val();
  if (mode === 'camp-transfer') {
    if (isAdminProductBackendEnabled()) {
      window.showAdminToast('正式模式請用庫存異動頁處理營地互轉；此處只支援商店→租借轉換', 'warning');
      return;
    }
    submitCampTransfer();
  } else if (isAdminProductBackendEnabled()) {
    submitBranchToCampTransferBackend();
  } else {
    submitBranchToCampTransfer();
  }
}

/**
 * Mode 1（正式）：分店→營地，對每個 delta>0 的營區各建一筆 conversion 並過帳。
 * Backend Mode 1: one inventory-conversion draft+post per target camp with qty > 0.
 */
function submitBranchToCampTransferBackend() {
  var productId = $('#transferToRentalModal').data('source-product-id');
  var rentalId = $('#transferToRentalModal').data('target-rental-id');
  var branchId = $('#transferSourceBranch').val();
  var storeVariantId = getSelectedTransferVariantId();
  var rentalVariantId = getSelectedTransferRentalVariantId();
  var reason = String($('#transferConversionReason').val() || '').trim() || '商店調撥至租借';

  var product = findAdminProductById(productId);
  var rental = findAdminRentalById(rentalId);

  if (!product) { window.showAdminToast('找不到來源商品資料', 'danger'); return; }
  if (!rental) { window.showAdminToast('找不到對應租借商品資料', 'danger'); return; }
  if (!storeVariantId || !rentalVariantId) {
    window.showAdminToast('請先選擇規格', 'danger');
    return;
  }
  if (!branchId || branchId === 'camp-transfer') {
    window.showAdminToast('請選擇來源分店', 'danger');
    return;
  }

  var distributions = [];
  $('#transferCampRows .transfer-camp-row').each(function () {
    var $row = $(this);
    var campKey = $row.data('camp-key');
    var delta = parseInt($row.find('.transfer-camp-delta').val(), 10) || 0;
    if (campKey && isFixedCampId(campKey) && delta > 0) {
      distributions.push({ campKey: campKey, delta: delta });
    }
  });

  if (distributions.length === 0) {
    window.showAdminToast('請至少填寫一個營地的轉入數量（大於 0）', 'danger');
    return;
  }

  var totalDelta = distributions.reduce(function (sum, d) { return sum + d.delta; }, 0);
  var sourceQty = getVariantBranchStock(product, storeVariantId, branchId);
  if (totalDelta > sourceQty) {
    window.showAdminToast('調撥數量超過來源分店庫存（目前 ' + sourceQty + ' 件）', 'danger');
    return;
  }

  var $btn = $('#submitTransferToRental').prop('disabled', true);
  var stamp = Date.now();

  // 依序建立草稿並過帳（避免並行搶同一來源庫存造成難讀錯誤）
  // Sequentially createDraft → post for each camp destination
  var chain = Promise.resolve();
  distributions.forEach(function (d, index) {
    chain = chain.then(function () {
      var payload = {
        sourceLocationId: branchId,
        destinationLocationId: toApiMinStockLocationId('rental', d.campKey),
        sourceVariantId: storeVariantId,
        destinationRentalVariantId: rentalVariantId,
        quantity: d.delta,
        reason: reason,
        occurredAt: null,
        idempotencyKey: 'ui-conv-' + productId + '-' + storeVariantId + '-' + d.campKey + '-' + stamp + '-' + index
      };
      return AdminAPI.inventoryConversions.createDraft(payload).then(function (res) {
        var draft = res && res.data;
        if (!draft || draft.id == null) {
          throw new Error('轉換草稿回應缺少 id');
        }
        return AdminAPI.inventoryConversions.post(draft.id);
      });
    });
  });

  chain
    .then(function () {
      // 成功後重抓商店 on-hand，並重載租借列表
      return AdminAPI.products.getById(productId).then(function (res) {
        var mapped = mapAdminProductResponse(res && res.data ? res.data : res);
        var idx = adminProductsCache.findIndex(function (item) {
          return item.id === productId;
        });
        if (idx >= 0) {
          adminProductsCache[idx] = mapped;
        }
        applyProductCategoryFilterAndRender();
        adminRentalsLoaded = false;
        if ($('[data-products-panel="rental"]').is(':visible')) {
          loadRentalProducts();
        }
      });
    })
    .then(function () {
      bootstrap.Modal.getOrCreateInstance(document.getElementById('transferToRentalModal')).hide();
      var campSummary = distributions.map(function (d) {
        return (ADMIN_RENTAL_CAMP_LABELS[d.campKey] || d.campKey) + ' +' + d.delta + ' 件';
      }).join('、');
      window.showAdminToast(
        '已過帳商店→租借轉換共 ' + totalDelta + ' 件（' + campSummary + '）'
      );
    })
    .catch(function (error) {
      AdminAPI.handleError(error, '調撥過帳失敗');
    })
    .finally(function () {
      $btn.prop('disabled', false);
    });
}

/**
 * Mode 1：分店→營地 調撥（Mock：作用在「選中規格」的 memory cache）。
 * Collect delta > 0 rows → mutate store/rental caches → fake movement items.
 */
function submitBranchToCampTransfer() {
  var productId = $('#transferToRentalModal').data('source-product-id');
  var rentalId  = $('#transferToRentalModal').data('target-rental-id');
  var branchId  = $('#transferSourceBranch').val();
  var variantId = getSelectedTransferVariantId();

  var product = findAdminProductById(productId);
  var rental  = findAdminRentalById(rentalId);

  if (!product) { window.showAdminToast('找不到來源商品資料', 'danger'); return; }
  if (!rental)  { window.showAdminToast('找不到對應租借商品資料', 'danger'); return; }
  if (!variantId) { window.showAdminToast('請先選擇規格', 'danger'); return; }

  ensureProductVariantStock(product);
  ensureRentalVariantStock(rental);

  // 直接取快取陣列裡的規格物件（勿用 normalize 副本，否則改了寫不回去）
  // Use in-cache variant objects (not normalize() copies) so mutations persist
  var storeVariant = null;
  (product.variants || []).forEach(function (v) {
    if (!storeVariant && v.id === variantId) {
      storeVariant = v;
    }
  });
  var rentalVariant = null;
  (rental.variants || []).forEach(function (v) {
    if (!rentalVariant && v.id === variantId) {
      rentalVariant = v;
    }
  });

  if (!storeVariant || !rentalVariant) {
    window.showAdminToast('找不到對應規格，無法調撥', 'danger');
    return;
  }

  // ── 收集所有 delta > 0 的固定營地列 ────────────────────
  var distributions = [];
  $('#transferCampRows .transfer-camp-row').each(function () {
    var $row    = $(this);
    var campKey = $row.data('camp-key');
    var delta = parseInt($row.find('.transfer-camp-delta').val()) || 0;
    if (campKey && isFixedCampId(campKey) && delta > 0) {
      distributions.push({ campKey: campKey, delta: delta });
    }
  });

  if (distributions.length === 0) {
    window.showAdminToast('請至少填寫一個營地的轉入數量（大於 0）', 'danger');
    return;
  }

  var totalDelta = distributions.reduce(function (sum, d) { return sum + d.delta; }, 0);

  // ── 更新「規格層」商店庫存：來源分店 -totalDelta ──
  // Update variant-level store stock (not product.branch aggregate)
  if (!storeVariant.branch || typeof storeVariant.branch !== 'object') {
    storeVariant.branch = createEmptyBranchStock();
  }
  var sourceQty = normalizeStockValue(storeVariant.branch[branchId]);
  storeVariant.branch[branchId] = sourceQty - totalDelta;
  storeVariant.total = getBranchTotal(storeVariant.branch);

  // ── 更新「規格層」租借庫存：各目標營地 +delta ──
  if (!rentalVariant.camp || typeof rentalVariant.camp !== 'object') {
    rentalVariant.camp = createEmptyCampStock();
  }
  distributions.forEach(function (d) {
    var prev = normalizeStockValue(rentalVariant.camp[d.campKey]);
    rentalVariant.camp[d.campKey] = prev + d.delta;
  });
  rentalVariant.total = getBranchTotal(rentalVariant.camp);

  // 重算商品／租借加總快取（列表主列仍用加總）
  // Re-aggregate product/rental caches for main table rows
  ensureProductVariantStock(product);
  ensureRentalVariantStock(rental);

  // ── 更新商店表格列畫面 ─────────────────────────
  var $storeRow = $('#productsTableBody tr[data-product-id="' + escapeSelector(productId) + '"][data-inventory-type="store"]');
  if (!$storeRow.length) {
    $storeRow = $('#productsTableBody tr[data-product-id="' + escapeSelector(productId) + '"]');
  }
  if ($storeRow.length) {
    $storeRow.find('.total-stock-value').text(product.totalStock);
    refreshRowLowStockCells($storeRow, getLowBranchIds(product));
    var $branchInput = $storeRow.find('.stock-input[data-stock-field="' + branchId + '"]');
    $branchInput
      .val(product.branch[branchId])
      .attr('data-original-qty', product.branch[branchId])
      .data('original-qty', product.branch[branchId]);
    syncStockInputFeedback($storeRow);
    refreshStoreVariantDetailRows(product, $storeRow);
  }

  // ── 更新租借表格列畫面（若已載入）──────────────
  _updateRentalTableRow(rentalId, rental, distributions);

  // ── 產生異動記錄（type: '調撥'，名稱含規格）────
  var items = buildMultiCampTransferMovementItems(
    product, branchId, rental, distributions, totalDelta, storeVariant, rentalVariant
  );
  pendingMovementItems = pendingMovementItems.concat(items);
  updateMovementGenerateButtonState();

  // ── 關閉 Modal 並顯示成功訊息 ─────────────────
  bootstrap.Modal.getOrCreateInstance(document.getElementById('transferToRentalModal')).hide();
  var campSummary = distributions.map(function (d) {
    return (ADMIN_RENTAL_CAMP_LABELS[d.campKey] || d.campKey) + ' +' + d.delta + ' 件';
  }).join('、');
  var variantLabel = storeVariant.label ? '（' + storeVariant.label + '）' : '';
  window.showAdminToast(
    '已將「' + product.name + variantLabel + '」共 ' + totalDelta + ' 件從「' +
    (ADMIN_PRODUCT_BRANCH_LABELS[branchId] || branchId) +
    '」調至租借（' + campSummary + '）'
  );
}

/**
 * Mode 2：營地互轉（作用在「選中規格」）。
 * 收集所有 delta ≠ 0 的列 → 驗證每列最終庫存 >= 0 → 更新該規格各營地庫存 → 產生「營地互轉」異動記錄。
 * 商店分店庫存不受影響。
 *
 * Mode 2: Camp-to-camp transfer at selected variant level.
 */
function submitCampTransfer() {
  var rentalId  = $('#transferToRentalModal').data('target-rental-id');
  var variantId = getSelectedTransferVariantId();
  var rental    = findAdminRentalById(rentalId);

  if (!rental) { window.showAdminToast('找不到對應租借商品資料', 'danger'); return; }
  if (!variantId) { window.showAdminToast('請先選擇規格', 'danger'); return; }

  ensureRentalVariantStock(rental);

  // 直接取快取陣列裡的規格物件（勿用 normalize 副本）
  // Use in-cache rental variant object so mutations persist
  var rentalVariant = null;
  (rental.variants || []).forEach(function (v) {
    if (!rentalVariant && v.id === variantId) {
      rentalVariant = v;
    }
  });
  if (!rentalVariant) {
    window.showAdminToast('找不到對應規格，無法調撥', 'danger');
    return;
  }

  // ── 收集所有 delta ≠ 0 的固定營地列 ─────────────────────
  var distributions = [];
  $('#transferCampRows .transfer-camp-row').each(function () {
    var $row    = $(this);
    var campKey = $row.data('camp-key');
    var delta      = parseInt($row.find('.transfer-camp-delta').val()) || 0;
    var curQty     = parseInt($row.find('.transfer-camp-current-qty').attr('data-current-qty')) || 0;
    if (campKey && isFixedCampId(campKey) && delta !== 0) {
      distributions.push({ campKey: campKey, delta: delta, currentQty: curQty });
    }
  });

  if (distributions.length === 0) {
    window.showAdminToast('請至少填寫一個營地的增減數量（非 0）', 'danger');
    return;
  }

  // ── 驗證：任何營地的最終庫存不可為負 ──────────
  var hasNegative = false;
  distributions.forEach(function (d) {
    if (d.currentQty + d.delta < 0) {
      hasNegative = true;
      // 標紅框（syncTransferDeltaCounter 已處理，但送出前再補一次確保）
      $('#transferCampRows .transfer-camp-row[data-camp-key="' + escapeSelector(d.campKey) + '"] .transfer-camp-delta')
        .addClass('is-invalid');
    }
  });
  if (hasNegative) {
    window.showAdminToast('部分營地調整後庫存會變為負數，請修正紅框欄位', 'danger');
    return;
  }

  // ── 更新「規格層」租借庫存：各營地 ±delta（商店不動）──
  if (!rentalVariant.camp || typeof rentalVariant.camp !== 'object') {
    rentalVariant.camp = createEmptyCampStock();
  }
  distributions.forEach(function (d) {
    var prev = normalizeStockValue(rentalVariant.camp[d.campKey]);
    rentalVariant.camp[d.campKey] = prev + d.delta;
  });
  rentalVariant.total = getBranchTotal(rentalVariant.camp);

  ensureRentalVariantStock(rental);

  // ── 更新租借表格列畫面 ─────────────────────────
  _updateRentalTableRow(rentalId, rental, distributions);

  // ── 產生異動記錄（type: '營地互轉'，名稱含規格）──
  var items = [];
  distributions.forEach(function (d) {
    var campLabel = ADMIN_RENTAL_CAMP_LABELS[d.campKey] || d.campKey;
    items.push({
      productName: formatMovementProductName(rental.name + '（租借）', rentalVariant),
      quantity:    Math.abs(d.delta),
      fromStore:   d.delta > 0 ? '（增加）' : campLabel,
      toStore:     d.delta > 0 ? campLabel  : '（減少）',
      type:        '營地互轉'
    });
  });
  pendingMovementItems = pendingMovementItems.concat(items);
  updateMovementGenerateButtonState();

  // ── 關閉 Modal 並顯示成功訊息 ─────────────────
  bootstrap.Modal.getOrCreateInstance(document.getElementById('transferToRentalModal')).hide();
  var campSummary = distributions.map(function (d) {
    return (ADMIN_RENTAL_CAMP_LABELS[d.campKey] || d.campKey) + ' ' + (d.delta >= 0 ? '+' : '') + d.delta + ' 件';
  }).join('、');
  var variantLabel = rentalVariant.label ? '（' + rentalVariant.label + '）' : '';
  window.showAdminToast('營地互轉完成' + variantLabel + '（' + campSummary + '）');
}

/**
 * 共用：更新租借表格列的庫存數值與低庫存狀態。
 * Shared helper: refreshes the rental table row after any transfer.
 * @param {string} rentalId       - 租借商品 ID
 * @param {Object} rental         - 已更新的租借商品快取物件
 * @param {Array}  distributions  - [{ campKey, delta }, ...] 已異動的列
 */
function _updateRentalTableRow(rentalId, rental, distributions) {
  var $rentalRow = $('#rentalProductsTableBody tr[data-product-id="' + escapeSelector(rentalId) + '"]');
  if (!$rentalRow.length) { return; }

  var rentalTotal = Object.keys(rental.campByKey || {}).reduce(function (sum, key) {
    return sum + normalizeStockValue(rental.campByKey[key]);
  }, 0);
  $rentalRow.find('.total-stock-value').text(rentalTotal);
  refreshRowLowStockCells($rentalRow, getLowCampKeys(rental));

  distributions.forEach(function (d) {
    var newQty = normalizeStockValue((rental.campByKey || {})[d.campKey]);
    var $campInput = $rentalRow.find('.stock-input[data-stock-field="' + d.campKey + '"]');
    $campInput
      .val(newQty)
      .attr('data-original-qty', newQty)
      .data('original-qty', newQty);
  });
  syncStockInputFeedback($rentalRow);
  refreshRentalVariantDetailRows(rental, $rentalRow);
}

/**
 * 調撥後重繪商店規格明細子列（保留展開狀態）。
 * Rebuild store variant detail rows after transfer; keep expand state.
 */
function refreshStoreVariantDetailRows(product, $mainRow) {
  if (!$mainRow || !$mainRow.length || !product) {
    return;
  }
  var productId = product.id;
  var wasExpanded = $mainRow.hasClass('variant-rows-expanded');
  $('#productsTableBody tr.variant-detail-row[data-parent-product-id="' + escapeSelector(productId) + '"]').remove();
  var html = buildProductVariantDetailRows(product);
  if (html) {
    $mainRow.after(html);
    if (wasExpanded) {
      $('#productsTableBody tr.variant-detail-row[data-parent-product-id="' + escapeSelector(productId) + '"]')
        .removeClass('d-none');
    }
  }
}

/**
 * 調撥後重繪租借規格明細子列（保留展開狀態）。
 * Rebuild rental variant detail rows after transfer; keep expand state.
 */
function refreshRentalVariantDetailRows(rental, $mainRow) {
  if (!$mainRow || !$mainRow.length || !rental) {
    return;
  }
  var rentalId = rental.id;
  var wasExpanded = $mainRow.hasClass('variant-rows-expanded');
  $('#rentalProductsTableBody tr.variant-detail-row[data-parent-product-id="' + escapeSelector(rentalId) + '"]').remove();
  var html = buildRentalVariantDetailRows(rental);
  if (html) {
    $mainRow.after(html);
    if (wasExpanded) {
      $('#rentalProductsTableBody tr.variant-detail-row[data-parent-product-id="' + escapeSelector(rentalId) + '"]')
        .removeClass('d-none');
    }
  }
}

/**
 * 產生一筆損耗異動 item。
 * 供需直接建立損耗紀錄的場景使用（如未來的管理員報廢操作）。
 *
 * Builds a single loss movement item.
 *
 * @param {string} productName   - 商品名稱
 * @param {string} locationLabel - 發生損耗的地點標籤（如 '商店主倉'、'租借主倉'、'台北旗艦店'）
 * @param {number} lossQty       - 損耗數量（正整數）
 * @returns {Object} movement item
 */
function buildLossMovementItem(productName, locationLabel, lossQty) {
  return {
    productName: productName,
    quantity:    Math.max(0, normalizeStockValue(lossQty)),
    fromStore:   locationLabel,
    toStore:     '—',
    type:        '損耗'
  };
}

/**
 * 產生跨類型調撥的 1+N 筆異動 items（名稱含規格）。
 * 第 1 筆：商店來源分店扣減（合計）。
 * 第 2~N+1 筆：租借各目標營地各自增加。
 *
 * Builds 1+N movement items: one debit from store, one credit per target camp.
 * @param {Object} product        - 商店商品物件
 * @param {string} branchId       - 來源分店 ID
 * @param {Object} rental         - 租借商品物件
 * @param {Array}  distributions  - [{ campKey, delta }, ...] 各目標營地分配
 * @param {number} totalQty       - 本次調撥合計數量
 * @param {Object} [storeVariant] - 商店規格（用來組名稱）
 * @param {Object} [rentalVariant]- 租借規格（用來組名稱）
 * @returns {Array} items 陣列（1 + distributions.length 筆）
 */
function buildMultiCampTransferMovementItems(product, branchId, rental, distributions, totalQty, storeVariant, rentalVariant) {
  var branchLabel = ADMIN_PRODUCT_BRANCH_LABELS[branchId] || branchId;
  var items = [];

  // 第 1 筆：商店扣減（總量），type = '調撥'（商店→租借單向）
  // Item 1: deduct from store branch (total qty), type = '調撥' (store→rental, one-way)
  items.push({
    productName: formatMovementProductName(product.name, storeVariant),
    quantity:    totalQty,
    fromStore:   branchLabel + ' →（調至租借）',
    toStore:     formatMovementProductName(rental.name, rentalVariant),
    type:        '調撥'
  });

  // 第 2~N+1 筆：各目標營地各自增加，type = '調撥'
  // Items 2~N+1: increase at each target camp, type = '調撥'
  distributions.forEach(function (d) {
    var campLabel = ADMIN_RENTAL_CAMP_LABELS[d.campKey] || d.campKey;
    items.push({
      productName: formatMovementProductName(rental.name + '（租借）', rentalVariant),
      quantity:    d.delta,
      fromStore:   '←（來自商店）' + formatMovementProductName(product.name, storeVariant),
      toStore:     campLabel,
      type:        '調撥'
    });
  });

  return items;
}

function escapeSelector(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (char) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char];
  });
}

/**
 * 將 products 陣列渲染成 HTML 表格列，填入 #productsTableBody
 * @param {Array} products - products.json 的資料陣列
 */
function renderProductsTable(products) {
  if (!products || products.length === 0) {
    var emptyMsg = hasActiveProductFilters()
      ? '沒有符合篩選條件的商品'
      : '目前沒有商品';
    $('#productsTableBody').html(
      '<tr><td colspan="' + getStoreTableColspan() + '" class="text-center text-muted py-4">' + emptyMsg + '</td></tr>'
    );
    updateMovementGenerateButtonState();
    if (typeof window.applyEditPermission === 'function') {
      window.applyEditPermission('products', $('#contentArea'));
    }
    return;
  }

  var html = products.map(function (p) {
    return buildProductRow(p) + buildProductVariantDetailRows(p);
  }).join('');

  $('#productsTableBody').html(html);
  updateMovementGenerateButtonState();
  syncBackendProductUi();

  if (typeof window.applyEditPermission === 'function') {
    window.applyEditPermission('products', $('#contentArea'));
  }
}


// 將租借商品快取渲染到租借表格，只顯示已啟用租借的商品。
// Render rental table; only show rentals whose store product has rentalEnabled.
function renderRentalProductsTable(rentals) {
  var columnSource = (adminRentalsCache && adminRentalsCache.length)
    ? adminRentalsCache
    : (rentals || []);

  renderRentalCampTableHeadCells(collectRentalCampColumnIds(columnSource));

  var visibleRentals = filterEnabledRentals(rentals);

  if (!visibleRentals || visibleRentals.length === 0) {
    var emptyMsg = hasActiveProductFilters()
      ? '沒有符合篩選條件的租借商品'
      : '目前沒有租借商品';
    $('#rentalProductsTableBody').html(
      '<tr><td colspan="' + getRentalTableColspan() + '" class="text-center text-muted py-4">' + emptyMsg + '</td></tr>'
    );
    return;
  }

  var html = visibleRentals.map(function (item) {
    return buildRentalRow(item) + buildRentalVariantDetailRows(item);
  }).join('');

  $('#rentalProductsTableBody').html(html);

  syncBackendProductUi();

  if (typeof window.applyEditPermission === 'function') {
    window.applyEditPermission('products', $('#contentArea'));
  }
}

// ════════════════════════════════════════════════════════════
// W2-04：租借上架／定價＋裝備規格／標籤 Modal（正式模式）
// Rental listings + equipment specs/tags modal (backend mode)
// ════════════════════════════════════════════════════════════

/** Modal 暫存：目前編輯的 rentalId、listings 快取（依 variant 分組） */
var rentalListingsModalState = {
  rentalId: null,
  itemId: null,
  listingsByVariant: {}
};

/**
 * 開啟上架定價 Modal：載入 listings + specs + tags。
 * Open listings modal and load current listings / equipment specs / tags.
 */
function openRentalListingsModal(rentalId) {
  var rental = findAdminRentalById(rentalId);
  if (!rental) {
    window.showAdminToast('找不到租借商品 ' + rentalId, 'danger');
    return;
  }
  if (!isAdminProductBackendEnabled()) {
    window.showAdminToast('上架定價僅在正式模式使用', 'info');
    return;
  }

  rentalListingsModalState = {
    rentalId: rentalId,
    itemId: rental.itemId || null,
    listingsByVariant: {}
  };

  $('#rentalListingsProductName').text(rental.name + '（' + rentalId + '）');
  var $variantSelect = $('#rentalListingVariantSelect').empty();
  normalizeRentalVariants(rental).forEach(function (variant) {
    if (!variant.id) {
      return;
    }
    $('<option>', {
      value: variant.id,
      text: (variant.label || variant.id) + (variant.sku ? '／' + variant.sku : '')
    }).appendTo($variantSelect);
  });

  if (!$variantSelect.find('option').length) {
    window.showAdminToast('此租借 SKU 尚無規格，無法設定上架', 'danger');
    return;
  }

  $('#rentalListingRows').html(
    '<tr><td colspan="5" class="text-muted small py-3">載入中…</td></tr>'
  );
  $('#rentalEquipmentSpecsInput').val('');
  $('#rentalEquipmentTagsInput').val('');

  bootstrap.Modal.getOrCreateInstance(document.getElementById('rentalListingsModal')).show();

  var itemId = rental.itemId;
  Promise.all([
    AdminAPI.rentals.listListings(rentalId),
    itemId ? AdminAPI.equipmentItems.getSpecs(itemId) : Promise.resolve({ data: { specs: [] } }),
    itemId ? AdminAPI.equipmentItems.getTags(itemId) : Promise.resolve({ data: { tags: [] } })
  ]).then(function (results) {
    var listings = (results[0] && results[0].data) || [];
    var specsPayload = (results[1] && results[1].data) || {};
    var tagsPayload = (results[2] && results[2].data) || {};

    // 依規格分組，方便切換下拉時填表
    var byVariant = {};
    (listings || []).forEach(function (row) {
      if (!row || !row.rentalSkuVariantId) {
        return;
      }
      if (!byVariant[row.rentalSkuVariantId]) {
        byVariant[row.rentalSkuVariantId] = {};
      }
      byVariant[row.rentalSkuVariantId][row.campgroundId] = row;
    });
    rentalListingsModalState.listingsByVariant = byVariant;

    var specs = specsPayload.specs || [];
    $('#rentalEquipmentSpecsInput').val(specs.map(function (s) {
      return String(s.key || '') + '=' + String(s.value || '');
    }).join('\n'));
    $('#rentalEquipmentTagsInput').val((tagsPayload.tags || []).join(', '));

    renderRentalListingRowsForSelectedVariant();
  }).catch(function (error) {
    AdminAPI.handleError(error, '載入上架／規格失敗');
  });
}

/**
 * 把 #rentalListingRows 目前輸入寫回 rentalListingsModalState（依目前選中規格）。
 * Persist visible listing rows into modal state for the selected variant.
 */
function persistCurrentRentalListingRowsToState() {
  var variantId = $('#rentalListingVariantSelect').val();
  if (!variantId) {
    return;
  }
  var currentMap = rentalListingsModalState.listingsByVariant[variantId] || {};
  $('#rentalListingRows .rental-listing-row').each(function () {
    var $row = $(this);
    var campId = $row.data('campground-id');
    var weekday = $row.find('.listing-weekday').val();
    var holiday = $row.find('.listing-holiday').val();
    var discount = $row.find('.listing-discount').val();
    var active = $row.find('.listing-active').is(':checked');
    if (!active && (weekday === '' || weekday == null) && (holiday === '' || holiday == null)) {
      delete currentMap[campId];
      return;
    }
    currentMap[campId] = {
      campgroundId: campId,
      rentalSkuVariantId: variantId,
      pricePerDayWeekday: weekday === '' ? '0' : String(weekday),
      pricePerDayHoliday: holiday === '' ? '0' : String(holiday),
      discount: discount === '' ? '0' : String(discount),
      terrain: (currentMap[campId] && currentMap[campId].terrain) || null,
      description: (currentMap[campId] && currentMap[campId].description) || null,
      active: !!active
    };
  });
  rentalListingsModalState.listingsByVariant[variantId] = currentMap;
}

/**
 * 依目前選中的租借規格，重繪各營區定價列。
 * Rebuild campground price rows for the selected rental variant.
 */
function renderRentalListingRowsForSelectedVariant() {
  var variantId = $('#rentalListingVariantSelect').val();
  var existing = (rentalListingsModalState.listingsByVariant || {})[variantId] || {};
  var html = ADMIN_RENTAL_CAMP_IDS.map(function (campId) {
    var row = existing[campId] || {};
    var label = ADMIN_RENTAL_CAMP_LABELS[campId] || campId;
    var weekday = row.pricePerDayWeekday != null ? row.pricePerDayWeekday : '';
    var holiday = row.pricePerDayHoliday != null ? row.pricePerDayHoliday : '';
    var discount = row.discount != null ? row.discount : '0';
    var active = row.active === true;
    return '<tr class="rental-listing-row" data-campground-id="' + escapeHtml(campId) + '">' +
      '<td class="small">' + escapeHtml(label) + '</td>' +
      '<td><input type="number" min="0" step="0.01" class="form-control form-control-sm listing-weekday" value="' + escapeHtml(String(weekday)) + '"></td>' +
      '<td><input type="number" min="0" step="0.01" class="form-control form-control-sm listing-holiday" value="' + escapeHtml(String(holiday)) + '"></td>' +
      '<td><input type="number" min="0" max="0.3" step="0.01" class="form-control form-control-sm listing-discount" value="' + escapeHtml(String(discount)) + '"></td>' +
      '<td class="text-center"><input type="checkbox" class="form-check-input listing-active"' + (active ? ' checked' : '') + '></td>' +
      '</tr>';
  }).join('');
  $('#rentalListingRows').html(html);
}

/**
 * 收集畫面輸入並呼叫 replaceListings + specs/tags。
 * Collect form values and PUT listings + equipment specs/tags.
 */
function submitRentalListingsModal() {
  var rentalId = rentalListingsModalState.rentalId;
  var itemId = rentalListingsModalState.itemId;
  var variantId = $('#rentalListingVariantSelect').val();
  if (!rentalId || !variantId) {
    window.showAdminToast('缺少租借 SKU 或規格', 'danger');
    return;
  }

  persistCurrentRentalListingRowsToState();

  var listings = [];
  Object.keys(rentalListingsModalState.listingsByVariant).forEach(function (vid) {
    var campMap = rentalListingsModalState.listingsByVariant[vid] || {};
    Object.keys(campMap).forEach(function (campId) {
      var row = campMap[campId];
      if (!row) {
        return;
      }
      listings.push({
        campgroundId: row.campgroundId,
        rentalSkuVariantId: row.rentalSkuVariantId || vid,
        pricePerDayWeekday: row.pricePerDayWeekday,
        pricePerDayHoliday: row.pricePerDayHoliday,
        discount: row.discount == null ? '0' : row.discount,
        terrain: row.terrain || null,
        description: row.description || null,
        active: row.active === true
      });
    });
  });

  var specs = [];
  String($('#rentalEquipmentSpecsInput').val() || '').split(/\r?\n/).forEach(function (line) {
    var trimmed = String(line || '').trim();
    if (!trimmed) {
      return;
    }
    var sep = trimmed.indexOf('=');
    if (sep < 1) {
      return;
    }
    var key = trimmed.slice(0, sep).trim();
    var value = trimmed.slice(sep + 1).trim();
    if (key && value) {
      specs.push({ key: key, value: value });
    }
  });

  var tags = String($('#rentalEquipmentTagsInput').val() || '')
    .split(',')
    .map(function (t) { return String(t || '').trim(); })
    .filter(Boolean);

  var $btn = $('#submitRentalListings').prop('disabled', true);
  var tasks = [
    AdminAPI.rentals.replaceListings(rentalId, { listings: listings })
  ];
  if (itemId) {
    tasks.push(AdminAPI.equipmentItems.replaceSpecs(itemId, { specs: specs }));
    tasks.push(AdminAPI.equipmentItems.replaceTags(itemId, { tags: tags }));
  }

  Promise.all(tasks)
    .then(function () {
      bootstrap.Modal.getOrCreateInstance(document.getElementById('rentalListingsModal')).hide();
      window.showAdminToast('已儲存上架定價' + (itemId ? '與裝備規格／標籤' : ''));
    })
    .catch(function (error) {
      AdminAPI.handleError(error, '儲存上架定價失敗');
    })
    .finally(function () {
      $btn.prop('disabled', false);
    });
}
