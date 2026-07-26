/**
 * admin/js/id-utils.js
 * 後台編號工具：資料層用純數字 id，畫面顯示才加前綴
 * Admin ID helpers — numeric PK in data, prefixed label in UI
 *
 * 範例 Example:
 *   資料 data:     { id: 1 }
 *   畫面 display:  ORD-0001
 */

(function (global) {
  'use strict';

  /** 各模組編號前綴 / Prefix per entity type */
  var ID_PREFIX = {
    order: 'ORD',
    booking: 'BK',
    movement: 'MOV',
    conversion: 'CVT'
  };

  /** 顯示用零補位數（4 位 → 0001）/ Zero-pad width for display codes */
  var DISPLAY_PAD = 4;

  /** 庫存異動／轉換顯示用補零（3 位 → 015；超過自然變長） */
  var MOVEMENT_DISPLAY_PAD = 3;

  /**
   * 從 id 取出數字（支援舊字串格式 ORD-0001 或純數字 1）
   * Parse numeric part from id (legacy string or number)
   * @param {number|string|null|undefined} id
   * @returns {number|null}
   */
  function parseNumericId(id) {
    if (id === null || id === undefined || id === '') {
      return null;
    }
    if (typeof id === 'number' && !isNaN(id)) {
      return id;
    }
    var str = String(id).trim();
    if (/^\d+$/.test(str)) {
      return parseInt(str, 10);
    }
    // 舊格式：ORD-0001、BK-0022、MV-0082
    var match = str.match(/(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * 格式化顯示編號：優先 API displayNo；已含前綴則原樣；否則 prefix + 零補位
   * Format display code — prefer displayNo from entity; pass through prefixed ids
   * @param {string} prefix
   * @param {number|string|{id?:*,displayNo?:string}|null|undefined} idOrEntity
   * @param {string} [displayNoOverride]
   * @returns {string}
   */
  function formatDisplayId(prefix, idOrEntity, displayNoOverride) {
    if (displayNoOverride) {
      return String(displayNoOverride).trim();
    }
    if (idOrEntity && typeof idOrEntity === 'object') {
      if (idOrEntity.displayNo) {
        return String(idOrEntity.displayNo).trim();
      }
      idOrEntity = idOrEntity.id;
    }
    var str = idOrEntity === null || idOrEntity === undefined ? '' : String(idOrEntity).trim();
    if (!str) return '';
    if (new RegExp('^' + prefix + '-', 'i').test(str)) {
      return prefix + '-' + str.slice(str.indexOf('-') + 1);
    }
    var num = parseNumericId(idOrEntity);
    if (num === null) {
      return str;
    }
    return prefix + '-' + String(num).padStart(DISPLAY_PAD, '0');
  }

  /** 訂單顯示編號 / Order display code */
  function formatOrderId(idOrEntity, displayNo) {
    return formatDisplayId(ID_PREFIX.order, idOrEntity, displayNo);
  }

  /** 預約顯示編號 / Booking display code */
  function formatBookingId(idOrEntity, displayNo) {
    return formatDisplayId(ID_PREFIX.booking, idOrEntity, displayNo);
  }

  /**
   * 庫存異動顯示編號 MOV-015（用 DB id；補零 3 位）
   * Movement display code MOV-015 (DB id, pad 3)
   */
  function formatMovementId(id) {
    var num = parseNumericId(id);
    if (num === null) {
      return String(id || '');
    }
    return ID_PREFIX.movement + '-' + String(num).padStart(MOVEMENT_DISPLAY_PAD, '0');
  }

  /**
   * 轉換配對顯示編號 CVT-065（用 conversion id；補零 3 位）
   * Conversion pair display code CVT-065
   */
  function formatConversionId(id) {
    var num = parseNumericId(id);
    if (num === null) {
      return String(id || '');
    }
    return ID_PREFIX.conversion + '-' + String(num).padStart(MOVEMENT_DISPLAY_PAD, '0');
  }

  /**
   * 後台時間顯示：台北時區 yyyy-MM-dd HH:mm
   * Admin datetime display in Asia/Taipei
   */
  function formatAdminDateTimeDisplay(value) {
    if (value == null || value === '') {
      return '—';
    }
    var date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) {
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

  /**
   * 安全比對兩個 id（避免 1 !== "1"）
   * Safe equality for numeric ids from JSON vs jQuery data-*
   * @param {*} a
   * @param {*} b
   * @returns {boolean}
   */
  function sameId(a, b) {
    var na = parseNumericId(a);
    var nb = parseNumericId(b);
    if (na !== null && nb !== null) {
      return na === nb;
    }
    return String(a) === String(b);
  }

  /**
   * 從紀錄陣列取最大數字 id
   * Get max numeric id from record list
   * @param {Array} records
   * @returns {number}
   */
  function getMaxNumericId(records) {
    var max = 0;
    (records || []).forEach(function (record) {
      var num = parseNumericId(record && record.id);
      if (num !== null && num > max) {
        max = num;
      }
    });
    return max;
  }

  /** 下一筆訂單 id（純數字）/ Next order id */
  function getNextOrderId(orders) {
    return getMaxNumericId(orders) + 1;
  }

  /** 下一筆預約 id（純數字）/ Next booking id */
  function getNextBookingId(bookings) {
    return getMaxNumericId(bookings) + 1;
  }

  /** 下一筆庫存異動 id（純數字）/ Next movement id */
  function getNextMovementId(records) {
    return getMaxNumericId(records) + 1;
  }

  // 掛到 window，供各模組使用 / Expose on window for admin modules
  global.parseNumericId = parseNumericId;
  global.formatOrderId = formatOrderId;
  global.formatBookingId = formatBookingId;
  global.formatMovementId = formatMovementId;
  global.formatConversionId = formatConversionId;
  global.formatAdminDateTimeDisplay = formatAdminDateTimeDisplay;
  global.sameId = sameId;
  global.getNextOrderId = getNextOrderId;
  global.getNextBookingId = getNextBookingId;
  global.getNextMovementId = getNextMovementId;
})(window);
