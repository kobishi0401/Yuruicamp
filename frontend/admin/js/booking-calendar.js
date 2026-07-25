/**
 * admin/js/booking-calendar.js
 * 預約排程面板 — Zone 可用性月曆、全部加總、公休設定（含每週固定）
 */

var BC_ALL_ZONES = '__ALL__';

/** 營位表單：null＝新增模式；有 zoneId＝編輯模式 / Zone form: null=create, zoneId=edit */
var bcZoneEditState = { campgroundId: null, zoneId: null };

var bcState = {
  campgrounds: [],
  ctx: null,
  closures: [],
  window: { minDate: null, maxDate: null },
  campgroundId: null,
  zoneId: BC_ALL_ZONES,
  viewYear: null,
  viewMonth: null,
  selectedDate: null,
  customersById: {},
  closureRangePicker: null,
  closureEffectivePicker: null,
  /** W4-03：月曆上已標記的特殊節日 dateISO → row */
  calendarHolidayMap: {},
  calModalYear: null,
  calModalMonth: null,
};

var BC_STATUS_LABEL = {
  available: '充足',
  low: '少量',
  full: '滿位',
  closed: '公休',
  out_of_window: '不可預約',
};

var BC_WEEKDAY_LABEL = ['日', '一', '二', '三', '四', '五', '六'];

var BC_BOOKING_STATUS_LABEL = {
  pending: '待確認',
  confirmed: '已確認',
  completed: '已完成',
  cancelled: '已取消',
};

/** 判斷公休管理是否使用正式 Admin API。 */
function isClosureBackendMode() {
  return !!(window.AdminAPI && AdminAPI.isBackendEnabled && AdminAPI.isBackendEnabled());
}

/** 將後端公休回應轉成既有月曆使用的 ViewModel。 */
function mapAdminClosureResponse(closure) {
  if (!closure) return closure;

  return {
    id: closure.id,
    campgroundId: closure.campgroundId,
    campgroundName: closure.campgroundName,
    type: closure.closureType || closure.type,
    startDate: closure.startDate,
    endDate: closure.endDate,
    dayOfWeek: closure.weekday == null ? closure.dayOfWeek : closure.weekday,
    effectiveFrom: closure.effectiveFrom,
    effectiveTo: closure.effectiveTo,
    reason: closure.reason,
    createdBy: closure.createdBy,
    createdByName: closure.createdByName,
    createdAt: closure.createdAt,
  };
}

/** 建立後端只接受的公休 Request，不傳 Mock overlay 欄位。 */
function buildAdminClosureRequest(closure) {
  return {
    campgroundId: closure.campgroundId,
    closureType: closure.type,
    startDate: closure.type === 'date_range' ? closure.startDate : null,
    endDate: closure.type === 'date_range' ? closure.endDate : null,
    weekday: closure.type === 'weekly' ? closure.dayOfWeek : null,
    effectiveFrom: closure.type === 'weekly' ? closure.effectiveFrom : null,
    effectiveTo: closure.type === 'weekly' ? closure.effectiveTo : null,
    reason: closure.reason,
  };
}

/** 正式模式重新讀取資料庫，避免前端自行猜測寫入結果。 */
function loadAdminClosures() {
  return AdminAPI.closures.list({ page: 0, size: 100, sort: 'createdAt,desc' })
    .then(function (response) {
      return (response.data || []).map(mapAdminClosureResponse);
    });
}

window.initBookingCalendar = function () {
  $(document).off('.bookingCalendar');
  bcState.selectedDate = null;
  $('#bcDayDetail').addClass('d-none');

  loadBookingCalendarData();
  initClosureModalPickers();

  $(document).on('change.bookingCalendar', '#bcCampgroundSelect', function () {
    bcState.campgroundId = $(this).val();
    populateZoneSelect();
    renderClosureTable();
    renderCalendar();
  });

  $(document).on('change.bookingCalendar', '#bcZoneSelect', function () {
    bcState.zoneId = $(this).val();
    renderCalendar();
  });

  $(document).on('click.bookingCalendar', '#bcPrevMonth', function () { shiftMonth(-1); });
  $(document).on('click.bookingCalendar', '#bcNextMonth', function () { shiftMonth(1); });

  $(document).on('click.bookingCalendar', '.bc-day-cell.isInteractive', function () {
    var dateISO = $(this).data('date');
    if (!dateISO) return;
    bcState.selectedDate = dateISO;
    $('.bc-day-cell').removeClass('isSelected');
    $(this).addClass('isSelected');
    renderDayDetail(dateISO);
  });

  $(document).on('click.bookingCalendar', '.bc-view-booking', function (e) {
    e.preventDefault();
    openBookingDetail(Number($(this).data('booking-id')));
  });

  $(document).on('click.bookingCalendar', '#bcBtnClosureSettings', openClosureModal);
  $(document).on('click.bookingCalendar', '#bcBtnSaveClosure', saveClosureFromModal);
  $(document).on('click.bookingCalendar', '#bcBtnCloseSingleDay', closeSingleSelectedDay);
  $(document).on('click.bookingCalendar', '.bc-btn-delete-closure', function (e) {
    e.preventDefault();
    deleteClosure($(this).data('closure-id'));
  });

  // W4-01／02：營區／營位主檔 Modal
  syncCampgroundMasterButton();
  syncCalendarDatesButton();
  $(document).on('click.bookingCalendar', '#bcBtnCampgrounds', openCampgroundMasterModal);
  $(document).on('click.bookingCalendar', '#bcMasterTabs [data-bc-master-kind]', function () {
    switchBcMasterTab($(this).data('bc-master-kind'));
  });
  $(document).on('submit.bookingCalendar', '#bcCampgroundCreateForm', function (event) {
    event.preventDefault();
    submitCampgroundCreate();
  });
  $(document).on('click.bookingCalendar', '.bc-btn-campground-toggle', function () {
    toggleCampgroundActive($(this).data('id'), $(this).data('active') === true || $(this).data('active') === 'true');
  });
  $(document).on('click.bookingCalendar', '.bc-btn-campground-delete', function () {
    deleteCampgroundMaster($(this).data('id'));
  });
  $(document).on('change.bookingCalendar', '#bcZoneCampgroundSelect', function () {
    resetZoneFormToCreate();
    refreshZoneMasterList();
  });
  $(document).on('submit.bookingCalendar', '#bcZoneCreateForm', function (event) {
    event.preventDefault();
    submitZoneForm();
  });
  $(document).on('click.bookingCalendar', '#bcZoneCancelEditBtn', function () {
    resetZoneFormToCreate();
  });
  $(document).on('click.bookingCalendar', '.bc-btn-zone-edit', function () {
    beginZoneEdit($(this).data('campground-id'), {
      id: $(this).data('id'),
      type: $(this).data('type'),
      capacityPerSite: $(this).data('capacity'),
      priceWeekday: $(this).data('priceWeekday'),
      priceHoliday: $(this).data('priceHoliday'),
      totalSites: $(this).data('totalSites'),
    });
  });
  $(document).on('click.bookingCalendar', '.bc-btn-zone-toggle', function () {
    toggleZoneActive($(this).data('campground-id'), $(this).data('id'),
      $(this).data('active') === true || $(this).data('active') === 'true');
  });
  $(document).on('click.bookingCalendar', '.bc-btn-zone-delete', function () {
    deleteZoneMaster($(this).data('campground-id'), $(this).data('id'));
  });

  // W4-03：特殊節日曆 Modal
  $(document).on('click.bookingCalendar', '#bcBtnCalendarDates', openCalendarDatesModal);
  $(document).on('click.bookingCalendar', '#bcCalPrevMonth', function () { shiftCalendarModalMonth(-1); });
  $(document).on('click.bookingCalendar', '#bcCalNextMonth', function () { shiftCalendarModalMonth(1); });
  $(document).on('change.bookingCalendar', '.bc-cal-holiday-cb', function () {
    persistCalendarHolidayToggle($(this).data('date'), $(this).prop('checked'));
  });
  $(document).on('click.bookingCalendar', '.bc-btn-cal-save-name', function () {
    saveCalendarHolidayName($(this).data('date'));
  });
  $(document).on('keydown.bookingCalendar', '.bc-cal-holiday-name', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveCalendarHolidayName($(this).data('date'));
    }
  });

  $(document).on('change.bookingCalendar', 'input[name="bcClosureType"]', toggleClosureTypeFields);
  $(document).on('change.bookingCalendar', '.bc-weekday-cb', syncWeekdayBtnStyles);
};

/** W4-01：營區主檔 feature 是否就緒 */
function isCampgroundMasterReady() {
  return isClosureBackendMode()
    && typeof AdminRuntime !== 'undefined'
    && AdminRuntime.isFeatureReady
    && AdminRuntime.isFeatureReady('booking-calendar.campgrounds')
    && AdminAPI.campgrounds;
}

/** W4-02：營位主檔 feature 是否就緒 */
function isZoneMasterReady() {
  return isCampgroundMasterReady()
    && AdminRuntime.isFeatureReady('booking-calendar.zones')
    && AdminAPI.campgrounds.listZones;
}

/** 依 readiness 顯示「營區／營位」按鈕 */
function syncCampgroundMasterButton() {
  $('#bcBtnCampgrounds').toggleClass('d-none', !isCampgroundMasterReady());
  $('#bcMasterTabZonesWrap').toggleClass('d-none', !isZoneMasterReady());
}

/** W4-03：特殊節日曆 feature 是否就緒 */
function isCalendarDatesReady() {
  return isClosureBackendMode()
    && typeof AdminRuntime !== 'undefined'
    && AdminRuntime.isFeatureReady
    && AdminRuntime.isFeatureReady('booking-calendar.calendarDates')
    && AdminAPI.calendarDates
    && AdminAPI.calendarDates.listRange;
}

/** 依 readiness 顯示「特殊節日曆」按鈕 */
function syncCalendarDatesButton() {
  $('#bcBtnCalendarDates').toggleClass('d-none', !isCalendarDatesReady());
}

/** 開啟 Modal；預設營區 tab */
function openCampgroundMasterModal(kind) {
  if (!isCampgroundMasterReady()) {
    window.showAdminToast('營區主檔尚未就緒', 'info');
    return;
  }
  var modalEl = document.getElementById('bcCampgroundModal');
  if (modalEl && typeof bootstrap !== 'undefined') {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
  $('#bcCampgroundId, #bcCampgroundName, #bcCampgroundRegion, #bcCampgroundDescription').val('');
  var preferred = kind === 'zones' && isZoneMasterReady() ? 'zones' : 'campgrounds';
  switchBcMasterTab(preferred);
  window.applyEditPermission('booking-calendar', $('#bcCampgroundModal'));
}

/** 切換營區／營位 tab */
function switchBcMasterTab(kind) {
  var isZones = kind === 'zones' && isZoneMasterReady();
  $('#bcMasterTabCampgrounds')
    .toggleClass('active', !isZones)
    .attr('aria-selected', !isZones ? 'true' : 'false');
  $('#bcMasterTabZones')
    .toggleClass('active', isZones)
    .attr('aria-selected', isZones ? 'true' : 'false');
  $('#bcMasterPanelCampgrounds').toggleClass('d-none', isZones);
  $('#bcMasterPanelZones').toggleClass('d-none', !isZones);
  if (isZones) {
    resetZoneFormToCreate();
    populateZoneCampgroundSelect();
    refreshZoneMasterList();
  } else {
    refreshCampgroundMasterList();
  }
}

/** 重新載入後台營區列表（含停用） */
function refreshCampgroundMasterList() {
  var $list = $('#bcCampgroundList').empty()
    .append('<li class="list-group-item text-muted small">載入中…</li>');
  AdminAPI.campgrounds.list()
    .then(function (response) {
      var rows = (response && response.data) || [];
      $list.empty();
      if (!rows.length) {
        $list.append('<li class="list-group-item text-muted small">尚無營區</li>');
        return;
      }
      rows.forEach(function (row) {
        var statusBadge = row.active
          ? '<span class="badge text-bg-success ms-1">啟用</span>'
          : '<span class="badge text-bg-secondary ms-1">停用</span>';
        var label = row.id + ' — ' + row.name + '（' + (row.region || '') + '）';
        var safeId = $('<div>').text(String(row.id)).html();
        var toggleLabel = row.active ? '停用' : '啟用';
        var toggleClass = row.active ? 'btn-outline-secondary' : 'btn-outline-success';
        $list.append(
          '<li class="list-group-item px-0">'
          + '<div class="d-flex justify-content-between align-items-start gap-2">'
          + '<div class="small">'
          + '<div>' + $('<div>').text(label).html() + statusBadge + '</div>'
          + (row.description
            ? '<div class="text-muted">' + $('<div>').text(row.description).html() + '</div>'
            : '')
          + '</div>'
          + '<div class="btn-group btn-group-sm flex-shrink-0">'
          + '<button type="button" class="btn ' + toggleClass + ' bc-btn-campground-toggle"'
          + ' data-id="' + safeId + '" data-active="' + (row.active ? 'true' : 'false') + '">'
          + toggleLabel + '</button>'
          + '<button type="button" class="btn btn-outline-danger bc-btn-campground-delete"'
          + ' data-id="' + safeId + '">刪除</button>'
          + '</div>'
          + '</div>'
          + '</li>'
        );
      });
      window.applyEditPermission('booking-calendar', $('#bcCampgroundModal'));
    })
    .catch(function (error) {
      AdminAPI.handleError(error, '載入營區失敗');
      $list.empty().append('<li class="list-group-item text-danger small">載入失敗</li>');
    });
}

/** 建立營區後刷新 Modal 列表與月曆下拉 */
function submitCampgroundCreate() {
  var id = ($('#bcCampgroundId').val() || '').trim();
  var name = ($('#bcCampgroundName').val() || '').trim();
  var region = ($('#bcCampgroundRegion').val() || '').trim();
  var description = ($('#bcCampgroundDescription').val() || '').trim();
  if (!id || !name || !region) {
    window.showAdminToast('請填寫 ID、名稱與地區', 'warning');
    return;
  }
  var payload = { id: id, name: name, region: region };
  if (description) {
    payload.description = description;
  }
  $('#bcCampgroundCreateBtn').prop('disabled', true);
  AdminAPI.campgrounds.create(payload)
    .then(function () {
      window.showAdminToast('已建立營區', 'success');
      $('#bcCampgroundId, #bcCampgroundName, #bcCampgroundRegion, #bcCampgroundDescription').val('');
      refreshCampgroundMasterList();
      // 重新讀公開營區列表，讓上方下拉立刻出現新 active 營區
      return window.BookingAPI.getCampgrounds().then(function (camps) {
        bcState.campgrounds = camps || [];
        populateCampgroundSelect();
      });
    })
    .catch(function (error) {
      AdminAPI.handleError(error, '建立營區失敗');
    })
    .then(function () {
      $('#bcCampgroundCreateBtn').prop('disabled', false);
    });
}

/**
 * 啟停營區：PATCH active。
 * @param {string} id
 * @param {boolean} currentlyActive 目前是否啟用（按鈕會切到相反狀態）
 */
function toggleCampgroundActive(id, currentlyActive) {
  if (!id) return;
  var nextActive = !currentlyActive;
  AdminAPI.campgrounds.update(id, { active: nextActive })
    .then(function () {
      window.showAdminToast(nextActive ? '已啟用營區' : '已停用營區', 'success');
      refreshCampgroundMasterList();
      return window.BookingAPI.getCampgrounds().then(function (camps) {
        bcState.campgrounds = camps || [];
        // 若目前選中的營區被停用，下拉會自動落到第一個 active
        if (!nextActive && bcState.campgroundId === id) {
          bcState.campgroundId = null;
        }
        populateCampgroundSelect();
        populateZoneSelect();
        renderClosureTable();
        renderCalendar();
      });
    })
    .catch(function (error) {
      AdminAPI.handleError(error, '更新營區失敗');
    });
}

/** 硬刪未引用營區；有引用時後端 409，改引導停用 */
function deleteCampgroundMaster(id) {
  if (!id) return;
  if (!window.confirm('確定刪除營區 ' + id + '？有引用時會失敗，請改停用。')) {
    return;
  }
  AdminAPI.campgrounds.remove(id)
    .then(function () {
      window.showAdminToast('已刪除營區', 'warning');
      refreshCampgroundMasterList();
      return window.BookingAPI.getCampgrounds().then(function (camps) {
        bcState.campgrounds = camps || [];
        if (bcState.campgroundId === id) {
          bcState.campgroundId = null;
        }
        populateCampgroundSelect();
        populateZoneSelect();
        renderClosureTable();
        renderCalendar();
      });
    })
    .catch(function (error) {
      AdminAPI.handleError(error, '刪除失敗（可能仍被引用，請改停用）');
    });
}

/** 營位 tab：填入營區下拉（後台列表含停用） */
function populateZoneCampgroundSelect() {
  var $sel = $('#bcZoneCampgroundSelect');
  if (!$sel.length || !AdminAPI.campgrounds.list) {
    return;
  }
  AdminAPI.campgrounds.list()
    .then(function (response) {
      var rows = (response && response.data) || [];
      $sel.empty();
      if (!rows.length) {
        $sel.append('<option value="">尚無營區</option>');
        return;
      }
      var preferred = bcState.campgroundId || rows[0].id;
      rows.forEach(function (row) {
        var label = row.id + ' — ' + row.name;
        $sel.append(
          '<option value="' + $('<div>').text(row.id).html() + '"'
          + (row.id === preferred ? ' selected' : '') + '>'
          + $('<div>').text(label).html()
          + (row.active ? '' : '（停用）')
          + '</option>'
        );
      });
    })
    .catch(function (error) {
      AdminAPI.handleError(error, '載入營區選單失敗');
    });
}

/** 重新載入所選營區的營位列表 */
function refreshZoneMasterList() {
  var $list = $('#bcZoneList').empty()
    .append('<li class="list-group-item text-muted small">載入中…</li>');
  var campgroundId = $('#bcZoneCampgroundSelect').val();
  if (!campgroundId || !isZoneMasterReady()) {
    $list.empty().append('<li class="list-group-item text-muted small">請先選擇營區</li>');
    return;
  }
  AdminAPI.campgrounds.listZones(campgroundId)
    .then(function (response) {
      var rows = (response && response.data) || [];
      $list.empty();
      if (!rows.length) {
        $list.append('<li class="list-group-item text-muted small">此營區尚無營位</li>');
        return;
      }
      rows.forEach(function (row) {
        var statusBadge = row.active
          ? '<span class="badge text-bg-success ms-1">啟用</span>'
          : '<span class="badge text-bg-secondary ms-1">停用</span>';
        var label = row.id + ' — ' + row.type
          + '｜上限 ' + row.totalSites
          + '｜一般 ' + row.priceWeekday + '／特殊節日 ' + row.priceHoliday;
        var safeCampId = $('<div>').text(String(row.campgroundId)).html();
        var safeZoneId = $('<div>').text(String(row.id)).html();
        var toggleLabel = row.active ? '停用' : '啟用';
        var toggleClass = row.active ? 'btn-outline-secondary' : 'btn-outline-success';
        $list.append(
          '<li class="list-group-item px-0">'
          + '<div class="d-flex justify-content-between align-items-start gap-2">'
          + '<div class="small">' + $('<div>').text(label).html() + statusBadge + '</div>'
          + '<div class="btn-group btn-group-sm flex-shrink-0">'
          + '<button type="button" class="btn btn-outline-primary bc-btn-zone-edit"'
          + ' data-campground-id="' + safeCampId + '" data-id="' + safeZoneId + '"'
          + ' data-type="' + $('<div>').text(String(row.type || '')).html() + '"'
          + ' data-capacity="' + row.capacityPerSite + '"'
          + ' data-price-weekday="' + row.priceWeekday + '"'
          + ' data-price-holiday="' + row.priceHoliday + '"'
          + ' data-total-sites="' + row.totalSites + '">編輯</button>'
          + '<button type="button" class="btn ' + toggleClass + ' bc-btn-zone-toggle"'
          + ' data-campground-id="' + safeCampId + '" data-id="' + safeZoneId + '"'
          + ' data-active="' + (row.active ? 'true' : 'false') + '">' + toggleLabel + '</button>'
          + '<button type="button" class="btn btn-outline-danger bc-btn-zone-delete"'
          + ' data-campground-id="' + safeCampId + '" data-id="' + safeZoneId + '">刪除</button>'
          + '</div></div></li>'
        );
      });
      window.applyEditPermission('booking-calendar', $('#bcCampgroundModal'));
    })
    .catch(function (error) {
      AdminAPI.handleError(error, '載入營位失敗');
      $list.empty().append('<li class="list-group-item text-danger small">載入失敗</li>');
    });
}

/** 重設營位表單為「新增」模式 */
function resetZoneFormToCreate() {
  bcZoneEditState = { campgroundId: null, zoneId: null };
  $('#bcZoneId').prop('readonly', false).val('');
  $('#bcZoneType').val('');
  $('#bcZoneCapacity').val(4);
  $('#bcZonePriceWeekday').val(1000);
  $('#bcZonePriceHoliday').val(1500);
  $('#bcZoneTotalSites').val(2);
  $('#bcZoneCreateBtn').html('<i class="fas fa-plus me-1"></i>新增');
  $('#bcZoneCancelEditBtn').addClass('d-none');
  $('#bcZoneFormModeHint').text('新增營位：填 ID 與容量；點列表「編輯」可改類型、一般價／特殊節日價與可賣上限。');
}

/**
 * 進入營位「編輯」模式：ID 鎖定，其餘欄位可改（含可賣上限 → 後端可能 409）。
 * @param {string} campgroundId
 * @param {object} row
 */
function beginZoneEdit(campgroundId, row) {
  if (!campgroundId || !row || !row.id) return;
  bcZoneEditState = { campgroundId: campgroundId, zoneId: row.id };
  $('#bcZoneId').prop('readonly', true).val(row.id);
  $('#bcZoneType').val(row.type || '');
  $('#bcZoneCapacity').val(row.capacityPerSite || 1);
  $('#bcZonePriceWeekday').val(parseFloat(row.priceWeekday) || 0);
  $('#bcZonePriceHoliday').val(parseFloat(row.priceHoliday) || 0);
  $('#bcZoneTotalSites').val(row.totalSites || 1);
  $('#bcZoneCreateBtn').html('<i class="fas fa-save me-1"></i>儲存');
  $('#bcZoneCancelEditBtn').removeClass('d-none');
  $('#bcZoneFormModeHint').text('編輯營位 ' + row.id + '：可改類型、一般價／特殊節日價、可賣上限；調降上限若低於已占用會回 409。');
  var formEl = document.getElementById('bcZoneCreateForm');
  if (formEl && formEl.scrollIntoView) {
    formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  window.applyEditPermission('booking-calendar', $('#bcCampgroundModal'));
}

/** 讀取表單並驗證；回傳 null 表示驗證失敗 */
function readZoneFormPayload(campgroundId) {
  var id = ($('#bcZoneId').val() || '').trim();
  var type = ($('#bcZoneType').val() || '').trim();
  var capacityPerSite = parseInt($('#bcZoneCapacity').val(), 10);
  var priceWeekday = parseFloat($('#bcZonePriceWeekday').val());
  var priceHoliday = parseFloat($('#bcZonePriceHoliday').val());
  var totalSites = parseInt($('#bcZoneTotalSites').val(), 10);
  if (!campgroundId || !id || !type) {
    window.showAdminToast('請選擇營區並填寫 ID、類型', 'warning');
    return null;
  }
  if (isNaN(capacityPerSite) || capacityPerSite < 1 || isNaN(totalSites) || totalSites < 1) {
    window.showAdminToast('人數與可賣上限須 ≥ 1', 'warning');
    return null;
  }
  if (isNaN(priceWeekday) || priceWeekday < 0 || isNaN(priceHoliday) || priceHoliday < 0) {
    window.showAdminToast('價格不可為負', 'warning');
    return null;
  }
  return {
    id: id,
    type: type,
    capacityPerSite: capacityPerSite,
    priceWeekday: priceWeekday.toFixed(2),
    priceHoliday: priceHoliday.toFixed(2),
    totalSites: totalSites,
  };
}

/** 新增或更新營位（依 bcZoneEditState） */
function submitZoneForm() {
  var campgroundId = ($('#bcZoneCampgroundSelect').val() || '').trim();
  var payload = readZoneFormPayload(campgroundId);
  if (!payload) return;

  var isEdit = bcZoneEditState.zoneId
    && bcZoneEditState.campgroundId === campgroundId
    && bcZoneEditState.zoneId === payload.id;
  $('#bcZoneCreateBtn').prop('disabled', true);

  var promise;
  if (isEdit) {
    promise = AdminAPI.campgrounds.updateZone(campgroundId, payload.id, {
      type: payload.type,
      capacityPerSite: payload.capacityPerSite,
      priceWeekday: payload.priceWeekday,
      priceHoliday: payload.priceHoliday,
      totalSites: payload.totalSites,
    });
  } else {
    promise = AdminAPI.campgrounds.createZone(campgroundId, payload);
  }

  promise
    .then(function () {
      window.showAdminToast(isEdit ? '已更新營位' : '已建立營位', 'success');
      resetZoneFormToCreate();
      refreshZoneMasterList();
      return reloadCalendarCampgroundsAndZones();
    })
    .catch(function (error) {
      var msg = isEdit ? '更新營位失敗' : '建立營位失敗';
      if (isEdit && error && error.status === 409) {
        msg = '無法調降可賣上限（低於已占用）；請先處理預約或改停用';
      }
      AdminAPI.handleError(error, msg);
    })
    .then(function () {
      $('#bcZoneCreateBtn').prop('disabled', false);
    });
}

/** @deprecated 保留舊名稱別名，避免其他地方誤用 */
function submitZoneCreate() {
  submitZoneForm();
}

/** 啟停營位 */
function toggleZoneActive(campgroundId, zoneId, currentlyActive) {
  if (!campgroundId || !zoneId) return;
  AdminAPI.campgrounds.updateZone(campgroundId, zoneId, { active: !currentlyActive })
    .then(function () {
      window.showAdminToast(currentlyActive ? '已停用營位' : '已啟用營位', 'success');
      refreshZoneMasterList();
      return reloadCalendarCampgroundsAndZones();
    })
    .catch(function (error) {
      AdminAPI.handleError(error, '更新營位失敗');
    });
}

/** 刪除未引用營位 */
function deleteZoneMaster(campgroundId, zoneId) {
  if (!campgroundId || !zoneId) return;
  if (!window.confirm('確定刪除營位 ' + zoneId + '？有預約引用時會失敗。')) {
    return;
  }
  AdminAPI.campgrounds.removeZone(campgroundId, zoneId)
    .then(function () {
      window.showAdminToast('已刪除營位', 'warning');
      refreshZoneMasterList();
      return reloadCalendarCampgroundsAndZones();
    })
    .catch(function (error) {
      AdminAPI.handleError(error, '刪除失敗（可能仍被引用，請改停用）');
    });
}

/** 營區／營位異動後刷新月曆下拉與可用性 */
function reloadCalendarCampgroundsAndZones() {
  return window.BookingAPI.getCampgrounds().then(function (camps) {
    bcState.campgrounds = camps || [];
    populateCampgroundSelect();
    populateZoneSelect();
    if (bcState.ctx) {
      return window.BookingAPI.loadAvailabilityContext().then(function (ctx) {
        bcState.ctx = ctx;
        if (bcState.ctx) {
          bcState.ctx.closures = bcState.closures;
          bcState.ctx.bookings = window.bookingsCache || bcState.ctx.bookings;
        }
        renderCalendar();
      });
    }
  });
}

function loadBookingCalendarData() {
  var closuresPromise = isClosureBackendMode()
    ? loadAdminClosures()
    : window.BookingAPI.getClosures();
  var tasks = [
    window.BookingAPI.getCampgrounds(),
    window.BookingAPI.loadAvailabilityContext(),
    window.BookingAPI.getBookingWindow(),
    closuresPromise,
  ];

  var customersPromise;
  if (window.customersCache && window.customersCache.length) {
    customersPromise = Promise.resolve(window.customersCache);
  } else {
    customersPromise = new Promise(function (resolve) {
      loadAdminJsonResource({
        adminList: AdminAPI && AdminAPI.customers && AdminAPI.customers.list,
        jsonPath: MockDataPaths.customers,
        emptyValue: [],
        onSuccess: function (list) {
          window.customersCache = list;
          resolve(list);
        },
        onError: function () { resolve([]); },
      });
    });
  }
  tasks.push(customersPromise);

  Promise.all(tasks)
    .then(function (results) {
      bcState.campgrounds = results[0] || [];
      bcState.ctx = results[1];
      bcState.window = results[2] || { minDate: null, maxDate: null };
      bcState.closures = results[3] || [];
      if (bcState.ctx) bcState.ctx.closures = bcState.closures;

      var customers = results[4] || [];
      bcState.customersById = {};
      customers.forEach(function (c) { bcState.customersById[c.id] = c; });

      if (!bcState.ctx) {
        return null;
      }
      if (window.bookingsCache && window.bookingsCache.length) {
        bcState.ctx.bookings = window.bookingsCache;
      } else {
        return window.BookingAPI.getBookings().then(function (bookings) {
          window.bookingsCache = bookings;
          bcState.ctx.bookings = bookings;
        });
      }
    })
    .then(function () {
      populateCampgroundSelect();
      initViewMonth();
      updateWindowLabel();
      renderClosureTable();
      syncCampgroundMasterButton();
      syncCalendarDatesButton();
      return refreshViewMonthHolidays();
    })
    .then(function () {
      window.applyEditPermission('booking-calendar', $('#contentArea'));
    })
    .catch(function (err) {
      console.error('[booking-calendar] 載入失敗:', err);
      $('#bcCalendarGrid').html(
        '<div class="alert alert-danger mb-0"><i class="fas fa-exclamation-triangle me-1"></i>排程資料載入失敗，請重新整理。</div>'
      );
    });
}

function getCurrentCamp() {
  return bcState.campgrounds.find(function (c) {
    return c.campgroundId === bcState.campgroundId;
  });
}

function populateCampgroundSelect() {
  var $sel = $('#bcCampgroundSelect').empty();
  bcState.campgrounds.forEach(function (camp) {
    $sel.append($('<option></option>').val(camp.campgroundId).text(camp.name));
  });
  bcState.campgroundId = bcState.campgrounds[0] ? bcState.campgrounds[0].campgroundId : null;
  $sel.val(bcState.campgroundId);
  populateZoneSelect();
}

function populateZoneSelect() {
  var $sel = $('#bcZoneSelect').empty();
  var camp = getCurrentCamp();

  if (!camp || !camp.zones || !camp.zones.length) {
    bcState.zoneId = null;
    $sel.append('<option value="">無營位類型</option>');
    return;
  }

  var totalSites = camp.zones.reduce(function (s, z) { return s + (z.totalSites || 0); }, 0);
  $sel.append(
    $('<option></option>').val(BC_ALL_ZONES).text('全部（共 ' + totalSites + ' 帳）')
  );

  camp.zones.forEach(function (zone) {
    $sel.append(
      $('<option></option>')
        .val(zone.zoneId)
        .text(zone.type + '（共 ' + zone.totalSites + ' 帳）')
    );
  });

  bcState.zoneId = BC_ALL_ZONES;
  $sel.val(BC_ALL_ZONES);
}

function initViewMonth() {
  var AV = window.BookingAvailability;
  var today = AV ? AV.todayISO() : new Date().toISOString().slice(0, 10);
  var ref = bcState.window.minDate || today;
  var parts = ref.split('-');
  bcState.viewYear = Number(parts[0]);
  bcState.viewMonth = Number(parts[1]) - 1;
}

function updateWindowLabel() {
  $('#bcWindowLabel').text(
    '可預約期間：' + (bcState.window.minDate || '—') + ' ～ ' + (bcState.window.maxDate || '—')
  );
}

function shiftMonth(delta) {
  bcState.viewMonth += delta;
  if (bcState.viewMonth < 0) { bcState.viewMonth = 11; bcState.viewYear -= 1; }
  else if (bcState.viewMonth > 11) { bcState.viewMonth = 0; bcState.viewYear += 1; }
  refreshViewMonthHolidays();
}

/** 載入當月特殊節日標記後重繪月曆（W4-03） */
function refreshViewMonthHolidays() {
  if (!isCalendarDatesReady()) {
    bcState.calendarHolidayMap = {};
    renderCalendar();
    return Promise.resolve();
  }
  return loadCalendarHolidaysForMonth(bcState.viewYear, bcState.viewMonth)
    .then(function (map) {
      bcState.calendarHolidayMap = map || {};
      renderCalendar();
    })
    .catch(function (err) {
      console.warn('[booking-calendar] 特殊節日載入失敗:', err);
      bcState.calendarHolidayMap = {};
      renderCalendar();
    });
}

/** 向後端查詢區間內的特殊節日，回傳 dateISO → row 的 map */
function loadCalendarHolidaysForMonth(year, month) {
  var AV = window.BookingAvailability;
  if (!AV || !isCalendarDatesReady()) {
    return Promise.resolve({});
  }
  var first = new Date(year, month, 1);
  var last = new Date(year, month + 1, 0);
  var from = AV.formatISODate(first);
  var to = AV.formatISODate(last);
  return AdminAPI.calendarDates.listRange(from, to).then(function (response) {
    var map = {};
    (response.data || []).forEach(function (row) {
      if (row.isHoliday) {
        map[row.calendarDate] = row;
      }
    });
    return map;
  });
}

function getMonthRange(year, month) {
  var AV = window.BookingAvailability;
  var first = new Date(year, month, 1);
  var last = new Date(year, month + 1, 0);
  return {
    from: AV.formatISODate(first),
    to: AV.formatISODate(last),
    firstDow: first.getDay(),
    daysInMonth: last.getDate(),
  };
}

function getAvailabilityForView(range) {
  var AV = window.BookingAvailability;
  var camp = getCurrentCamp();
  if (!camp) return { capacity: 0, days: [] };

  if (bcState.zoneId === BC_ALL_ZONES) {
    return AV.getCampgroundAggregatedRange(
      camp.campgroundId, range.from, range.to, bcState.ctx, camp.zones
    );
  }

  return AV.getAvailabilityRange(
    { zoneId: bcState.zoneId, from: range.from, to: range.to },
    bcState.ctx
  );
}

function renderCalendar() {
  var AV = window.BookingAvailability;
  if (!AV || !bcState.ctx || !bcState.zoneId) {
    var message = isClosureBackendMode()
      ? '正式模式的月曆可用量仍由後端查詢；公休規則可在下方管理。'
      : '請選擇營區與營位類型。';
    $('#bcCalendarGrid').html('<p class="text-muted text-center py-3">' + message + '</p>');
    return;
  }

  var range = getMonthRange(bcState.viewYear, bcState.viewMonth);
  $('#bcMonthLabel').text(bcState.viewYear + ' 年 ' + (bcState.viewMonth + 1) + ' 月');

  var availability = getAvailabilityForView(range);
  var dayMap = {};
  (availability.days || []).forEach(function (d) { dayMap[d.date] = d; });

  var html = '<div class="bc-weekdays">';
  ['日', '一', '二', '三', '四', '五', '六'].forEach(function (w) {
    html += '<div class="bc-weekday">' + w + '</div>';
  });
  html += '</div><div class="bc-days">';

  for (var i = 0; i < range.firstDow; i += 1) {
    html += '<div class="bc-day-cell bc-day-cell--empty"></div>';
  }

  for (var day = 1; day <= range.daysInMonth; day += 1) {
    var dateISO = AV.formatISODate(new Date(bcState.viewYear, bcState.viewMonth, day));
    var info = dayMap[dateISO] || {
      remaining: 0, capacity: availability.capacity, booked: 0, blocked: 0, status: 'out_of_window',
    };

    var interactive = info.status !== 'out_of_window';
    var holidayRow = bcState.calendarHolidayMap[dateISO];
    var title = info.status === 'closed'
      ? (info.closureReason || '公休')
      : ('已訂 ' + info.booked + '／停售 ' + info.blocked);
    if (holidayRow) {
      title += '；特殊節日' + (holidayRow.holidayName ? '：' + holidayRow.holidayName : '');
    }

    html +=
      '<button type="button" class="bc-day-cell bc-status-' + info.status +
      (interactive ? ' isInteractive' : '') +
      (holidayRow ? ' isHolidayMarked' : '') +
      (bcState.selectedDate === dateISO ? ' isSelected' : '') + '"' +
      ' data-date="' + dateISO + '"' +
      (interactive ? '' : ' disabled') +
      ' title="' + escapeHtml(title) + '">' +
      '<span class="bc-day-num">' + day + '</span>' +
      (holidayRow
        ? '<span class="bc-day-holiday-tag">' + escapeHtml(holidayRow.holidayName || '特殊節日') + '</span>'
        : '') +
      '<span class="bc-day-remain">剩 ' + info.remaining + '／' + info.capacity + '</span>' +
      '<span class="bc-day-status">' + (BC_STATUS_LABEL[info.status] || '') + '</span>' +
      '</button>';
  }

  html += '</div>';
  $('#bcCalendarGrid').html(html);

  if (bcState.selectedDate) renderDayDetail(bcState.selectedDate);
}

function renderDayDetail(dateISO) {
  var AV = window.BookingAvailability;
  var camp = getCurrentCamp();
  if (!AV || !bcState.ctx || !bcState.zoneId || !camp) return;

  var isClosed = AV.isCampgroundClosed(camp.campgroundId, dateISO, bcState.closures);
  var zoneLabel = bcState.zoneId === BC_ALL_ZONES
    ? '全部營位類型'
    : ((bcState.ctx.zonesById[bcState.zoneId] || {}).type || bcState.zoneId);

  $('#bcDayDetailTitle').text(dateISO + '　' + zoneLabel + '　明細');
  $('#bcDayDetail').removeClass('d-none');
  $('#bcDayDetailClosed').addClass('d-none').text('');
  $('#bcDayDetailEmpty').addClass('d-none');

  var $closeBtn = $('#bcBtnCloseSingleDay');
  if (isClosed) {
    $closeBtn.addClass('d-none');
    $('#bcDayDetailBody').empty();
    $('#bcDayDetailClosed').removeClass('d-none').text(
      '此日為公休：' + (AV.getClosureReason(camp.campgroundId, dateISO, bcState.closures) || '公休')
    );
    return;
  }

  if (window.canEdit && window.canEdit('booking-calendar')) {
    $closeBtn.removeClass('d-none').off('click').on('click', function () {
      bcState.selectedDate = dateISO;
      closeSingleSelectedDay();
    });
  } else {
    $closeBtn.addClass('d-none');
  }

  var bookings = AV.getBookingsForCampgroundNight(
    camp.campgroundId,
    dateISO,
    bcState.ctx.bookings,
    bcState.ctx.policy,
    bcState.zoneId
  );

  if (!bookings.length) {
    $('#bcDayDetailBody').empty();
    $('#bcDayDetailEmpty').removeClass('d-none');
    return;
  }

  var rows = bookings.map(function (b) {
    var info = b.bookingInfo || {};
    var zoneLine = (b.selectedZones || []).find(function (z) {
      return bcState.zoneId === BC_ALL_ZONES || z.zoneId === bcState.zoneId;
    }) || (b.selectedZones || [])[0];
    var qty = zoneLine ? zoneLine.quantity : '—';
    var zoneType = zoneLine ? zoneLine.zoneType : '—';
    var customer = bcState.customersById[b.customerId];
    var bookingNo = typeof formatBookingId === 'function'
      ? formatBookingId(b.id) : ('BK-' + String(b.id).padStart(4, '0'));

    return (
      '<tr>' +
      '<td>' + bookingNo + '</td>' +
      '<td>' + escapeHtml(zoneType) + '</td>' +
      '<td>' + escapeHtml(customer ? customer.name : b.customerId) + '</td>' +
      '<td class="text-center">× ' + qty + '</td>' +
      '<td>' + (BC_BOOKING_STATUS_LABEL[b.status] || b.status) + '</td>' +
      '<td class="small">' + (info.checkIn || '—') + ' ～ ' + (info.checkOut || '—') + '</td>' +
      '<td><button type="button" class="btn btn-sm btn-outline-primary bc-view-booking" data-booking-id="' + b.id + '">查看</button></td>' +
      '</tr>'
    );
  }).join('');

  $('#bcDayDetailBody').html(rows);
}

function renderClosureTable() {
  var camp = getCurrentCamp();
  var $body = $('#bcClosureTableBody').empty();
  if (!camp) {
    $body.html('<tr><td colspan="4" class="text-muted text-center py-2">請選擇營區</td></tr>');
    return;
  }

  var list = bcState.closures.filter(function (cl) {
    return cl.campgroundId === camp.campgroundId;
  });

  if (!list.length) {
    $body.html('<tr><td colspan="4" class="text-muted text-center py-2">尚無公休規則</td></tr>');
    return;
  }

  list.forEach(function (cl) {
    var period = '';
    if ((cl.type || 'date_range') === 'weekly') {
      period = '每週' + BC_WEEKDAY_LABEL[Number(cl.dayOfWeek)] +
        '（' + (cl.effectiveFrom || '—') + '～' + (cl.effectiveTo || '—') + '）';
    } else {
      period = (cl.startDate || '—') + ' ～ ' + (cl.endDate || '—');
    }

    $body.append(
      '<tr>' +
      '<td>' + ((cl.type === 'weekly') ? '每週固定' : '指定日期') + '</td>' +
      '<td class="small">' + escapeHtml(period) + '</td>' +
      '<td>' + escapeHtml(cl.reason || '公休') + '</td>' +
      '<td class="text-end">' +
      '<button type="button" class="btn btn-sm btn-outline-danger bc-btn-delete-closure" data-closure-id="' + escapeHtml(cl.id) + '">刪除</button>' +
      '</td></tr>'
    );
  });

  window.applyEditPermission('booking-calendar', $('#contentArea'));
}

function initClosureModalPickers() {
  if (typeof flatpickr === 'undefined') return;

  bcState.closureRangePicker = flatpickr('#bcClosureDateRange', {
    mode: 'range',
    locale: 'zh_tw',
    dateFormat: 'Y-m-d',
    allowInput: false,
  });

  bcState.closureEffectivePicker = flatpickr('#bcClosureEffectiveRange', {
    mode: 'range',
    locale: 'zh_tw',
    dateFormat: 'Y-m-d',
    allowInput: false,
  });
}

function openClosureModal() {
  var camp = getCurrentCamp();
  if (!camp) return;

  $('#bcClosureModalCampLabel').text('營區：' + camp.name);
  $('input[name="bcClosureType"][value="date_range"]').prop('checked', true);
  toggleClosureTypeFields();

  if (bcState.closureRangePicker) bcState.closureRangePicker.clear();
  if (bcState.closureEffectivePicker) {
    bcState.closureEffectivePicker.setDate([
      bcState.window.minDate,
      bcState.window.maxDate,
    ]);
  }

  $('.bc-weekday-cb').prop('checked', false);
  syncWeekdayBtnStyles();
  $('#bcClosureReason').val('');

  new bootstrap.Modal('#bcClosureModal').show();
  window.applyEditPermission('booking-calendar', $('#bcClosureModal'));
}

function toggleClosureTypeFields() {
  var type = $('input[name="bcClosureType"]:checked').val();
  $('#bcClosureRangeFields').toggleClass('d-none', type !== 'date_range');
  $('#bcClosureWeeklyFields').toggleClass('d-none', type !== 'weekly');
}

function syncWeekdayBtnStyles() {
  $('#bcClosureWeekdayBtns label').each(function () {
    var checked = $(this).find('.bc-weekday-cb').prop('checked');
    $(this).toggleClass('active', checked).toggleClass('btn-primary', checked).toggleClass('btn-outline-secondary', !checked);
  });
}

function readClosureOverlay() {
  var merge = window.MockStorageMerge;
  if (!merge) return bcState.closures.slice();
  return merge.readJsonStorage('mockCampgroundClosures', []);
}

function writeClosureOverlay(overlay) {
  return window.BookingAPI.saveClosuresOverlay(overlay).then(function () {
    return window.BookingAPI.getClosures();
  });
}

/** 套用後端或 Mock 回傳的真實公休列表並重繪相關畫面。 */
function applyClosureList(list) {
  bcState.closures = (list || []).map(mapAdminClosureResponse);
  if (bcState.ctx) bcState.ctx.closures = bcState.closures;
  renderClosureTable();
  renderCalendar();
  if (bcState.selectedDate) renderDayDetail(bcState.selectedDate);

  return bcState.closures;
}

/** 建立一或多筆公休；正式模式只有 API 全部回應後才更新畫面。 */
function persistClosureItems(items) {
  if (!isClosureBackendMode()) {
    var overlay = readClosureOverlay();
    items.forEach(function (item) { overlay.push(item); });

    return writeClosureOverlay(overlay).then(applyClosureList);
  }

  var requests = items.map(function (item) {
    return AdminAPI.closures.create(buildAdminClosureRequest(item));
  });

  return Promise.all(requests)
    .then(loadAdminClosures)
    .then(applyClosureList)
    .catch(function (error) {
      // 多星期建立若中途失敗，重新查詢可呈現資料庫已成功的部分。
      return loadAdminClosures()
        .then(applyClosureList)
        .then(function () { throw error; });
    });
}

/** 刪除公休；正式模式失敗時保留原畫面。 */
function persistClosureDelete(closureId) {
  if (!isClosureBackendMode()) {
    var overlay = readClosureOverlay();
    overlay.push({ id: closureId, _deleted: true });

    return writeClosureOverlay(overlay).then(applyClosureList);
  }

  return AdminAPI.closures.remove(closureId)
    .then(loadAdminClosures)
    .then(applyClosureList);
}

function nextClosureId(offset) {
  var max = 0;
  bcState.closures.forEach(function (cl) {
    var n = parseInt(String(cl.id).replace(/\D/g, ''), 10);
    if (n > max) max = n;
  });
  return 'CL' + String(max + 1 + (offset || 0)).padStart(3, '0');
}

function saveClosureFromModal() {
  if (!window.canEdit || !window.canEdit('booking-calendar')) {
    window.showAdminToast('無編輯權限', 'error');
    return;
  }

  var camp = getCurrentCamp();
  if (!camp) return;

  var type = $('input[name="bcClosureType"]:checked').val();
  var reason = ($('#bcClosureReason').val() || '').trim() || '公休';
  var now = new Date();
  var ts = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0') + ':00';

  var newItems = [];

  if (type === 'date_range') {
    var dates = bcState.closureRangePicker ? bcState.closureRangePicker.selectedDates : [];
    if (dates.length < 2) {
      window.showAdminToast('請選擇公休日期區間', 'error');
      return;
    }
    var AV = window.BookingAvailability;
    var start = AV.formatISODate(dates[0]);
    // flatpickr 結束日是管理員選取的最後公休日，送 API 時轉為左閉右開的隔日。
    var end = AV.formatISODate(AV.addDays(dates[1], 1));
    newItems.push({
      id: nextClosureId(newItems.length),
      campgroundId: camp.campgroundId,
      type: 'date_range',
      startDate: start,
      endDate: end,
      reason: reason,
      createdBy: 'admin',
      createdAt: ts,
    });
  } else {
    var days = [];
    $('.bc-weekday-cb:checked').each(function () { days.push(Number($(this).val())); });
    if (!days.length) {
      window.showAdminToast('請至少選擇一個星期', 'error');
      return;
    }
    var eff = bcState.closureEffectivePicker ? bcState.closureEffectivePicker.selectedDates : [];
    if (eff.length < 2) {
      window.showAdminToast('請選擇生效期間', 'error');
      return;
    }
    var AV2 = window.BookingAvailability;
    var effFrom = AV2.formatISODate(eff[0]);
    var effTo = AV2.formatISODate(eff[1]);

    days.forEach(function (dow) {
      newItems.push({
        id: nextClosureId(newItems.length),
        campgroundId: camp.campgroundId,
        type: 'weekly',
        dayOfWeek: dow,
        effectiveFrom: effFrom,
        effectiveTo: effTo,
        reason: reason,
        createdBy: 'admin',
        createdAt: ts,
      });
    });
  }

  var $saveButton = $('#bcBtnSaveClosure').prop('disabled', true);
  persistClosureItems(newItems)
    .then(function () {
      bootstrap.Modal.getInstance(document.getElementById('bcClosureModal')).hide();
      window.showAdminToast('公休規則已儲存', 'success');
    })
    .catch(function (error) {
      if (window.AdminAPI && AdminAPI.handleError && isClosureBackendMode()) {
        AdminAPI.handleError(error, '公休儲存失敗');
      } else {
        window.showAdminToast('公休儲存失敗', 'error');
      }
    })
    .finally(function () {
      $saveButton.prop('disabled', false);
    });
}

function closeSingleSelectedDay() {
  if (!bcState.selectedDate || !window.canEdit('booking-calendar')) return;
  var camp = getCurrentCamp();
  if (!camp) return;

  var AV = window.BookingAvailability;
  var start = bcState.selectedDate;
  var end = AV.formatISODate(AV.addDays(AV.parseISODate(start), 1));
  var item = {
    id: nextClosureId(),
    campgroundId: camp.campgroundId,
    type: 'date_range',
    startDate: start,
    endDate: end,
    reason: '單日公休',
    createdBy: 'admin',
    createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
  };

  persistClosureItems([item])
    .then(function () {
      window.showAdminToast('已將 ' + start + ' 設為公休', 'success');
    })
    .catch(function (error) {
      if (window.AdminAPI && AdminAPI.handleError && isClosureBackendMode()) {
        AdminAPI.handleError(error, '單日公休儲存失敗');
      } else {
        window.showAdminToast('單日公休儲存失敗', 'error');
      }
    });
}

function deleteClosure(closureId) {
  if (!window.canEdit('booking-calendar')) return;
  if (!window.confirm('確定要刪除此公休規則嗎？')) return;

  persistClosureDelete(closureId)
    .then(function () {
      window.showAdminToast('公休規則已刪除', 'success');
    })
    .catch(function (error) {
      if (window.AdminAPI && AdminAPI.handleError && isClosureBackendMode()) {
        AdminAPI.handleError(error, '公休規則刪除失敗');
      } else {
        window.showAdminToast('公休規則刪除失敗', 'error');
      }
    });
}

function openBookingDetail(bookingId) {
  var booking = (window.bookingsCache || []).find(function (b) {
    return Number(b.id) === Number(bookingId);
  });
  if (booking && typeof window.showBookingModal === 'function') {
    window.showBookingModal(booking);
    return;
  }
  window.pendingBookingId = bookingId;
  $('.sidebar-link[data-section="bookings"]').first().trigger('click');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── W4-03：特殊節日曆 Modal ──────────────────────────────────────

/** 開啟特殊節日曆 Modal，預設對齊排程面板目前月份 */
function openCalendarDatesModal() {
  if (!isCalendarDatesReady()) {
    window.showAdminToast('特殊節日曆尚未就緒', 'info');
    return;
  }
  bcState.calModalYear = bcState.viewYear;
  bcState.calModalMonth = bcState.viewMonth;
  var modalEl = document.getElementById('bcCalendarDatesModal');
  if (modalEl && typeof bootstrap !== 'undefined') {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
  loadCalendarDatesModalMonth();
  window.applyEditPermission('booking-calendar', $('#bcCalendarDatesModal'));
}

function shiftCalendarModalMonth(delta) {
  bcState.calModalMonth += delta;
  if (bcState.calModalMonth < 0) { bcState.calModalMonth = 11; bcState.calModalYear -= 1; }
  else if (bcState.calModalMonth > 11) { bcState.calModalMonth = 0; bcState.calModalYear += 1; }
  loadCalendarDatesModalMonth();
}

/** 載入 Modal 當月每一天並渲染表格 */
function loadCalendarDatesModalMonth() {
  var AV = window.BookingAvailability;
  if (!AV || bcState.calModalYear == null) return;

  $('#bcCalModalMonthLabel').text(bcState.calModalYear + ' 年 ' + (bcState.calModalMonth + 1) + ' 月');
  $('#bcCalendarDatesTableBody').html(
    '<tr><td colspan="5" class="text-muted text-center py-3">載入中…</td></tr>'
  );

  AdminAPI.calendarDates.listRange(
    AV.formatISODate(new Date(bcState.calModalYear, bcState.calModalMonth, 1)),
    AV.formatISODate(new Date(bcState.calModalYear, bcState.calModalMonth + 1, 0))
  )
    .then(function (response) {
      renderCalendarDatesTable(response.data || []);
      window.applyEditPermission('booking-calendar', $('#bcCalendarDatesModal'));
    })
    .catch(function (err) {
      console.error('[booking-calendar] 特殊節日曆載入失敗:', err);
      $('#bcCalendarDatesTableBody').html(
        '<tr><td colspan="5" class="text-danger text-center py-3">載入失敗，請稍後再試。</td></tr>'
      );
      if (typeof handleApiError === 'function') handleApiError(err);
    });
}

/** 渲染 Modal 內的日期表格 */
function renderCalendarDatesTable(rows) {
  var $body = $('#bcCalendarDatesTableBody').empty();
  if (!rows.length) {
    $body.html('<tr><td colspan="5" class="text-muted text-center py-3">此月無資料</td></tr>');
    return;
  }

  rows.forEach(function (row) {
    var dateISO = row.calendarDate;
    var parts = dateISO.split('-');
    var dow = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getDay();
    var checked = row.isHoliday === true;
    var nameVal = row.holidayName || '';

    $body.append(
      '<tr data-date="' + escapeHtml(dateISO) + '">' +
      '<td class="font-monospace small">' + escapeHtml(dateISO) + '</td>' +
      '<td>週' + BC_WEEKDAY_LABEL[dow] + '</td>' +
      '<td class="text-center">' +
      '<input type="checkbox" class="form-check-input bc-cal-holiday-cb"' +
      ' data-date="' + escapeHtml(dateISO) + '"' +
      (checked ? ' checked' : '') + ' aria-label="標記為特殊節日">' +
      '</td>' +
      '<td>' +
      '<input type="text" class="form-control form-control-sm bc-cal-holiday-name"' +
      ' data-date="' + escapeHtml(dateISO) + '"' +
      ' maxlength="100" placeholder="例：國慶日"' +
      ' value="' + escapeHtml(nameVal) + '"' +
      (checked ? '' : ' disabled') + '>' +
      '</td>' +
      '<td class="text-end">' +
      (checked
        ? '<button type="button" class="btn btn-sm btn-outline-primary bc-btn-cal-save-name"' +
          ' data-date="' + escapeHtml(dateISO) + '">儲存名稱</button>'
        : '<span class="text-muted small">—</span>') +
      '</td></tr>'
    );
  });
}

/** 勾選／取消特殊節日 → 立刻 PUT */
function persistCalendarHolidayToggle(dateISO, isHoliday) {
  if (!window.canEdit || !window.canEdit('booking-calendar')) return;

  var $row = $('#bcCalendarDatesTableBody tr[data-date="' + dateISO + '"]');
  var $name = $row.find('.bc-cal-holiday-name');
  var payload = { isHoliday: isHoliday };
  if (isHoliday) {
    var trimmed = ($name.val() || '').trim();
    if (trimmed) payload.holidayName = trimmed;
  }

  AdminAPI.calendarDates.upsert(dateISO, payload)
    .then(function (response) {
      var row = response.data || {};
      $name.prop('disabled', !row.isHoliday);
      $row.find('.bc-btn-cal-save-name').closest('td').html(
        row.isHoliday
          ? '<button type="button" class="btn btn-sm btn-outline-primary bc-btn-cal-save-name"' +
            ' data-date="' + escapeHtml(dateISO) + '">儲存名稱</button>'
          : '<span class="text-muted small">—</span>'
      );
      if (!row.isHoliday) $name.val('');
      window.showAdminToast(row.isHoliday ? '已標記特殊節日' : '已恢復一般日', 'success');
      return refreshViewMonthHolidays();
    })
    .catch(function (err) {
      $row.find('.bc-cal-holiday-cb').prop('checked', !isHoliday);
      if (typeof handleApiError === 'function') handleApiError(err);
    });
}

/** 更新已標記日的節日名稱 */
function saveCalendarHolidayName(dateISO) {
  if (!window.canEdit || !window.canEdit('booking-calendar')) return;

  var $row = $('#bcCalendarDatesTableBody tr[data-date="' + dateISO + '"]');
  if (!$row.find('.bc-cal-holiday-cb').prop('checked')) return;

  var holidayName = ($row.find('.bc-cal-holiday-name').val() || '').trim();
  AdminAPI.calendarDates.upsert(dateISO, { isHoliday: true, holidayName: holidayName || null })
    .then(function () {
      window.showAdminToast('節日名稱已儲存', 'success');
      return refreshViewMonthHolidays();
    })
    .catch(function (err) {
      if (typeof handleApiError === 'function') handleApiError(err);
    });
}
