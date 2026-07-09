// ========================================
// BookingAvailability — Zone 級可用性計算
// Mock 契約與未來 SQL 查詢對齊；不另存日曆矩陣
// ========================================

(function (global) {
  'use strict';

  var DEFAULT_POLICY = {
    bookingWindowDays: 90,
    minLeadDays: 0,
    maxStayNights: 7,
    occupyingStatuses: ['pending', 'confirmed', 'completed'],
    dateRule: { checkInInclusive: true, checkOutExclusive: true },
    availabilityStatus: { lowThresholdRatio: 0.3 },
  };

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /** Date → 'YYYY-MM-DD' / Format date to ISO date string */
  function formatISODate(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  /** 'YYYY-MM-DD' → Date（本地午夜）/ Parse ISO date at local midnight */
  function parseISODate(str) {
    if (!str) return null;
    var parts = String(str).split('-');
    if (parts.length !== 3) return null;
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  /** 加減天數 / Add days to a date */
  function addDays(date, days) {
    var d = new Date(date.getTime());
    d.setDate(d.getDate() + days);
    return d;
  }

  /** 今天 ISO 字串 / Today's ISO date */
  function todayISO() {
    return formatISODate(new Date());
  }

  /**
   * 列舉住宿夜晚（左閉右開 [checkIn, checkOut)）
   * Enumerate stay nights: check-in inclusive, check-out exclusive
   */
  function eachStayDate(checkIn, checkOut) {
    var start = parseISODate(checkIn);
    var end = parseISODate(checkOut);
    if (!start || !end || start >= end) return [];

    var dates = [];
    var cursor = new Date(start.getTime());
    while (cursor < end) {
      dates.push(formatISODate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  /**
   * 列舉日期區間（含 from、含 to）
   * Inclusive date range for calendar display
   */
  function eachDateInRange(from, to) {
    var start = parseISODate(from);
    var end = parseISODate(to);
    if (!start || !end || start > end) return [];

    var dates = [];
    var cursor = new Date(start.getTime());
    while (cursor <= end) {
      dates.push(formatISODate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  /** 合併政策與預設值 / Merge policy with defaults */
  function normalizePolicy(policy) {
    policy = policy || {};
    return {
      bookingWindowDays: policy.bookingWindowDays != null ? policy.bookingWindowDays : DEFAULT_POLICY.bookingWindowDays,
      minLeadDays: policy.minLeadDays != null ? policy.minLeadDays : DEFAULT_POLICY.minLeadDays,
      maxStayNights: policy.maxStayNights != null ? policy.maxStayNights : DEFAULT_POLICY.maxStayNights,
      occupyingStatuses: policy.occupyingStatuses || DEFAULT_POLICY.occupyingStatuses.slice(),
      dateRule: Object.assign({}, DEFAULT_POLICY.dateRule, policy.dateRule || {}),
      availabilityStatus: Object.assign({}, DEFAULT_POLICY.availabilityStatus, policy.availabilityStatus || {}),
      timezone: policy.timezone || 'Asia/Taipei',
    };
  }

  /**
   * 建立 zoneId 索引
   * Build zone lookup: zoneId → zone + campground meta
   */
  function buildZoneIndex(campgrounds) {
    var index = {};
    (campgrounds || []).forEach(function (camp) {
      (camp.zones || []).forEach(function (zone) {
        index[zone.zoneId] = {
          zoneId: zone.zoneId,
          campgroundId: camp.campgroundId,
          campgroundName: camp.name,
          region: camp.region,
          type: zone.type,
          capacityPerSite: zone.capacityPerSite,
          priceWeekday: zone.priceWeekday,
          priceHoliday: zone.priceHoliday,
          totalSites: zone.totalSites,
        };
      });
    });
    return index;
  }

  /** 預約窗口 { minDate, maxDate } / Bookable date window */
  function getBookingWindow(policy, refDate) {
    policy = normalizePolicy(policy);
    var base = refDate ? new Date(refDate.getTime()) : new Date();
    base.setHours(0, 0, 0, 0);
    var min = addDays(base, policy.minLeadDays);
    var max = addDays(base, policy.bookingWindowDays);
    return { minDate: formatISODate(min), maxDate: formatISODate(max) };
  }

  /** 日期是否在預約窗口內 / Check if date is within booking window */
  function isWithinBookingWindow(dateISO, policy, refDate) {
    var win = getBookingWindow(policy, refDate);
    return dateISO >= win.minDate && dateISO <= win.maxDate;
  }

  /** 預約是否佔用庫存 / Whether booking occupies inventory */
  function isOccupyingBooking(booking, policy) {
    policy = normalizePolicy(policy);
    return policy.occupyingStatuses.indexOf(booking.status) !== -1;
  }

  /** 某晚某 zone 的預約佔用量 / Occupied count for one zone on one night */
  function getOccupiedCount(zoneId, dateISO, bookings, policy) {
    policy = normalizePolicy(policy);
    var total = 0;

    (bookings || []).forEach(function (b) {
      if (!isOccupyingBooking(b, policy)) return;
      var info = b.bookingInfo || {};
      if (dateISO < info.checkIn || dateISO >= info.checkOut) return;

      (b.selectedZones || []).forEach(function (z) {
        if (z.zoneId === zoneId) {
          total += Number(z.quantity) || 0;
        }
      });
    });

    return total;
  }

  /** 某晚某 zone 的停售扣量 / Blocked sites for one zone on one night */
  function getBlockedCount(zoneId, dateISO, blocks) {
    var total = 0;
    (blocks || []).forEach(function (blk) {
      if (blk.zoneId !== zoneId) return;
      if (dateISO < blk.startDate || dateISO >= blk.endDate) return;
      total += Number(blk.blockedSites) || 0;
    });
    return total;
  }

  /**
   * 營區當晚是否公休（含指定日期與每週固定）
   * Campground closed on a night (date_range or weekly)
   */
  function isCampgroundClosed(campgroundId, dateISO, closures) {
    if (!campgroundId || !dateISO) return false;
    var parsed = parseISODate(dateISO);
    if (!parsed) return false;
    var dow = parsed.getDay();

    return (closures || []).some(function (cl) {
      if (cl.campgroundId !== campgroundId) return false;
      var type = cl.type || 'date_range';

      if (type === 'weekly') {
        if (Number(cl.dayOfWeek) !== dow) return false;
        if (cl.effectiveFrom && dateISO < cl.effectiveFrom) return false;
        if (cl.effectiveTo && dateISO > cl.effectiveTo) return false;
        return true;
      }

      // date_range：左閉右開 [startDate, endDate)
      var start = cl.startDate;
      var end = cl.endDate;
      if (!start || !end) return false;
      return dateISO >= start && dateISO < end;
    });
  }

  /** 取得公休原因文字（供 UI 顯示）/ Closure reason for display */
  function getClosureReason(campgroundId, dateISO, closures) {
    if (!isCampgroundClosed(campgroundId, dateISO, closures)) return '';
    var parsed = parseISODate(dateISO);
    var dow = parsed ? parsed.getDay() : -1;

    var hit = (closures || []).find(function (cl) {
      if (cl.campgroundId !== campgroundId) return false;
      var type = cl.type || 'date_range';
      if (type === 'weekly') {
        return Number(cl.dayOfWeek) === dow &&
          (!cl.effectiveFrom || dateISO >= cl.effectiveFrom) &&
          (!cl.effectiveTo || dateISO <= cl.effectiveTo);
      }
      return dateISO >= cl.startDate && dateISO < cl.endDate;
    });
    return hit ? (hit.reason || '公休') : '公休';
  }

  /** 單日可用性資訊 / Single-day availability info for one zone */
  function getDayInfo(zoneId, dateISO, ctx) {
    ctx = ctx || {};
    var zone = (ctx.zonesById || {})[zoneId];
    if (!zone) return null;

    var capacity = zone.totalSites || 0;
    var refDate = ctx.refDate || null;

    if (isCampgroundClosed(zone.campgroundId, dateISO, ctx.closures)) {
      return {
        date: dateISO,
        remaining: 0,
        booked: 0,
        blocked: 0,
        capacity: capacity,
        status: 'closed',
        closureReason: getClosureReason(zone.campgroundId, dateISO, ctx.closures),
      };
    }

    var booked = getOccupiedCount(zoneId, dateISO, ctx.bookings, ctx.policy);
    var blocked = getBlockedCount(zoneId, dateISO, ctx.blocks);
    var remaining = Math.max(capacity - booked - blocked, 0);

    return {
      date: dateISO,
      remaining: remaining,
      booked: booked,
      blocked: blocked,
      capacity: capacity,
      status: getDayStatus(remaining, capacity, dateISO, ctx.policy, refDate),
      closureReason: '',
    };
  }

  /** 狀態分級 / Availability status label */
  function getDayStatus(remaining, capacity, dateISO, policy, refDate, isClosed) {
    if (isClosed) return 'closed';
    if (!isWithinBookingWindow(dateISO, policy, refDate)) {
      return 'out_of_window';
    }
    if (remaining <= 0) return 'full';
    policy = normalizePolicy(policy);
    var ratio = capacity > 0 ? remaining / capacity : 0;
    if (ratio <= policy.availabilityStatus.lowThresholdRatio) return 'low';
    return 'available';
  }

  /**
   * 某晚剩餘營位
   * Remaining sites for one zone on one night
   */
  function getRemainingSites(zoneId, dateISO, ctx) {
    var info = getDayInfo(zoneId, dateISO, ctx);
    return info ? info.remaining : 0;
  }

  /** 某晚是否公休 / Whether zone's campground is closed */
  function isZoneClosed(zoneId, dateISO, ctx) {
    ctx = ctx || {};
    var zone = (ctx.zonesById || {})[zoneId];
    if (!zone) return false;
    return isCampgroundClosed(zone.campgroundId, dateISO, ctx.closures);
  }

  /**
   * 日期區間內每晚最低剩餘（用於 range 預約驗證）
   * Minimum remaining across all nights in a stay range
   */
  function getMinRemainingInRange(zoneId, checkIn, checkOut, ctx) {
    var nights = eachStayDate(checkIn, checkOut);
    if (!nights.length) return 0;

    var min = Infinity;
    var hasClosed = false;
    nights.forEach(function (dateISO) {
      if (isZoneClosed(zoneId, dateISO, ctx)) {
        hasClosed = true;
        min = 0;
        return;
      }
      var rem = getRemainingSites(zoneId, dateISO, ctx);
      if (rem < min) min = rem;
    });
    if (hasClosed) return 0;
    return min === Infinity ? 0 : min;
  }

  /**
   * 可用性區間 DTO（Admin 日曆 / API 回傳格式）
   * Availability range DTO for calendar and API
   */
  function getAvailabilityRange(params, ctx) {
    params = params || {};
    ctx = ctx || {};
    var zoneId = params.zoneId;
    var zone = (ctx.zonesById || {})[zoneId];
    if (!zone) {
      return { campgroundId: params.campgroundId, zoneId: zoneId, capacity: 0, days: [] };
    }

    var capacity = zone.totalSites || 0;
    var from = params.from;
    var to = params.to;
    var refDate = ctx.refDate || null;

    var days = eachDateInRange(from, to).map(function (dateISO) {
      return getDayInfo(zoneId, dateISO, ctx);
    }).filter(Boolean);

    return {
      campgroundId: zone.campgroundId,
      zoneId: zoneId,
      zoneType: zone.type,
      from: from,
      to: to,
      capacity: capacity,
      days: days,
    };
  }

  /**
   * 營區「全部」營位類型加總可用性
   * Aggregated availability for all zones in a campground
   */
  function getCampgroundAggregatedRange(campgroundId, from, to, ctx, zones) {
    ctx = ctx || {};
    zones = zones || [];
    var dates = eachDateInRange(from, to);
    var totalCapacity = zones.reduce(function (sum, z) {
      return sum + (Number(z.totalSites) || 0);
    }, 0);

    var days = dates.map(function (dateISO) {
      if (isCampgroundClosed(campgroundId, dateISO, ctx.closures)) {
        return {
          date: dateISO,
          remaining: 0,
          booked: 0,
          blocked: 0,
          capacity: totalCapacity,
          status: 'closed',
          closureReason: getClosureReason(campgroundId, dateISO, ctx.closures),
        };
      }

      var booked = 0;
      var blocked = 0;
      var remaining = 0;
      zones.forEach(function (zone) {
        booked += getOccupiedCount(zone.zoneId, dateISO, ctx.bookings, ctx.policy);
        blocked += getBlockedCount(zone.zoneId, dateISO, ctx.blocks);
        remaining += getRemainingSites(zone.zoneId, dateISO, ctx);
      });

      return {
        date: dateISO,
        remaining: remaining,
        booked: booked,
        blocked: blocked,
        capacity: totalCapacity,
        status: getDayStatus(remaining, totalCapacity, dateISO, ctx.policy, ctx.refDate),
        closureReason: '',
      };
    });

    return {
      campgroundId: campgroundId,
      zoneId: '__ALL__',
      zoneType: '全部',
      from: from,
      to: to,
      capacity: totalCapacity,
      days: days,
    };
  }

  /**
   * 列出某晚佔用營區（可選單一 zone）的預約
   * List bookings for a campground night, optionally filtered by zone
   */
  function getBookingsForCampgroundNight(campgroundId, dateISO, bookings, policy, zoneId) {
    policy = normalizePolicy(policy);
    return (bookings || []).filter(function (b) {
      if (!isOccupyingBooking(b, policy)) return false;
      var info = b.bookingInfo || {};
      if (info.campgroundId !== campgroundId) return false;
      if (dateISO < info.checkIn || dateISO >= info.checkOut) return false;
      return (b.selectedZones || []).some(function (z) {
        if (zoneId && zoneId !== '__ALL__' && z.zoneId !== zoneId) return false;
        return (Number(z.quantity) || 0) > 0;
      });
    });
  }

  /**
   * 列出某晚佔用某 zone 的預約
   * List bookings occupying a zone on a specific night
   */
  function getBookingsForNight(zoneId, dateISO, bookings, policy) {
    policy = normalizePolicy(policy);
    return (bookings || []).filter(function (b) {
      if (!isOccupyingBooking(b, policy)) return false;
      var info = b.bookingInfo || {};
      if (dateISO < info.checkIn || dateISO >= info.checkOut) return false;
      return (b.selectedZones || []).some(function (z) {
        return z.zoneId === zoneId && (Number(z.quantity) || 0) > 0;
      });
    });
  }

  /** 住宿區間是否有公休夜 / Any closed night in stay range */
  function hasClosedNightInRange(campgroundId, checkIn, checkOut, ctx) {
    return eachStayDate(checkIn, checkOut).some(function (dateISO) {
      return isCampgroundClosed(campgroundId, dateISO, ctx.closures);
    });
  }

  /**
   * 建立完整計算上下文
   * Build full availability context from raw data
   */
  function buildContext(campgrounds, bookings, blocks, policy, refDate, closures) {
    return {
      zonesById: buildZoneIndex(campgrounds),
      campgrounds: campgrounds || [],
      bookings: bookings || [],
      blocks: blocks || [],
      closures: closures || [],
      policy: normalizePolicy(policy),
      refDate: refDate || null,
    };
  }

  var BookingAvailability = {
    DEFAULT_POLICY: DEFAULT_POLICY,
    formatISODate: formatISODate,
    parseISODate: parseISODate,
    addDays: addDays,
    todayISO: todayISO,
    eachStayDate: eachStayDate,
    eachDateInRange: eachDateInRange,
    normalizePolicy: normalizePolicy,
    buildZoneIndex: buildZoneIndex,
    getBookingWindow: getBookingWindow,
    isWithinBookingWindow: isWithinBookingWindow,
    isOccupyingBooking: isOccupyingBooking,
    getOccupiedCount: getOccupiedCount,
    getBlockedCount: getBlockedCount,
    isCampgroundClosed: isCampgroundClosed,
    getClosureReason: getClosureReason,
    getDayInfo: getDayInfo,
    isZoneClosed: isZoneClosed,
    getDayStatus: getDayStatus,
    getRemainingSites: getRemainingSites,
    getMinRemainingInRange: getMinRemainingInRange,
    hasClosedNightInRange: hasClosedNightInRange,
    getAvailabilityRange: getAvailabilityRange,
    getCampgroundAggregatedRange: getCampgroundAggregatedRange,
    getBookingsForNight: getBookingsForNight,
    getBookingsForCampgroundNight: getBookingsForCampgroundNight,
    buildContext: buildContext,
  };

  global.BookingAvailability = BookingAvailability;
})(typeof window !== 'undefined' ? window : this);

console.log('✓ BookingAvailability 已初始化');
