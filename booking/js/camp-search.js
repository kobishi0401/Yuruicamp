/**
 * camp-search.js
 * 功能：搜尋頁邏輯
 * ① 讀取 campgrounds.json（jQuery AJAX）
 * ② 動態渲染營區卡片
 * ③ Checkbox + 下拉選單即時篩選（AND 邏輯）
 *
 * Handles: data loading, card rendering, real-time filtering
 */

// ============================================================
// 全域狀態 / Global State
// ============================================================

/** 原始營區資料快取，保留一份完整陣列供篩選時使用 */
let allCampgrounds = [];

/** 由 initPriceRangeSlider 填入，供重設按鈕呼叫 */
let updatePriceSlider = function () {};

/** 可預約窗口與可用性上下文 / Booking window and availability context */
let searchBookingWindow = { minDate: null, maxDate: null };
let searchAvailabilityCtx = null;
let searchDateRange = { checkIn: null, checkOut: null };

// ============================================================
// 頁面初始化 / Page Initialization
// ============================================================
$(document).ready(function () {
  // 步驟 1：載入營區資料 / Step 1: Load campground data
  loadCampgrounds();

  // 步驟 2：綁定篩選器事件 / Step 2: Bind filter events
  bindFilterEvents();

  // Flatpickr 在 loadCampgrounds 取得 bookingWindow 後初始化

  // 步驟 4：行動版篩選器展開/收合 / Step 4: Mobile filter toggle
  $('#filterToggle').on('click', function () {
    const $body = $('#filterBody');
    const isOpen = $body.hasClass('isOpen');
    $body.toggleClass('isOpen', !isOpen);
    $(this).attr('aria-expanded', !isOpen);
  });
});

// ============================================================
// 步驟 1：載入資料
// ============================================================

/**
 * 從 JSON 檔案載入所有營區資料
 * Load all campground data from JSON file
 */
function loadCampgrounds() {
  // 透過 BookingAPI 讀取營區 catalog（路徑由 data-paths.js 統一管理）
  // Load campground catalog via BookingAPI (paths from data-paths.js)
  if (!window.BookingAPI) {
    console.error('[camp-search] BookingAPI 未載入 / BookingAPI not loaded');
    return;
  }

  window.BookingAPI.getCampgrounds()
    .then(function (data) {
      allCampgrounds = data;
      return Promise.all([
        window.BookingAPI.getBookingWindow(),
        window.BookingAPI.loadAvailabilityContext(),
      ]);
    })
    .then(function (results) {
      searchBookingWindow = results[0] || searchBookingWindow;
      searchAvailabilityCtx = results[1];
      initFlatpickrDateRange();
      renderCampCards(allCampgrounds);
    })
    .catch(function (err) {
      console.error('[camp-search] 資料載入失敗 / Failed:', err);
      $('#loadingSkeleton').hide();
      $('#campCardGrid').html(`
      <div class="errorMsg">
        <i class="bi bi-exclamation-triangle"></i>
        資料載入失敗，請重新整理頁面。
      </div>
    `);
    });
}

// ============================================================
// 步驟 2：渲染卡片
// ============================================================

/**
 * 將營區資料陣列渲染成 HTML 卡片並插入 DOM
 * Render campground data array as HTML cards
 *
 * @param {Array} camps - 要顯示的營區資料陣列
 */
function renderCampCards(camps) {
  const $grid = $('#campCardGrid');
  const searchParams = buildSearchParams();

  // 隱藏 loading 骨架屏 / Hide loading skeleton
  $('#loadingSkeleton').hide();
  $grid.empty();

  // 沒有結果時顯示提示 / Show empty state if no results
  if (camps.length === 0) {
    $grid.html(`
      <div class="noResult">
        <i class="bi bi-search"></i>
        沒有符合條件的營區，請嘗試調整篩選條件。
      </div>
    `);
    $('#resultCount').text('共 0 個營區');
    return;
  }

  // 渲染每一個營區卡片 / Render each camp card
  camps.forEach(function (camp) {
    // 計算最低平日價（所有 zone 中取最小值）/ Min weekday price across all zones
    const minWeekdayPrice = Math.min(...camp.zones.map((z) => z.priceWeekday));
    // 計算最高假日價（所有 zone 中取最大值）/ Max holiday price
    const maxHolidayPrice = Math.max(...camp.zones.map((z) => z.priceHoliday));

    // 環境標籤 HTML / Environment tags HTML
    const envTagsHTML = camp.environmentTags
      .map((t) => `<span class="bookingTag bookingTagEnv">${t}</span>`)
      .join('');

    // 設施標籤 HTML（最多顯示 3 個）/ Facility tags HTML (max 3)
    const facTagsHTML = camp.facilityTags
      .slice(0, 3)
      .map((t) => `<span class="bookingTag bookingTagFacility">${t}</span>`)
      .join('');

    const detailParams = new URLSearchParams(searchParams);
    detailParams.set('id', camp.campground_id);

    // 建立營區卡片 HTML：輸出 campCard 共通語意與 campCardBooking 預約流程變體。
    const statusBadge = (function () {
      if (!searchDateRange.checkIn || !searchDateRange.checkOut) return '';
      const status = getCampRangeStatus(camp);
      if (status.closed) {
        return '<span class="campCardBadge campCardBadgeBooking campCardBadgeClosed">公休</span>';
      }
      if (!status.available) {
        return '<span class="campCardBadge campCardBadgeBooking campCardBadgeFull">該日期已滿</span>';
      }
      return '';
    })();

    // Camp images: use data.images if present, else 3 picsum placeholders / 有資料用資料，否則用 3 張佔位圖
    const campImages =
      Array.isArray(camp.images) && camp.images.length > 0
        ? camp.images
        : [0, 1, 2].map((i) => `https://picsum.photos/seed/${camp.campgroundId}_${i}/400/250`);

    const badgeHtml = `
      <span class="campCardBadge campCardBadgeBooking">${camp.region}</span>
      ${statusBadge}
    `;

    const imageHtml = window.buildCardGalleryHtml
      ? window.buildCardGalleryHtml({
          images: campImages,
          alt: camp.name,
          galleryId: `camp-${camp.campgroundId}`,
          wrapClass: 'campCardImage campCardImageBooking',
          badgeHtml,
        })
      : `<div class="campCardImage campCardImageBooking">
          <img src="${campImages[0]}" alt="${camp.name}" loading="lazy">
          ${badgeHtml}
        </div>`;

    const cardHTML = `
      <div class="campCard campCardBooking${camp._dateClosed ? ' isDateClosed' : ''}${camp._dateFull ? ' isDateFull' : ''}"
           data-id="${camp.campgroundId}"
           data-region="${camp.region}"
           data-env="${camp.environmentTags.join(',')}"
           data-facility="${camp.facilityTags.join(',')}">

        ${imageHtml}

        <div class="campCardBody campCardBodyBooking">
          <h3 class="campCardName campCardNameBooking">${camp.name}</h3>
          <p class="campCardPrice campCardPriceBooking">
            平日 <strong>NT$${minWeekdayPrice.toLocaleString()}</strong>
            ／ 假日 <strong>NT$${maxHolidayPrice.toLocaleString()}</strong> 起
          </p>
          <div class="campCardTags campCardTagsBooking">${envTagsHTML}${facTagsHTML}</div>
        </div>

        <div class="campCardFooter campCardFooterBooking">
          <a href="./camp-detail.html?id=${camp.campgroundId}" class="btn btnPrimary">
            查看詳情 <i class="bi bi-arrow-right"></i>
          </a>
        </div>

      </div>
    `;

    $grid.append(cardHTML);
  });

  // Init Swiper + GLightbox after all cards are in the DOM / 全部卡片插入後再初始化
  window.initCardGalleries?.($grid[0] || document);

  // 更新結果數量 / Update result count
  $('#resultCount').text(`共 ${camps.length} 個營區`);
}

// ============================================================
// 步驟 3：篩選邏輯
// ============================================================

/**
 * 綁定所有篩選器的 change 事件
 * Bind change events for all filter controls
 */
function bindFilterEvents() {
  // Checkbox 變更時觸發篩選 / Trigger filter on checkbox change
  $(document).on('change', 'input[name="env"], input[name="facility"]', filterCampgrounds);

  // 地區下拉選單變更時觸發 / Trigger on region dropdown change
  $('#regionFilter').on('change', filterCampgrounds);

  // 首屏搜尋列條件變更時同步篩選。
  $('#guestCount').on('change', filterCampgrounds);
  $('#searchBtn').on('click', filterCampgrounds);

  // 雙滑塊價格篩選器 / Dual-thumb price slider
  initPriceRangeSlider();

  // 重設按鈕 / Reset button
  $('#resetFilterBtn').on('click', function () {
    $('input[name="env"]').prop('checked', false);
    $('input[name="facility"]').prop('checked', false);
    $('#regionFilter').val('');
    $('#guestCount').val('');
    $('#priceMin').val(500);
    $('#priceMax').val(5000);

    // 如果有選取日期，也可以一併清空
    const datePicker = document.querySelector('#dateRange')._flatpickr;
    if (datePicker) datePicker.clear();
    searchDateRange = { checkIn: null, checkOut: null };

    updatePriceSlider();
    filterCampgrounds();
  });
}

/**
 * 初始化 Flatpickr 日期區間選擇器
 * Initialize Flatpickr range datepicker
 */
function initFlatpickrDateRange() {
  const el = document.querySelector('#dateRange');
  if (!el) return;
  if (el._flatpickr) {
    el._flatpickr.destroy();
  }

  flatpickr('#dateRange', {
    mode: 'range',
    minDate: searchBookingWindow.minDate || 'today',
    maxDate: searchBookingWindow.maxDate || undefined,
    locale: 'zh_tw',
    dateFormat: 'Y-m-d',
    onChange: function (selectedDates) {
      if (selectedDates.length === 2) {
        const AV = window.BookingAvailability;
        searchDateRange = {
          checkIn: AV ? AV.formatISODate(selectedDates[0]) : null,
          checkOut: AV ? AV.formatISODate(selectedDates[1]) : null,
        };
      } else if (selectedDates.length === 0) {
        searchDateRange = { checkIn: null, checkOut: null };
      }
      filterCampgrounds();
    },
  });
}

/**
 * 檢查營區在所選日期區間的狀態（可訂 / 公休 / 已滿）
 * Check campground availability status for selected date range
 */
function getCampRangeStatus(camp) {
  const AV = window.BookingAvailability;
  if (!AV || !searchAvailabilityCtx) return { available: true };
  if (!searchDateRange.checkIn || !searchDateRange.checkOut) return { available: true };

  if (AV.hasClosedNightInRange(
    camp.campgroundId,
    searchDateRange.checkIn,
    searchDateRange.checkOut,
    searchAvailabilityCtx
  )) {
    const reason = AV.getClosureReason(
      camp.campgroundId,
      searchDateRange.checkIn,
      searchAvailabilityCtx.closures
    );
    return { available: false, closed: true, reason: reason || '公休' };
  }

  const hasSlot = (camp.zones || []).some(function (zone) {
    return AV.getMinRemainingInRange(
      zone.zoneId,
      searchDateRange.checkIn,
      searchDateRange.checkOut,
      searchAvailabilityCtx
    ) > 0;
  });

  return { available: hasSlot, closed: false };
}

/**
 * 檢查營區在所選日期區間是否至少有一個 zone 可訂
 * Check if campground has any available zone for the date range
 */
function isCampAvailableForRange(camp) {
  return getCampRangeStatus(camp).available;
}

/**
 * 核心篩選函式：讀取所有勾選條件，過濾 allCampgrounds
 * Core filter function: read all checked conditions, filter allCampgrounds
 *
 * 篩選規則（AND 邏輯）：
 * - 勾選的「環境標籤」：每一項都必須存在於 camp.environment_tags
 * - 勾選的「設施標籤」：每一項都必須存在於 camp.facility_tags
 * - 選擇的「地區」：必須完全匹配 camp.region
 *
 * Filter rule (AND logic):
 * All selected env tags + facility tags + region must ALL match.
 */
function filterCampgrounds() {
  // 取得所有勾選的環境標籤 / Get all checked environment tags
  const checkedEnv = $('input[name="env"]:checked')
    .map(function () {
      return $(this).val();
    })
    .get();

  // 取得所有勾選的設施標籤 / Get all checked facility tags
  const checkedFacility = $('input[name="facility"]:checked')
    .map(function () {
      return $(this).val();
    })
    .get();

  // 取得選擇的地區 / Get selected region
  const selectedRegion = $('#regionFilter').val();
  const selectedGuestCount = parseInt($('#guestCount').val());

  // 過濾陣列 / Filter array
  const filtered = allCampgrounds.filter(function (camp) {
    // 地區篩選：有選才過濾，未選則略過 / Region: filter only if selected
    if (selectedRegion && camp.region !== selectedRegion) return false;

    if (selectedGuestCount) {
      const hasEnoughCapacity = camp.zones.some(
        (zone) => Number(zone.capacity_per_site || 0) >= selectedGuestCount
      );
      if (!hasEnoughCapacity) return false;
    }

    // 環境標籤：每個勾選的標籤都必須存在於 camp.environment_tags
    // Every checked env tag must be in camp.environment_tags
    const envMatch = checkedEnv.every((tag) => camp.environmentTags.includes(tag));
    if (!envMatch) return false;

    // 設施標籤：每個勾選的標籤都必須存在於 camp.facilityTags
    // Every checked facility tag must be in camp.facilityTags
    const facilityMatch = checkedFacility.every((tag) => camp.facilityTags.includes(tag));
    if (!facilityMatch) return false;

    // 價格篩選：各 zone 最低平日價須落在 [minBudget, maxBudget] 區間內
    const minBudget = parseInt($('#priceMin').val());
    const maxBudget = parseInt($('#priceMax').val());
    if (minBudget > 500 || maxBudget < 5000) {
      const minWeekdayPrice = Math.min(...camp.zones.map((z) => z.priceWeekday));
      if (minWeekdayPrice < minBudget || minWeekdayPrice > maxBudget) return false;
    }

    return true;
  }).map(function (camp) {
    const status = getCampRangeStatus(camp);
    return Object.assign({}, camp, {
      _dateFull: !status.available && !status.closed,
      _dateClosed: Boolean(status.closed),
      _closureReason: status.reason || '',
    });
  }).sort(function (a, b) {
    if (a._dateClosed !== b._dateClosed) return a._dateClosed ? 1 : -1;
    if (a._dateFull !== b._dateFull) return a._dateFull ? 1 : -1;
    return 0;
  });

  renderCampCards(filtered);
}

function buildSearchParams() {
  const params = new URLSearchParams();
  const guestCount = $('#guestCount').val();
  const datePicker = document.querySelector('#dateRange')?._flatpickr;

  if (guestCount) params.set('guests', guestCount);

  if (datePicker && datePicker.selectedDates.length === 2) {
    params.set('checkIn', formatSearchDate(datePicker.selectedDates[0]));
    params.set('checkOut', formatSearchDate(datePicker.selectedDates[1]));
  }

  return params;
}

function formatSearchDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ============================================================
// 雙滑塊價格篩選器初始化
// ============================================================

/**
 * 建立 dual-thumb range slider：
 * - #priceMin / #priceMax 兩個 <input type="range"> 疊加
 * - #priceRangeFill 依百分比定位，顯示選取區段
 * - #priceRangeDisplay 即時更新文字
 */
function initPriceRangeSlider() {
  const $minEl = $('#priceMin');
  const $maxEl = $('#priceMax');
  const $label = $('#priceRangeDisplay');
  const TOTAL_MIN = 500;
  const TOTAL_MAX = 5000;

  function update() {
    const minVal = parseInt($minEl.val());
    const maxVal = parseInt($maxEl.val());

    // min thumb 靠近右側時提高層級，避免被 max thumb 擋住。
    $minEl.toggleClass('isRaised', minVal >= TOTAL_MAX - 500);

    // 文字顯示
    const maxLabel = maxVal >= TOTAL_MAX ? 'NT$5,000+' : 'NT$' + maxVal.toLocaleString();
    $label.text('NT$' + minVal.toLocaleString() + ' - ' + maxLabel);

    const minPercent = ((minVal - TOTAL_MIN) / (TOTAL_MAX - TOTAL_MIN)) * 100;
    const maxPercent = ((maxVal - TOTAL_MIN) / (TOTAL_MAX - TOTAL_MIN)) * 100;
    $('#priceRangeFill').css({
      left: minPercent + '%',
      right: 100 - maxPercent + '%',
    });
  }

  // 暴露給重設按鈕使用
  updatePriceSlider = update;

  $minEl.on('input', function () {
    if (parseInt($minEl.val()) >= parseInt($maxEl.val())) {
      $minEl.val(parseInt($maxEl.val()) - TOTAL_MIN); // 至少保留一格距離
    }
    update();
    filterCampgrounds();
  });

  $maxEl.on('input', function () {
    if (parseInt($maxEl.val()) <= parseInt($minEl.val())) {
      $maxEl.val(parseInt($minEl.val()) + TOTAL_MIN);
    }
    update();
    filterCampgrounds();
  });

  update(); // 初始渲染
}
