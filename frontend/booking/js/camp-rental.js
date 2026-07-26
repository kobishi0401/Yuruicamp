/**
 * camp-rental.js
 * 功能：裝備租借頁邏輯
 *   ① 讀取 LocalStorage 取得 campgroundId 與日期資訊（camelCase）
 *   ② 過濾只顯示對應營區的可租借裝備
 *   ③ 渲染情境推薦橫幅（依據 terrainTag）
 *   ④ 加入 / 移除裝備，即時更新側欄已選清單
 *   ⑤ 確認後更新 LocalStorage 並前往結帳頁
 *
 * Handles: LocalStorage read, equipment filtering, recommendation
 *          banner, cart management, LocalStorage update
 */

// ============================================================
// 全域狀態 / Global State
// ============================================================
let bookingCart = null; // 從 LocalStorage 讀取的預約資料（camelCase）
let allRentals = []; // 所有裝備原始資料（完整陣列）
let selectedRentals = {}; // 已選裝備：{ equipmentId: { ...item, quantity } }

// ============================================================
// 頁面初始化 / Page Initialization
// ============================================================
$(document).ready(function () {
  // 步驟 1：讀取並正規化 bookingCart（相容舊 snake_case）
  bookingCart = typeof window.readBookingCart === 'function' ? window.readBookingCart() : null;

  // 防呆：若 LocalStorage 無資料，代表使用者跳過了前面的流程
  if (!bookingCart || !bookingCart.bookingInfo) {
    showToast('預約資訊已遺失，請重新搜尋營區。', 'warning');
    window.location.href = './camp-search.html';
    return;
  }

  // 若讀到舊格式，立刻寫回 camelCase，之後各頁就不用再轉
  if (typeof window.writeBookingCart === 'function') {
    bookingCart = window.writeBookingCart(bookingCart);
  }

  var info = bookingCart.bookingInfo;

  // 步驟 2：渲染頂部預約摘要列
  renderSummaryBar(info);

  // 修改連結帶上 campgroundId
  $('#summaryEditLink').attr('href', `./camp-detail.html?id=${info.campgroundId}`);

  // 步驟 3：載入裝備資料
  loadRentals(info.campgroundId);

  // 步驟 4：綁定「前往結帳」按鈕
  $('#goToBookingCartBtn').on('click', saveRentalsAndNext);
});

// ============================================================
// 渲染頂部預約摘要列
// ============================================================

/**
 * 從 bookingInfo 產生頂部摘要列文字
 * Generate summary bar text from bookingInfo (camelCase)
 *
 * @param {Object} info - bookingCart.bookingInfo
 */
function renderSummaryBar(info) {
  const text = `
    <strong>${info.campgroundName}</strong>
    <span class="summarySeparator summarySeparatorBooking">|</span>
    ${info.checkIn} ～ ${info.checkOut}
    <span class="summarySeparator summarySeparatorBooking">|</span>
    共 ${info.totalDays} 晚（平日 ${info.weekdayCount}、假日 ${info.holidayCount}）
    <span class="summarySeparator summarySeparatorBooking">|</span>
    ${info.guestCount} 人
  `;
  $('#summaryText').html(text);
}

// ============================================================
// 載入裝備資料
// ============================================================

/**
 * 載入 rentals.json 並過濾出屬於當前 campground_id 的裝備
 * Load rentals.json and filter by current campground_id
 *
 * @param {string} campId - 要過濾的 campground_id
 */
function loadRentals(campId) {
  // 透過 BookingAPI 讀取營區裝備（camp-equipment.json，camelCase 欄位）
  // Load campground equipment via BookingAPI
  if (!window.BookingAPI) {
    console.error('[camp-rental] BookingAPI 未載入');
    $('#rentalGrid').html(
      '<div class="errorMsg"><i class="bi bi-exclamation-triangle"></i> API 未載入。</div>'
    );
    return;
  }

  window.BookingAPI.getEquipment(campId)
    .then(function (filtered) {
      allRentals = filtered;
      return refreshRentalAvailability(filtered, bookingCart.bookingInfo).then(function (withStock) {
        allRentals = withStock;
        return withStock;
      });
    })
    .then(function (filtered) {
      // 渲染推薦橫幅 / Render recommendation banner
      renderRecommendationBanner(filtered, bookingCart.bookingInfo);

      // 渲染裝備卡片 / Render rental cards
      renderRentalItems(filtered);

      // 更新數量顯示 / Update count badge
      if (filtered.length > 0) {
        $('#rentalCount').text(`（共 ${filtered.length} 件）`);
      }
    })
    .catch(function (err) {
      console.error('[camp-rental] 裝備資料載入失敗:', err);
      $('#rentalGrid').html(`
      <div class="errorMsg">
        <i class="bi bi-exclamation-triangle"></i>
        裝備資料載入失敗。
      </div>
    `);
    });
}

// ============================================================
// 渲染情境推薦橫幅
// ============================================================

/**
 * 依據裝備的 terrain_tag 顯示推薦橫幅
 * Show recommendation banner based on equipment terrain_tags
 *
 * @param {Array}  rentals     - 已過濾的裝備陣列
 * @param {Object} bookingInfo - 預約資訊（含營區名稱）
 */
function renderRecommendationBanner(rentals, bookingInfo) {
  const $banner = $('#recommendationBanner');

  if (rentals.length === 0) {
    $banner.hide();
    return;
  }

  // 收集所有不重複的 terrainTag / Collect unique terrainTags
  const tags = [...new Set(rentals.map((r) => r.terrainTag).filter(Boolean))];

  if (tags.length === 0) {
    $banner.hide();
    return;
  }

  // 建立推薦標籤 HTML：使用 base + Booking variant，讓推薦標籤語意與頁面視覺分離。
  const tagsHTML = tags
    .map(
      (t) =>
        `<span class="recommendationTag recommendationTagBooking"><i class="bi bi-lightbulb-fill"></i> ${t}</span>`
    )
    .join('');

  $banner
    .html(
      `
    <div class="recommendationBannerContent recommendationBannerContentBooking">
      <div class="recommendationBannerTitle recommendationBannerTitleBooking">
        <strong>📍 ${bookingInfo.campgroundName}</strong> 的情境推薦裝備
      </div>
      <div class="recommendationTags recommendationTagsBooking">${tagsHTML}</div>
    </div>
  `
    )
    .show();
}

/**
 * 依 bookingCart 日期查詢各 listing 可租量，與 checkout 使用同一套重疊保留公式。
 * Fetch rental availability for selected stay dates.
 */
function refreshRentalAvailability(items, info) {
  if (!items.length || !info || !window.BookingAPI || !window.BookingAPI.getAvailability) {
    return Promise.resolve(items);
  }

  var rentals = items.map(function (item) {
    return {
      rentalListingId: item.rentalListingId || item.equipmentId,
      quantity: 1,
    };
  });
  var stockById = {};
  items.forEach(function (item) {
    var id = item.rentalListingId || item.equipmentId;
    if (item.stock != null) stockById[id] = Number(item.stock);
  });

  return window.BookingAPI.getAvailability({
    campgroundId: info.campgroundId,
    checkIn: info.checkIn,
    checkOut: info.checkOut,
    zones: [],
    rentals: rentals,
    rentalStockById: stockById,
  })
    .then(function (result) {
      var byListing = {};
      (result.rentals || []).forEach(function (row) {
        byListing[row.rentalListingId] = row.availableQuantity;
      });
      return items.map(function (item) {
        var id = item.rentalListingId || item.equipmentId;
        if (Object.prototype.hasOwnProperty.call(byListing, id)) {
          return Object.assign({}, item, { stock: byListing[id] });
        }
        return item;
      });
    })
    .catch(function (err) {
      console.warn('[camp-rental] 租借可用量查詢失敗，維持 Mock 庫存或無庫存提示', err);
      return items;
    });
}

// ============================================================
// 渲染裝備卡片
// ============================================================

/**
 * 將裝備陣列渲染為卡片
 * Render equipment array as cards
 *
 * @param {Array} rentals - 要渲染的裝備陣列
 */
function renderRentalItems(rentals) {
  const $grid = $('#rentalGrid').empty();

  if (rentals.length === 0) {
    $grid.html(`
      <div class="noResult">
        <i class="bi bi-bag-x"></i>
        此營區目前沒有可租借的裝備。<br>
        <a href="./booking-cart.html" class="btn btnOutline">
          直接前往結帳
        </a>
      </div>
    `);
    return;
  }

  const info = bookingCart.bookingInfo;

  rentals.forEach(function (item) {
    const wPrice = item.pricing.pricePerDayWeekday;
    const hPrice = item.pricing.pricePerDayHoliday;
    const disc = item.pricing.discount;

    // 預估本次租借費用（不含數量，數量預設 1）
    // Estimated cost for this trip (quantity = 1 by default)
    const estimated = Math.max(0, wPrice * info.weekdayCount + hPrice * info.holidayCount - disc);

    // terrainTag 推薦標籤：輸出共通語意 class 與 Booking 變體 class，讓樣式責任集中在變體 selector。
    const tagHTML = item.terrainTag
      ? `<span class="bookingTag bookingTagRecommend rentalItemCardTag rentalItemCardTagBooking">${item.terrainTag}</span>`
      : '';

    // 折扣說明 / Discount note
    const discHTML =
      disc > 0
        ? `<span class="rentalItemCardDiscount rentalItemCardDiscountBooking">（已折 NT$${disc.toLocaleString()}）</span>`
        : '';

    const specHTML = item.specLabel
      ? `<p class="rentalItemCardSpec rentalItemCardSpecBooking">${item.specLabel}</p>`
      : '';

    // 顯示剩餘可租量；Backend 由 check-availability 填入 stock，Mock 沿用 JSON stock。
    const hasVisibleStock = item.stock != null && Number.isFinite(Number(item.stock));
    const stockCount = hasVisibleStock ? Number(item.stock) : null;
    const inStock = stockCount == null ? true : stockCount > 0;
    const stockHTML = hasVisibleStock
      ? inStock
        ? `<i class="bi bi-box-seam"></i> 剩餘 <strong>${stockCount}</strong> 件`
        : '<i class="bi bi-x-circle"></i> 暫無可租庫存'
      : '<i class="bi bi-shield-check"></i> 結帳時確認可租數量';
    const addDisabled = hasVisibleStock && !inStock ? ' disabled aria-disabled="true"' : '';
    const addLabel = hasVisibleStock && !inStock ? '暫無庫存' : '加入租借';

    // 租借卡片使用 base + Booking variant 雙 class；base 表示功能語意，variant 承接 booking 頁面視覺。
    const imageSrc = item.imageUrl || '';
    const card = `
      <div class="rentalItemCard rentalItemCardBooking" data-id="${item.equipmentId}">
        <img src="${imageSrc}"
             alt="${item.name}"
             class="rentalItemCardImage rentalItemCardImageBooking"
             loading="lazy"
             onerror="this.src='https://picsum.photos/seed/${item.equipmentId}/400/280'">
        <div class="rentalItemCardBody rentalItemCardBodyBooking">
          <h4 class="rentalItemCardName rentalItemCardNameBooking">${item.name}</h4>
          ${specHTML}
          ${tagHTML}
          <p class="rentalItemCardDescription rentalItemCardDescriptionBooking">${item.description}</p>
          <p class="rentalItemCardPrice rentalItemCardPriceBooking">
            平日 NT$${wPrice}/天 ／ 假日 NT$${hPrice}/天
          </p>
          <p class="rentalItemCardEstimated rentalItemCardEstimatedBooking">
            本次預估：<strong>NT$${estimated.toLocaleString()}</strong>${discHTML}
          </p>
          <p class="rentalItemCardStock rentalItemCardStockBooking">
            ${stockHTML}
          </p>
        </div>
        <div class="rentalItemCardActions rentalItemCardActionsBooking">
          <button class="btn btnOutline rentalAddButton rentalAddButtonBooking" data-id="${item.equipmentId}"${addDisabled}>
            <i class="bi bi-plus-circle"></i> ${addLabel}
          </button>
        </div>
      </div>
    `;
    $grid.append(card);
  });

  // 綁定加入租借事件：使用 rentalAddButtonBooking 作為互動 hook，避免回到縮寫式 btn 命名。
  $grid.on('click', '.rentalAddButtonBooking', function () {
    if (this.disabled || this.getAttribute('aria-disabled') === 'true') return;
    const id = $(this).data('id');
    addRentalItem(id);

    // 按鈕短暫反饋 / Brief button feedback
    const $btn = $(this);
    $btn.html('<i class="bi bi-check-circle-fill"></i> 已加入').addClass('isSelected');
    setTimeout(() => {
      $btn.html('<i class="bi bi-plus-circle"></i> 再加一件').removeClass('isSelected');
    }, 1000);
  });
}

// ============================================================
// 加入 / 移除裝備邏輯
// ============================================================

/**
 * 將裝備加入已選清單（若已存在則 +1 數量）
 * Add rental item to selected map (increment qty if already added)
 *
 * @param {string} equipmentId - 裝備的 equipment_id
 */
function addRentalItem(equipmentId) {
  const item = allRentals.find((r) => r.equipmentId === equipmentId);
  if (!item) return;

  if (selectedRentals[equipmentId]) {
    // Mock 有顯示庫存時先限制數量；Backend 由建立 Checkout 的交易做最終判斷。
    if (item.stock == null || selectedRentals[equipmentId].quantity < item.stock) {
      selectedRentals[equipmentId].quantity++;
    } else {
      showToast(`庫存不足，最多可租借 ${item.stock} 件。`, 'warning');
      return;
    }
  } else {
    if (item.stock != null && Number(item.stock) < 1) {
      showToast('此裝備目前沒有可租庫存。', 'warning');
      return;
    }

    // 新增 / New entry
    selectedRentals[equipmentId] = { ...item, quantity: 1 };
  }

  updateRentalCartUI();
}

/**
 * 從已選清單移除指定裝備
 * Remove rental item from selected map
 *
 * @param {string} equipmentId - 要移除的 equipment_id
 */
function removeRentalItem(equipmentId) {
  delete selectedRentals[equipmentId];
  updateRentalCartUI();
}

// ============================================================
// 更新右側已選清單 UI
// ============================================================

/**
 * 重新渲染右側已選裝備清單與費用小計
 * Re-render the selected rental list and cost subtotal
 */
function updateRentalCartUI() {
  const $list = $('#rentalCartList').empty();
  const items = Object.values(selectedRentals);
  const info = bookingCart.bookingInfo;

  // 無選擇時顯示空狀態 / Show empty state if nothing selected
  if (items.length === 0) {
    $list.html('<p class="rentalCartEmpty rentalCartEmptyBooking">尚未選擇任何裝備</p>');
    $('#rentalSubtotal').text('NT$0');
    return;
  }

  let totalRental = 0;

  items.forEach(function (item) {
    // 單筆小計 = (平日租金 × 平日天數 + 假日租金 × 假日天數 - 折扣) × 數量
    // Item subtotal = (weekday × wdays + holiday × hdays - discount) × quantity
    const perUnit = Math.max(
      0,
      item.pricing.pricePerDayWeekday * info.weekdayCount +
        item.pricing.pricePerDayHoliday * info.holidayCount -
        item.pricing.discount
    );
    const subtotal = perUnit * item.quantity;
    totalRental += subtotal;

    // 右側租借清單列同樣使用 base + Booking variant，避免樣式綁在結構型 span selector。
    $list.append(`
      <div class="rentalCartItem rentalCartItemBooking">
        <div class="rentalCartItemText rentalCartItemTextBooking">
          <span class="rentalCartItemName rentalCartItemNameBooking">${item.name} ×${item.quantity}</span>
          ${item.specLabel ? `<span class="rentalCartItemSpec rentalCartItemSpecBooking">${item.specLabel}</span>` : ''}
        </div>
        <span class="rentalCartItemPrice rentalCartItemPriceBooking">NT$${subtotal.toLocaleString()}</span>
        <button class="rentalRemoveButton rentalRemoveButtonBooking" data-id="${item.equipmentId}" title="移除">
          <i class="bi bi-x"></i>
        </button>
      </div>
    `);
  });

  $('#rentalSubtotal').text(`NT$${totalRental.toLocaleString()}`);

  // 綁定移除租借事件：rentalRemoveButtonBooking 表示側欄移除單一已選裝備。
  $list.on('click', '.rentalRemoveButtonBooking', function () {
    removeRentalItem($(this).data('id'));
  });
}

// ============================================================
// 儲存裝備選擇並前往結帳頁
// ============================================================

/**
 * 將 selectedRentals 合併進 bookingCart，更新 LocalStorage，然後跳轉
 * Merge selected rentals into bookingCart, update LocalStorage, redirect
 */
function saveRentalsAndNext() {
  const info = bookingCart.bookingInfo;
  const items = Object.values(selectedRentals);

  // 計算每件裝備的小計（camelCase 欄位）
  const rentalList = items.map(function (item) {
    const perUnit = Math.max(
      0,
      item.pricing.pricePerDayWeekday * info.weekdayCount +
        item.pricing.pricePerDayHoliday * info.holidayCount -
        item.pricing.discount
    );
    return {
      equipmentId: item.equipmentId,
      rentalListingId: item.rentalListingId || item.equipmentId,
      rentalSkuVariantId: item.rentalSkuVariantId || item.variantId,
      rentalSkuId: item.rentalSkuId,
      productId: item.productId,
      variantId: item.variantId,
      sku: item.sku,
      name: item.name,
      specLabel: item.specLabel || '',
      quantity: item.quantity,
      subtotal: perUnit * item.quantity,
    };
  });

  const rentalTotal = rentalList.reduce((sum, r) => sum + r.subtotal, 0);
  const zoneTotal = (bookingCart.summary && bookingCart.summary.zoneTotal) || 0;

  // 計算總折扣（各件裝備的 discount × 數量加總）
  const totalDiscount = items.reduce((sum, i) => sum + i.pricing.discount * i.quantity, 0);

  // 更新 bookingCart（全程 camelCase）
  bookingCart.selectedRentals = rentalList;
  bookingCart.summary = {
    zoneTotal: zoneTotal,
    rentalTotal: rentalTotal,
    appliedDiscount: totalDiscount,
    finalAmount: zoneTotal + rentalTotal,
  };

  if (typeof window.writeBookingCart === 'function') {
    bookingCart = window.writeBookingCart(bookingCart);
  } else {
    localStorage.setItem('bookingCart', JSON.stringify(bookingCart));
  }

  console.log('[camp-rental] 已更新 LocalStorage bookingCart:', bookingCart);

  window.location.href = './booking-cart.html';
}
