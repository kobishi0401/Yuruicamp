/**
 * admin/js/products.js
 * 商品 & 庫存管理模組
 * 使用 jQuery Event Namespace (.products) 防止重複導覽時事件堆疊
 *
 * products.json 欄位對應：thumbnail（非 image）、status:"active"/"disabled"（非 active:bool）
 * 分店庫存由 branch.branch-001 / branch-002 / branch-003 保存，總庫存由 total-stock 保存。
 * 低庫存（total-stock < 5）的 <tr> 加上 table-danger class，整列顯示淡紅色背景
 */

var PRODUCT_IMAGE_PLACEHOLDER = 'https://placehold.co/48x48/cccccc/555555?text=No+Image';
var ADMIN_PRODUCT_BRANCH_IDS = ['branch-001', 'branch-002', 'branch-003'];
var adminProductsCache = [];
var adminRentalsCache = [];
var adminRentalsLoaded = false;

window.initProducts = function () {
  $(document).off('.products');
  bindProductViewTabs();

  $.getJSON('data/products.json', function (products) {
    adminProductsCache = (products || []).map(normalizeProductBranch);
    renderProductsTable(adminProductsCache);
  }).fail(function () {
    $('#productsTableBody').html(
      '<tr><td colspan="8" class="text-center text-danger py-4">' +
      '<i class="fas fa-exclamation-triangle me-2"></i>載入商品數據失敗' +
      '</td></tr>'
    );
  });

  loadProductSpecOptions();

  // 從列表開啟新增商品 Modal 時，清空上一次編輯狀態
  $(document).on('click.products', '[data-bs-target="#addProductModal"]:not(.edit-product-btn)', function () {
    resetProductModalForm();
  });

  // 新增商品 Modal：切換租借商品時，顯示 / 隱藏存放營地欄位。
  $(document).on('change.products', '#newProductIsRental', function () {
    syncRentalFormState($(this).is(':checked'));
  });

  // 庫存數量步進：總庫存與分店庫存共用同一組事件。
  $(document).on('click.products', '.stock-step-btn', function () {
    var $control = $(this).closest('.admin-stock-control');
    var $input = $control.find('.stock-input');
    var action = $(this).data('stock-action');
    var currentQty = getStockInputValue($input);
    var nextQty = action === 'decrement' ? currentQty - 1 : currentQty + 1;

    $input.val(Math.max(nextQty, 0)).trigger('input');
  });

  // 欄位資料有異動才啟用同列的確定按鈕。
  $(document).on('input.products change.products', '.stock-input', function () {
    syncStockConfirmState($(this).closest('tr'));
  });

  // 庫存確認：檢查總庫存必須等於分店 A/B/C 加總後才更新畫面資料。
  $(document).on('click.products', '.stock-confirm-btn', function () {
    var $button = $(this);
    var $row = $button.closest('tr');
    var inventoryType = $row.data('inventory-type') || 'store';
    var productId = $row.data('product-id');

    if (inventoryType === 'rental') {
      confirmRentalStockChange($row, productId, $button);
      return;
    }

    var product = findAdminProductById(productId);

    if (!product) {
      window.showAdminToast('找不到商品 ' + productId + ' 的資料', 'danger');
      return;
    }

    var totalStock = getRowStockValue($row, 'total-stock');
    var branchStock = {};
    ADMIN_PRODUCT_BRANCH_IDS.forEach(function (branchId) {
      branchStock[branchId] = getRowStockValue($row, branchId);
    });

    var branchTotal = getBranchTotal(branchStock);
    if (branchTotal !== totalStock) {
      window.showAdminToast(
        '分店數量加總 ' + branchTotal + ' 與總庫存 ' + totalStock + ' 不一致，請調整後再確定',
        'danger'
      );
      return;
    }

    product['total-stock'] = totalStock;
    product.branch = branchStock;
    delete product.stock;

    $row.toggleClass('table-danger', totalStock < 5);
    $row.find('.stock-input').each(function () {
      var $input = $(this);
      var qty = getStockInputValue($input);
      $input.val(qty).attr('data-original-qty', qty).data('original-qty', qty);
    });
    $button.prop('disabled', true);

    window.showAdminToast('商品 ' + productId + ' 庫存數量已更新');
  });

  // 編輯商品：使用同一個新增商品 Modal，並從 admin/data/products.json 帶入資料
  $(document).on('click.products', '.edit-product-btn', function () {
    var $row = $(this).closest('tr');
    var inventoryType = $row.data('inventory-type') || 'store';
    var productId = $row.data('product-id');

    if (inventoryType === 'rental') {
      var rental = findAdminRentalById(productId);

      if (!rental) {
        window.showAdminToast('找不到租借商品 ' + productId + ' 的資料', 'danger');
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

  // 新增規格欄位
  $(document).on('click.products', '#addSpec', function () {
    var specKey = $('#newProductSpec').val().trim();
    if (!specKey) {
      window.showAdminToast('請先輸入或選擇規格名稱', 'danger');
      return;
    }

    var isDuplicate = $('#productSpecFields input[data-spec-key]').toArray().some(function (input) {
      return input.id === specKey;
    });

    if (isDuplicate) {
      window.showAdminToast('此規格欄位已存在', 'danger');
      return;
    }

    var $field = $('<div>', { class: 'mb-2 product-spec-field' });
    var $label = $('<label>', { class: 'form-label small text-muted mb-1' })
      .attr('for', specKey)
      .text(specKey);
    var $input = $('<input>', {
      type: 'text',
      class: 'form-control form-control-sm'
    })
      .attr('id', specKey)
      .attr('data-spec-key', specKey);

    $field.append($label, $input);
    $('#productSpecFields').append($field);
    $('#newProductSpec').val('').trigger('focus');
  });

  // 新增商品
  $(document).on('click.products', '#submitAddProduct', function () {
    var name               = $('#newProductName').val().trim();
    var price              = parseInt($('#newProductPrice').val(), 10) || 0;
    var stock              = parseInt($('#newProductStock').val(), 10) || 0;
    var category           = $('#newProductCategory').val().trim();
    var isRental           = $('#newProductIsRental').is(':checked');
    var rentalCamp         = $('#newRentalCamp').val().trim();
    var mainImageInput     = $('#newProductMainImage')[0];
    var secondaryImageInput = $('#newProductImages')[0];
    var mainImageFile      = mainImageInput && mainImageInput.files.length > 0
      ? mainImageInput.files[0]
      : null;
    var secondaryImageFiles = secondaryImageInput
      ? Array.prototype.slice.call(secondaryImageInput.files)
      : [];
    var specifications = getAddedSpecifications();
    var $form = $('#addProductForm');
    var editProductId = $form.data('edit-product-id');
    var existingThumbnail = $form.data('existing-thumbnail');
    var existingImages = $form.data('existing-images') || [];
    var existingStatus = $form.data('existing-status') || 'active';
    var editType = $form.data('edit-type') || 'store';

    if (!name || (!isRental && price <= 0)) {
      window.showAdminToast(isRental ? '請填寫商品名稱' : '請填寫商品名稱和有效的價格', 'danger');
      return;
    }

    if (isRental && !rentalCamp) {
      window.showAdminToast('請填寫存放營地', 'danger');
      return;
    }

    if (isRental) {
      var rentalEditId = editType === 'rental' ? editProductId : null;
      var rentalItem = {
        id: rentalEditId || 'R-NEW-' + Date.now(),
        image: mainImageFile ? URL.createObjectURL(mainImageFile) : (existingThumbnail || PRODUCT_IMAGE_PLACEHOLDER),
        name: name,
        quantity: stock,
        category: category || '其他',
        camp: rentalCamp
      };

      upsertAdminRentalCache(rentalItem);

      if (rentalEditId) {
        $('#rentalProductsTableBody tr[data-product-id="' + escapeSelector(rentalEditId) + '"]')
          .replaceWith($(buildRentalRow(rentalItem)).hide().fadeIn(400));
      } else {
        $('#rentalProductsTableBody').prepend($(buildRentalRow(rentalItem)).hide().fadeIn(400));
      }

      resetProductModalForm();
      switchProductView('rental');
      var rentalModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('addProductModal'));
      rentalModal.hide();
      window.showAdminToast('租借商品「' + name + '」已' + (editProductId ? '更新' : '新增'));
      return;
    }

    var storeEditId = editType === 'store' ? editProductId : null;
    var newProduct = {
      id: storeEditId || 'P-NEW-' + Date.now(),
      thumbnail: mainImageFile ? URL.createObjectURL(mainImageFile) : (existingThumbnail || PRODUCT_IMAGE_PLACEHOLDER),
      name: name,
      category: category || '其他',
      spec: $('#newProductSpec').val().trim(),
      price: price,
      'total-stock': stock,
      branch: splitBranchStock(stock),
      status: existingStatus,
      images: secondaryImageFiles.length > 0
        ? secondaryImageFiles.map(function (file) {
          return file.name;
        })
        : existingImages,
      specifications: specifications
    };

    upsertAdminProductCache(newProduct);

    if (storeEditId) {
      $('#productsTableBody tr[data-product-id="' + escapeSelector(storeEditId) + '"]')
        .replaceWith($(buildProductRow(newProduct)).hide().fadeIn(400));
    } else {
      $('#productsTableBody').prepend($(buildProductRow(newProduct)).hide().fadeIn(400));
    }

    resetProductModalForm();

    var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('addProductModal'));
    modal.hide();

    window.showAdminToast('商品「' + name + '」已' + (editProductId ? '更新' : '新增'));
  });
};

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
  if (adminRentalsLoaded) {
    renderRentalProductsTable(adminRentalsCache);
    return;
  }

  $('#rentalProductsTableBody').html(
    '<tr><td colspan="6" class="text-center py-4">' +
    '<div class="spinner-border spinner-border-sm me-2" style="color: var(--admin-brand-accent);"></div>' +
    '<span class="text-muted">載入租借商品中...</span>' +
    '</td></tr>'
  );

  $.getJSON('data/reantal.json', function (rentals) {
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
    renderRentalProductsTable(adminRentalsCache);
  }).fail(function () {
    $('#rentalProductsTableBody').html(
      '<tr><td colspan="6" class="text-center text-danger py-4">' +
      '<i class="fas fa-exclamation-triangle me-2"></i>載入租借商品數據失敗' +
      '</td></tr>'
    );
  });
}

function normalizeRentalItem(item) {
  return {
    id: item && item.id ? item.id : 'R-NEW-' + Date.now(),
    image: (item && (item.image || item.thumbnail)) || PRODUCT_IMAGE_PLACEHOLDER,
    name: (item && item.name) || '未命名租借商品',
    quantity: normalizeStockValue(item && item.quantity),
    category: (item && item.category) || '其他',
    camp: (item && (item.camp || item.storageCamp)) || ''
  };
}

function findAdminRentalById(rentalId) {
  return (adminRentalsCache || []).find(function (item) {
    return item.id === rentalId;
  });
}

function upsertAdminRentalCache(rentalItem) {
  var normalizedItem = normalizeRentalItem(rentalItem);
  var index = adminRentalsCache.findIndex(function (item) {
    return item.id === normalizedItem.id;
  });

  if (index >= 0) {
    adminRentalsCache[index] = normalizedItem;
  } else {
    adminRentalsCache.unshift(normalizedItem);
  }

  return normalizedItem;
}

function confirmRentalStockChange($row, rentalId, $button) {
  var rental = findAdminRentalById(rentalId);

  if (!rental) {
    window.showAdminToast('找不到租借商品 ' + rentalId + ' 的資料', 'danger');
    return;
  }

  var quantity = getRowStockValue($row, 'quantity');
  rental.quantity = quantity;

  $row.toggleClass('table-danger', quantity < 5);
  $row.find('.stock-input').each(function () {
    var $input = $(this);
    $input.val(quantity).attr('data-original-qty', quantity).data('original-qty', quantity);
  });
  $button.prop('disabled', true);

  window.showAdminToast('租借商品 ' + rentalId + ' 數量已更新');
}

function syncRentalFormState(isRental) {
  $('#rentalCampField').toggleClass('d-none', !isRental);
  $('#newRentalCamp').prop('required', isRental);
  $('#newProductPrice').prop('required', !isRental);
}

function normalizeProductBranch(product) {
  if (!product) {
    return product;
  }

  var totalStock = getProductTotalStock(product);

  if (!product.branch || typeof product.branch !== 'object') {
    product.branch = splitBranchStock(totalStock);
  } else {
    ADMIN_PRODUCT_BRANCH_IDS.forEach(function (branchId) {
      product.branch[branchId] = normalizeStockValue(product.branch[branchId]);
    });
  }

  product['total-stock'] = totalStock;
  delete product.stock;
  return product;
}

function splitBranchStock(totalStock) {
  var total = Math.max(parseInt(totalStock, 10) || 0, 0);
  var baseQty = Math.floor(total / ADMIN_PRODUCT_BRANCH_IDS.length);
  var remainder = total % ADMIN_PRODUCT_BRANCH_IDS.length;
  var branchStock = {};

  ADMIN_PRODUCT_BRANCH_IDS.forEach(function (branchId, index) {
    branchStock[branchId] = baseQty + (index < remainder ? 1 : 0);
  });

  return branchStock;
}

function getProductTotalStock(product) {
  var totalStock = parseInt(product && product['total-stock'], 10);
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

function getBranchTotal(branchStock) {
  return ADMIN_PRODUCT_BRANCH_IDS.reduce(function (sum, branchId) {
    return sum + normalizeStockValue(branchStock && branchStock[branchId]);
  }, 0);
}

function getStockInputValue($input) {
  return normalizeStockValue($input.val());
}

function getRowStockValue($row, fieldName) {
  return getStockInputValue($row.find('.stock-input[data-stock-field="' + fieldName + '"]'));
}

function syncStockConfirmState($row) {
  var hasChanged = $row.find('.stock-input').toArray().some(function (input) {
    var $input = $(input);
    var originalQty = normalizeStockValue($input.attr('data-original-qty'));
    return getStockInputValue($input) !== originalQty;
  });

  $row.find('.stock-confirm-btn').prop('disabled', !hasChanged);
}

function buildStockControl(fieldName, qty, label) {
  var safeQty = normalizeStockValue(qty);

  return '<div class="input-group input-group-sm admin-stock-control">' +
    '<button type="button" class="btn btn-outline-secondary stock-step-btn" ' +
    'data-stock-action="decrement" title="' + escapeHtml(label) + ' 減少">' +
    '<i class="fas fa-minus"></i></button>' +
    '<input type="number" class="form-control text-center stock-input" ' +
    'min="0" value="' + safeQty + '" data-original-qty="' + safeQty + '" ' +
    'data-stock-field="' + escapeHtml(fieldName) + '" aria-label="' + escapeHtml(label) + '">' +
    '<button type="button" class="btn btn-outline-secondary stock-step-btn" ' +
    'data-stock-action="increment" title="' + escapeHtml(label) + ' 增加">' +
    '<i class="fas fa-plus"></i></button>' +
    '</div>';
}

/**
 * 從前台 data/products.json 的 specifications 物件收集不重複 key，填入 datalist。
 */
function loadProductSpecOptions() {
  var $specOptions = $('#productSpecOptions');
  if ($specOptions.length === 0) {
    return;
  }

  $.getJSON('../data/products.json', function (products) {
    var keyMap = {};
    (products || []).forEach(function (product) {
      if (!product.specifications || typeof product.specifications !== 'object') {
        return;
      }

      Object.keys(product.specifications).forEach(function (key) {
        keyMap[key] = true;
      });
    });

    var optionsHtml = Object.keys(keyMap).sort().map(function (key) {
      return '<option value="' + escapeHtml(key) + '"></option>';
    }).join('');

    $specOptions.html(optionsHtml);
  }).fail(function () {
    window.showAdminToast('載入規格選項失敗', 'danger');
  });
}

function getAddedSpecifications() {
  var specifications = {};

  $('#productSpecFields input[data-spec-key]').each(function () {
    var key = $(this).attr('data-spec-key');
    var value = $(this).val().trim();

    if (key && value) {
      specifications[key] = value;
    }
  });

  return specifications;
}

function findAdminProductById(productId) {
  return (adminProductsCache || []).find(function (product) {
    return product.id === productId;
  });
}

function fillProductModal(product) {
  resetProductModalForm();

  $('#addProductForm')
    .data('edit-product-id', product.id)
    .data('edit-type', 'store')
    .data('existing-thumbnail', product.thumbnail || PRODUCT_IMAGE_PLACEHOLDER)
    .data('existing-images', product.images || [])
    .data('existing-status', product.status || 'active');

  syncRentalFormState(false);
  $('#newProductIsRental').prop('checked', false);
  $('#newProductName').val(product.name || '');
  $('#newProductCategory').val(product.category || '');
  $('#newProductSpec').val(product.spec || '');
  $('#newProductPrice').val(product.price || '');
  $('#newProductStock').val(getProductTotalStock(product));

  if (product.specifications && typeof product.specifications === 'object') {
    Object.keys(product.specifications).forEach(function (key) {
      addSpecificationField(key, product.specifications[key]);
    });
  }
}

function fillRentalModal(rental) {
  resetProductModalForm();

  $('#addProductForm')
    .data('edit-product-id', rental.id)
    .data('edit-type', 'rental')
    .data('existing-thumbnail', rental.image || PRODUCT_IMAGE_PLACEHOLDER)
    .data('existing-images', [])
    .data('existing-status', 'active');

  $('#newProductIsRental').prop('checked', true);
  syncRentalFormState(true);
  $('#newProductName').val(rental.name || '');
  $('#newProductCategory').val(rental.category || '其他');
  $('#newProductSpec').val('');
  $('#newProductPrice').val('');
  $('#newProductStock').val(normalizeStockValue(rental.quantity));
  $('#newRentalCamp').val(rental.camp || '');
}

function resetProductModalForm() {
  var form = $('#addProductForm')[0];
  if (form) {
    form.reset();
  }

  $('#addProductForm')
    .removeData('edit-product-id')
    .removeData('edit-type')
    .removeData('existing-thumbnail')
    .removeData('existing-images')
    .removeData('existing-status');
  $('#productSpecFields').empty();
  $('#newProductIsRental').prop('checked', false);
  $('#newRentalCamp').val('');
  syncRentalFormState(false);
}

function addSpecificationField(specKey, value) {
  if (!specKey) {
    return;
  }

  var $field = $('<div>', { class: 'mb-2 product-spec-field' });
  var $label = $('<label>', { class: 'form-label small text-muted mb-1' })
    .attr('for', specKey)
    .text(specKey);
  var $input = $('<input>', {
    type: 'text',
    class: 'form-control form-control-sm'
  })
    .attr('id', specKey)
    .attr('data-spec-key', specKey)
    .val(value || '');

  $field.append($label, $input);
  $('#productSpecFields').append($field);
}

function upsertAdminProductCache(product) {
  var index = adminProductsCache.findIndex(function (item) {
    return item.id === product.id;
  });

  if (index >= 0) {
    adminProductsCache[index] = product;
  } else {
    adminProductsCache.unshift(product);
  }
}

function buildProductRow(p) {
  var stock    = getProductTotalStock(p);
  var isLow    = stock < 5;
  var rowClass = isLow ? ' class="table-danger"' : '';
  var imgSrc = p.thumbnail || PRODUCT_IMAGE_PLACEHOLDER;

  return '<tr data-product-id="' + escapeHtml(p.id) + '" data-inventory-type="store"' + rowClass + '>' +
    '<td><img src="' + escapeHtml(imgSrc) + '" width="48" height="48" class="rounded object-fit-cover"' +
    ' onerror="this.src=\'' + PRODUCT_IMAGE_PLACEHOLDER + '\'"></td>' +
    '<td class="fw-semibold">' + escapeHtml(p.name) + '</td>' +
    '<td><span class="badge bg-light text-dark border">' + escapeHtml(p.category || '—') + '</span></td>' +
    '<td class="stock-cell">' + buildStockControl('total-stock', stock, '總庫存量') + '</td>' +
    '<td class="stock-cell">' + buildStockControl('branch-001', getProductBranchStock(p, 'branch-001'), '分店 A') + '</td>' +
    '<td class="stock-cell">' + buildStockControl('branch-002', getProductBranchStock(p, 'branch-002'), '分店 B') + '</td>' +
    '<td class="stock-cell">' + buildStockControl('branch-003', getProductBranchStock(p, 'branch-003'), '分店 C') + '</td>' +
    '<td>' +
    '<div class="d-flex flex-wrap gap-1">' +
    '<button type="button" class="btn btn-sm btn-outline-secondary edit-product-btn" title="編輯商品">' +
    '<i class="fas fa-pen me-1"></i>編輯' +
    '</button>' +
    '<button type="button" class="btn btn-sm btn-success stock-confirm-btn" title="確定庫存異動" disabled>' +
    '<i class="fas fa-check me-1"></i>確定' +
    '</button>' +
    '</div>' +
    '</td>' +
    '</tr>';
}

function buildRentalRow(item) {
  var rental = normalizeRentalItem(item);
  var isLow = rental.quantity < 5;
  var rowClass = isLow ? ' class="table-danger"' : '';

  return '<tr data-product-id="' + escapeHtml(rental.id) + '" data-inventory-type="rental"' + rowClass + '>' +
    '<td><img src="' + escapeHtml(rental.image) + '" width="48" height="48" class="rounded object-fit-cover"' +
    ' onerror="this.src=\'' + PRODUCT_IMAGE_PLACEHOLDER + '\'"></td>' +
    '<td class="fw-semibold">' + escapeHtml(rental.name) + '</td>' +
    '<td><span class="badge bg-light text-dark border">' + escapeHtml(rental.category || '其他') + '</span></td>' +
    '<td class="stock-cell">' + buildStockControl('quantity', rental.quantity, '租借庫存') + '</td>' +
    '<td>' + escapeHtml(rental.camp || '—') + '</td>' +
    '<td>' +
    '<div class="d-flex flex-wrap gap-1">' +
    '<button type="button" class="btn btn-sm btn-outline-secondary edit-product-btn" title="編輯商品">' +
    '<i class="fas fa-pen me-1"></i>編輯' +
    '</button>' +
    '<button type="button" class="btn btn-sm btn-success stock-confirm-btn" title="確定庫存異動" disabled>' +
    '<i class="fas fa-check me-1"></i>確定' +
    '</button>' +
    '</div>' +
    '</td>' +
    '</tr>';
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
    $('#productsTableBody').html(
      '<tr><td colspan="8" class="text-center text-muted py-4">目前沒有商品</td></tr>'
    );
    return;
  }

  var html = products.map(function (p) {
    return buildProductRow(p);
  }).join('');

  $('#productsTableBody').html(html);
}

function renderRentalProductsTable(rentals) {
  if (!rentals || rentals.length === 0) {
    $('#rentalProductsTableBody').html(
      '<tr><td colspan="6" class="text-center text-muted py-4">目前沒有租借商品</td></tr>'
    );
    return;
  }

  var html = rentals.map(function (item) {
    return buildRentalRow(item);
  }).join('');

  $('#rentalProductsTableBody').html(html);
}
