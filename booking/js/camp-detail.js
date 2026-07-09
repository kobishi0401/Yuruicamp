/**
 * camp-detail.js
 * 功能：營區詳情頁邏輯
 *   ① 解析 URL 參數取得 campground_id
 *   ② 讀取 JSON 並渲染詳情
 *   ③ Flatpickr 日期範圍選擇 + 平日/假日計算
 *   ④ 營位選擇 → 計算費用小計
 *   ⑤ 確認後寫入 LocalStorage 並前往下一頁
 *
 * Handles: URL param parsing, data rendering, date calculation,
 *          zone selection, LocalStorage write
 */

// ============================================================
// 全域狀態 / Global State
// ============================================================
let currentCamp = null; // 當前營區完整資料 / Current campground data
let selectedZoneId = null; // 使用者選擇的 zone_id / Selected zone ID
let checkInDate = null; // 入住日期（Date 物件）/ Check-in Date object
let checkOutDate = null; // 退房日期（Date 物件）/ Check-out Date object
let weekdayCount = 0; // 平日天數 / Weekday nights count
let holidayCount = 0; // 假日天數 / Holiday nights count
let bookingWindow = { minDate: null, maxDate: null }; // 可預約窗口 / Bookable window
let availabilityCtx = null; // 可用性計算上下文 / Availability context

// ============================================================
// 頁面初始化 / Page Initialization
// ============================================================
$(document).ready(function () {
  // 步驟 1：從 URL 取得 id 參數 / Step 1: Get id from URL
  const params = new URLSearchParams(window.location.search);
  const campId = params.get('id');
  initialBookingParams = {
    checkIn: params.get('checkIn'),
    checkOut: params.get('checkOut'),
    guests: params.get('guests'),
  };

  // 防呆：缺少 id 時返回搜尋頁 / Guard: redirect if id missing
  if (!campId) {
    showToast('找不到營區資訊，即將返回搜尋頁。', 'warning');
    window.location.href = './camp-search.html';
    return;
  }

  // 步驟 2：載入資料 / Step 2: Load data
  loadCampDetail(campId);

  // 步驟 3：確認按鈕綁定 / Step 3: Bind confirm button
  $('#confirmBookingBtn').on('click', saveToLocalStorageAndNext);
});

// ============================================================
// 載入營區詳情資料
// ============================================================

/**
 * 透過 AJAX 讀取 campgrounds.json，找到對應的營區資料
 * Load campground data via AJAX, find matching entry by ID
 *
 * @param {string} campId - URL 傳入的 campground_id
 */
function loadCampDetail(campId) {
  // 透過 BookingAPI 讀取單一營區（路徑由 data-paths.js 統一管理）
  // Load single campground via BookingAPI
  if (!window.BookingAPI) {
    console.error('[camp-detail] BookingAPI 未載入');
    $('#campHeader').html('<p class="errorMsg">API 未載入，請重新整理頁面。</p>');
    return;
  }

  window.BookingAPI.getCampgroundById(campId)
    .then(function (camp) {
      currentCamp = camp;
      return Promise.all([
        window.BookingAPI.getBookingWindow(),
        window.BookingAPI.loadAvailabilityContext(),
      ]).then(function (results) {
        bookingWindow = results[0] || bookingWindow;
        availabilityCtx = results[1];
        renderCampDetail(currentCamp);
        initDatePicker();
      });
    })
    .catch(function (err) {
      console.error('[camp-detail] 資料載入失敗:', err);
      if (err.message === 'Campground not found') {
        showToast('找不到此營區（ID: ' + campId + '），即將返回搜尋頁。', 'error');
        window.location.href = './camp-search.html';
        return;
      }
      $('#campHeader').html('<p class="errorMsg">資料載入失敗，請重新整理頁面。</p>');
    });
}

// ============================================================
// 渲染頁面內容
// ============================================================

/**
 * 將營區資料填入各個 DOM 元素
 * Render campground data into DOM elements
 *
 * @param {Object} camp - 單一營區物件
 */
function renderCampDetail(camp) {
  // 更新頁面標題與麵包屑 / Update page title and breadcrumb
  document.title = camp.name + ' - Yuruicamp 露營選物';
  $('#breadcrumbName').text(camp.name);

  // 渲染 Header 區塊 / Render camp header section
  const envTagsHTML = camp.environmentTags
    .map((t) => `<span class="bookingTag bookingTagEnv">${t}</span>`)
    .join('');
  const facTagsHTML = camp.facilityTags
    .map((t) => `<span class="bookingTag bookingTagFacility">${t}</span>`)
    .join('');

  $('#campHeader').html(`
    <h1>${camp.name}</h1>
    <p class="campHeaderRegion">
      <i class="bi bi-geo-alt-fill"></i> ${camp.region}
    </p>
    <div class="campHeaderTags">${envTagsHTML}${facTagsHTML}</div>
  `);

  // 渲染圖片區（3 張 picsum 佔位圖）/ Render gallery with picsum placeholders
  const galleryHTML = [0, 1, 2]
    .map(
      (i) => `
    <img src="https://picsum.photos/seed/${camp.campgroundId}_${i}/600/400"
         alt="${camp.name} 第 ${i + 1} 張圖"
         class="galleryImg${i === 0 ? ' galleryImgHero' : ''}"
         loading="lazy">
  `
    )
    .join('');
  $('#campGallery').html(galleryHTML);

  // 渲染介紹文字與設施 / Render description and facilities
  const allFacHTML = camp.facilityTags
    .map((t) => `<span class="bookingTag bookingTagFacility">${t}</span>`)
    .join('');
  $('#campDescription').html(`
    <h3 class="campDescriptionTitle">營區介紹</h3>
    <p>${camp.description}</p>
    <div class="campDescriptionTags">${allFacHTML}</div>
  `);

  // 渲染營位選擇器 / Render zone selector
  renderZoneSelector(camp.zones);

  // 渲染資訊表格 / Render info table
  renderZoneTable(camp.zones);
}

/**
 * 渲染左側可選營位清單
 * Render zone selection cards
 *
 * @param {Array} zones - 該營區的 zones 陣列
 */
function renderZoneSelector(zones) {
  const $list = $('#zoneList').empty();

  zones.forEach(function (zone) {
    // 營位卡片輸出共通語意 class 與 Booking 變體 class；樣式由 *Booking selector 接手，保留基底 class 供未來共用。
    const html = `
      <div class="zoneCard zoneCardBooking" data-zone-id="${zone.zoneId}">
        <div class="zoneCardInfo zoneCardInfoBooking">
          <strong>${zone.type}</strong>
          <span>最多 ${zone.capacityPerSite} 人</span>
        </div>
        <div class="zoneCardPrice zoneCardPriceBooking">
          平日 NT$${zone.priceWeekday.toLocaleString()} ／ 假日 NT$${zone.priceHoliday.toLocaleString()}
        </div>
        <div class="zoneCardStock zoneCardStockBooking" data-zone-stock>
          <i class="bi bi-tent"></i> 剩餘 <strong data-remaining>${zone.totalSites}</strong> 個營位
        </div>
        <button class="btn btnOutline zoneSelectButton zoneSelectButtonBooking" data-zone-select>
          <i class="bi bi-check-circle"></i> 選擇此類型
        </button>
      </div>
    `;
    $list.append(html);
  });

  // 綁定營位選擇事件：使用 zoneSelectButtonBooking 作為互動 hook，對齊 booking 語意命名。
  $list.on('click', '.zoneSelectButtonBooking', function () {
    if ($(this).prop('disabled')) return;
    const $card = $(this).closest('.zoneCardBooking');

    // 移除其他卡片的選中狀態 / Remove selected state from others
    $('.zoneCardBooking').removeClass('isSelected');
    $('.zoneSelectButtonBooking').html('<i class="bi bi-check-circle"></i> 選擇此類型');

    // 選中當前卡片 / Select current card
    $card.addClass('isSelected');
    $(this).html('<i class="bi bi-check-circle-fill"></i> ✓ 已選擇');
    selectedZoneId = $card.data('zone-id');
    updateGuestCapacityLimit();

    // 若日期已選擇，立即更新費用 / If dates already selected, update price
    if (weekdayCount + holidayCount > 0) {
      updatePriceSummary();
    }
  });
}

/**
 * 渲染下方的詳細資訊表格
 * Render zone info table at the bottom of page
 *
 * @param {Array} zones - zones 陣列
 */
function renderZoneTable(zones) {
  const $tbody = $('#zoneTableBody').empty();
  zones.forEach(function (zone) {
    $tbody.append(`
      <tr>
        <td><strong>${zone.type}</strong></td>
        <td>${zone.capacityPerSite} 人</td>
        <td>NT$${zone.priceWeekday.toLocaleString()}</td>
        <td>NT$${zone.priceHoliday.toLocaleString()}</td>
        <td>${zone.totalSites} 個</td>
      </tr>
    `);
  });
}

// ============================================================
// Flatpickr 日期選擇器
// ============================================================

/**
 * 初始化 Flatpickr 日期範圍選擇器
 * Initialize Flatpickr date range picker
 */
function initDatePicker() {
  const pickerOptions = {
    mode: 'range',
    locale: 'zh_tw',
    minDate: bookingWindow.minDate || 'today',
    maxDate: bookingWindow.maxDate || undefined,
    dateFormat: 'Y-m-d',
    showMonths: 1,
    onChange: function (selectedDates) {
      if (selectedDates.length === 2) {
        checkInDate = selectedDates[0];
        checkOutDate = selectedDates[1];
        calculateDays(checkInDate, checkOutDate);
        updateZoneAvailability();
        if (selectedZoneId) {
          updatePriceSummary();
        }
      }
    },
  };

  flatpickr('#dateRange', pickerOptions);
}

/**
 * 依所選日期更新各 zone 剩餘營位與按鈕狀態
 * Update zone remaining counts based on selected date range
 */
function updateZoneAvailability() {
  const AV = window.BookingAvailability;
  if (!AV || !availabilityCtx || !checkInDate || !checkOutDate) return;

  const checkIn = formatDateISO(checkInDate);
  const checkOut = formatDateISO(checkOutDate);

  $('.zoneCardBooking').each(function () {
    const $card = $(this);
    const zoneId = $card.data('zone-id');
    const checkIn = formatDateISO(checkInDate);
    const checkOut = formatDateISO(checkOutDate);
    const minRemaining = AV.getMinRemainingInRange(zoneId, checkIn, checkOut, availabilityCtx);
    const zone = currentCamp.zones.find((z) => z.zoneId === zoneId);
    const capacity = zone ? zone.totalSites : 0;

    // 區分「公休」與「已滿」/ Distinguish closed vs fully booked
    const isClosed = AV.hasClosedNightInRange(
      currentCamp.campgroundId,
      checkIn,
      checkOut,
      availabilityCtx
    );
    const closureReason = isClosed
      ? AV.getClosureReason(currentCamp.campgroundId, checkIn, availabilityCtx.closures)
      : '';

    $card.find('[data-remaining]').text(minRemaining);

    const $btn = $card.find('[data-zone-select]');
    if (minRemaining <= 0) {
      $card.addClass('isFull');
      if (isClosed) {
        $card.addClass('isClosed');
        $btn.prop('disabled', true);
        $btn.html('<i class="bi bi-calendar-x"></i> 公休');
        $card.find('[data-zone-stock]').html(
          '<i class="bi bi-calendar-x"></i> ' + (closureReason || '此區間含公休日')
        );
      } else {
        $card.removeClass('isClosed');
        $btn.prop('disabled', true);
        $btn.html('<i class="bi bi-x-circle"></i> 已滿');
        $card.find('[data-zone-stock]').html(
          '<i class="bi bi-tent"></i> 剩餘 <strong data-remaining>0</strong> 個營位'
        );
      }
      if (selectedZoneId === zoneId) {
        selectedZoneId = null;
        $card.removeClass('isSelected');
        $('#confirmBookingBtn').prop('disabled', true);
        $('#priceSummary').removeClass('isVisible');
      }
    } else {
      $card.removeClass('isFull isClosed');
      $btn.prop('disabled', false);
      if (!$card.hasClass('isSelected')) {
        $btn.html('<i class="bi bi-check-circle"></i> 選擇此類型');
      }
      $card.find('[data-zone-stock]').html(
        '<i class="bi bi-tent"></i> 剩餘 <strong data-remaining>' + minRemaining + '</strong> 個營位'
      );
    }

    $card.find('[data-zone-stock]').attr(
      'title',
      isClosed
        ? (closureReason || '此區間含公休日，無法預約')
        : ('此區間每晚最少剩餘 ' + minRemaining + ' 帳（總容量 ' + capacity + '）')
    );
  });
}

function applyInitialBookingParams() {
  const guests = parseInt(initialBookingParams?.guests);
  if (guests > 0) $('#guestNum').val(guests);

  const start = parseBookingDate(initialBookingParams?.checkIn);
  const end = parseBookingDate(initialBookingParams?.checkOut);
  const picker = document.querySelector('#dateRange')?._flatpickr;

  if (!picker || !start || !end || start >= end) return;

  picker.setDate([start, end], true);
}

// ============================================================
// 平日 / 假日計算
// ============================================================

/**
 * 計算日期區間內的平日與假日夜晚數
 *
 * 計算規則：
 *   入住日（含）到退房日（不含），逐天計算。
 *   週五（dayOfWeek=5）與週六（dayOfWeek=6）算「假日」
 *   其餘（週日~週四）算「平日」
 *
 * Calculate weekday and holiday nights in a date range.
 * Rule: Friday(5) & Saturday(6) = holiday; others = weekday.
 * Counts from check-in (inclusive) to check-out (exclusive).
 *
 * @param {Date} start - 入住日期 / Check-in date
 * @param {Date} end   - 退房日期 / Check-out date
 */
function calculateDays(start, end) {
  weekdayCount = 0;
  holidayCount = 0;

  // 複製一份，避免修改原始 Date 物件 / Clone to avoid mutating original
  const cursor = new Date(start);

  // 逐天遍歷到退房日（不含退房日當天，因為退房日不住）
  // Iterate day by day up to (not including) check-out
  while (cursor < end) {
    const dow = cursor.getDay(); // 0=週日, 1=一, ..., 5=五, 6=六

    if (dow === 5 || dow === 6) {
      // 週五 or 週六 → 假日 / Friday or Saturday = holiday
      holidayCount++;
    } else {
      // 其他 → 平日 / Other days = weekday
      weekdayCount++;
    }

    cursor.setDate(cursor.getDate() + 1); // 前進一天 / Advance by 1 day
  }

  const total = weekdayCount + holidayCount;

  // 更新 UI 顯示 / Update UI
  $('#totalDays').text(total);
  $('#weekdayLabel').text(`平日 ${weekdayCount} 晚`);
  $('#holidayLabel').text(`假日 ${holidayCount} 晚`);
  $('#dateSummary').addClass('isVisible');
}

// ============================================================
// 費用小計計算
// ============================================================

/**
 * 根據選擇的營位類型與日期，計算並顯示費用小計
 * Calculate and display price subtotal based on zone + dates
 */
function updatePriceSummary() {
  if (!selectedZoneId) return;
  if (weekdayCount + holidayCount <= 0) return;

  const zone = currentCamp.zones.find((z) => z.zoneId === selectedZoneId);
  if (!zone) return;

  const AV = window.BookingAvailability;
  if (AV && availabilityCtx && checkInDate && checkOutDate) {
    const minRemaining = AV.getMinRemainingInRange(
      selectedZoneId,
      formatDateISO(checkInDate),
      formatDateISO(checkOutDate),
      availabilityCtx
    );
    if (minRemaining < 1) {
      const isClosed = AV.hasClosedNightInRange(
        currentCamp.campgroundId,
        formatDateISO(checkInDate),
        formatDateISO(checkOutDate),
        availabilityCtx
      );
      showToast(
        isClosed ? '所選日期含公休日，請更換日期。' : '所選日期該營位類型已滿，請更換日期或類型。',
        'warning'
      );
      $('#confirmBookingBtn').prop('disabled', true);
      return;
    }
  }

  const subtotal = zone.priceWeekday * weekdayCount + zone.priceHoliday * holidayCount;

  $('#zonePriceTotal').text(`NT$${subtotal.toLocaleString()}`);
  $('#priceSummary').addClass('isVisible');

  // 啟用「下一步」按鈕 / Enable "next step" button
  $('#confirmBookingBtn').prop('disabled', false);
}

function updateGuestCapacityLimit() {
  const zone = currentCamp.zones.find((z) => z.zone_id === selectedZoneId);
  if (!zone) return;

  $('#guestNum').attr('max', zone.capacity_per_site);
}

// ============================================================
// 儲存至 LocalStorage 並前往下一頁
// ============================================================

/**
 * 驗證選擇是否完整，將資料寫入 LocalStorage，然後跳轉至 camp-rental.html
 * Validate selections, write to LocalStorage, redirect to rental page
 */
function saveToLocalStorageAndNext() {
  // 驗證：日期是否已選 / Validate: dates selected?
  if (!checkInDate || !checkOutDate) {
    showToast('請先選擇入住和退房日期。', 'warning');
    return;
  }

  // 驗證：營位是否已選 / Validate: zone selected?
  if (!selectedZoneId) {
    showToast('請選擇一種營位類型。', 'warning');
    return;
  }

  const zone = currentCamp.zones.find((z) => z.zoneId === selectedZoneId);
  if (!zone) return;

  const checkIn = formatDateISO(checkInDate);
  const checkOut = formatDateISO(checkOutDate);

  window.BookingAPI.getMinRemainingForStay(selectedZoneId, checkIn, checkOut)
    .then(function (minRemaining) {
      if (minRemaining < 1) {
        const AV = window.BookingAvailability;
        const isClosed = AV && availabilityCtx && AV.hasClosedNightInRange(
          currentCamp.campgroundId,
          checkIn,
          checkOut,
          availabilityCtx
        );
        showToast(
          isClosed ? '所選日期含公休日，無法預約。' : '所選日期該營位類型已滿，請更換日期或類型。',
          'error'
        );
        return;
      }
      proceedSaveBooking(zone, checkIn, checkOut);
    })
    .catch(function () {
      proceedSaveBooking(zone, checkIn, checkOut);
    });
}

function proceedSaveBooking(zone, checkIn, checkOut) {
  const subtotal = zone.priceWeekday * weekdayCount + zone.priceHoliday * holidayCount;
  const totalDays = weekdayCount + holidayCount;
  const guestCount = parseInt($('#guestNum').val()) || 2;
  const maxGuests = Number(zone.capacity_per_site || 0);

  if (guestCount < 1) {
    showToast('請填寫正確的人數。', 'warning');
    return;
  }

  if (maxGuests > 0 && guestCount > maxGuests) {
    showToast(`此營位最多容納 ${maxGuests} 人，請調整人數或選擇其他營位。`, 'warning');
    return;
  }

  // 建立 bookingCart（camelCase，與 camp-bookings / createBooking 一致）
  // Build bookingCart in camelCase (aligned with camp-bookings schema)
  const bookingCart = {
    bookingInfo: {
      campgroundId: currentCamp.campgroundId,
      campgroundName: currentCamp.name,
      region: currentCamp.region,
      checkIn: checkIn,
      checkOut: checkOut,
      totalDays: totalDays,
      weekdayCount: weekdayCount,
      holidayCount: holidayCount,
      guestCount: guestCount,
    },
    selectedZones: [
      {
        zoneId: zone.zoneId,
        zoneType: zone.type,
        quantity: 1,
        subtotal: subtotal,
      },
    ],
    selectedRentals: [], // 下一頁（camp-rental）填入 / Filled by next page
    summary: {
      zoneTotal: subtotal,
      rentalTotal: 0,
      appliedDiscount: 0,
      finalAmount: subtotal,
    },
  };

  // 寫入 LocalStorage（優先用共用 writeBookingCart）
  if (typeof window.writeBookingCart === 'function') {
    window.writeBookingCart(bookingCart);
  } else {
    localStorage.setItem('bookingCart', JSON.stringify(bookingCart));
  }

  console.log('[camp-detail] 已寫入 LocalStorage bookingCart:', bookingCart);

  // 前往裝備租借頁 / Redirect to rental page
  window.location.href = './camp-rental.html';
}

// ============================================================
// 工具函式 / Utility Functions
// ============================================================

/**
 * 將 Date 物件格式化為 'YYYY-MM-DD' 字串（避免與 window.formatDate 衝突）
 * Format Date object to 'YYYY-MM-DD' string
 *
 * @param {Date} date - 要格式化的日期
 * @returns {string} 'YYYY-MM-DD'
 */
function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseBookingDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
