/**
 * admin/js/booking-calendar.js
 * 預約排程面板 — Zone 可用性月曆、全部加總、公休設定（含每週固定）
 */

var BC_ALL_ZONES = '__ALL__';

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

  $(document).on('change.bookingCalendar', 'input[name="bcClosureType"]', toggleClosureTypeFields);
  $(document).on('change.bookingCalendar', '.bc-weekday-cb', syncWeekdayBtnStyles);
};

function loadBookingCalendarData() {
  var tasks = [
    window.BookingAPI.getCampgrounds(),
    window.BookingAPI.loadAvailabilityContext(),
    window.BookingAPI.getBookingWindow(),
    window.BookingAPI.getClosures(),
  ];

  var customersPromise;
  if (window.customersCache && window.customersCache.length) {
    customersPromise = Promise.resolve(window.customersCache);
  } else {
    customersPromise = new Promise(function (resolve) {
      loadAdminJsonResource({
        adminList: AdminAPI && AdminAPI.customers && AdminAPI.customers.list,
        jsonPath: DataPaths.customers,
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
      renderCalendar();
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
  renderCalendar();
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
    $('#bcCalendarGrid').html('<p class="text-muted text-center py-3">請選擇營區與營位類型。</p>');
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
    var title = info.status === 'closed'
      ? (info.closureReason || '公休')
      : ('已訂 ' + info.booked + '／停售 ' + info.blocked);

    html +=
      '<button type="button" class="bc-day-cell bc-status-' + info.status +
      (interactive ? ' isInteractive' : '') +
      (bcState.selectedDate === dateISO ? ' isSelected' : '') + '"' +
      ' data-date="' + dateISO + '"' +
      (interactive ? '' : ' disabled') +
      ' title="' + escapeHtml(title) + '">' +
      '<span class="bc-day-num">' + day + '</span>' +
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

function nextClosureId() {
  var max = 0;
  bcState.closures.forEach(function (cl) {
    var n = parseInt(String(cl.id).replace(/\D/g, ''), 10);
    if (n > max) max = n;
  });
  return 'CL' + String(max + 1).padStart(3, '0');
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

  var overlay = readClosureOverlay();
  var newItems = [];

  if (type === 'date_range') {
    var dates = bcState.closureRangePicker ? bcState.closureRangePicker.selectedDates : [];
    if (dates.length < 2) {
      window.showAdminToast('請選擇公休日期區間', 'error');
      return;
    }
    var AV = window.BookingAvailability;
    var start = AV.formatISODate(dates[0]);
    var end = AV.formatISODate(dates[1]);
    // 單日：start=end 時 end 為隔天（左閉右開）
    if (start === end) {
      end = AV.formatISODate(AV.addDays(dates[0], 1));
    }
    newItems.push({
      id: nextClosureId(),
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
        id: nextClosureId(),
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

  newItems.forEach(function (item) { overlay.push(item); });

  writeClosureOverlay(overlay)
    .then(function (merged) {
      bcState.closures = merged;
      if (bcState.ctx) bcState.ctx.closures = merged;
      bootstrap.Modal.getInstance(document.getElementById('bcClosureModal')).hide();
      window.showAdminToast('公休規則已儲存', 'success');
      renderClosureTable();
      renderCalendar();
      if (bcState.selectedDate) renderDayDetail(bcState.selectedDate);
    })
    .catch(function () {
      window.showAdminToast('公休儲存失敗', 'error');
    });
}

function closeSingleSelectedDay() {
  if (!bcState.selectedDate || !window.canEdit('booking-calendar')) return;
  var camp = getCurrentCamp();
  if (!camp) return;

  var AV = window.BookingAvailability;
  var start = bcState.selectedDate;
  var end = AV.formatISODate(AV.addDays(AV.parseISODate(start), 1));
  var overlay = readClosureOverlay();

  overlay.push({
    id: nextClosureId(),
    campgroundId: camp.campgroundId,
    type: 'date_range',
    startDate: start,
    endDate: end,
    reason: '單日公休',
    createdBy: 'admin',
    createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
  });

  writeClosureOverlay(overlay).then(function (merged) {
    bcState.closures = merged;
    if (bcState.ctx) bcState.ctx.closures = merged;
    window.showAdminToast('已將 ' + start + ' 設為公休', 'success');
    renderClosureTable();
    renderCalendar();
    renderDayDetail(start);
  });
}

function deleteClosure(closureId) {
  if (!window.canEdit('booking-calendar')) return;
  var overlay = readClosureOverlay();
  overlay.push({ id: closureId, _deleted: true });

  writeClosureOverlay(overlay).then(function (merged) {
    bcState.closures = merged;
    if (bcState.ctx) bcState.ctx.closures = merged;
    window.showAdminToast('公休規則已刪除', 'success');
    renderClosureTable();
    renderCalendar();
    if (bcState.selectedDate) renderDayDetail(bcState.selectedDate);
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
