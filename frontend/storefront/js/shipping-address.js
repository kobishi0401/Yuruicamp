// ========================================
// Yuruicamp Shipping Address (shared)
// 前台共用配送地址：資料結構、驗證、顯示、台灣縣市區
// ========================================
(function () {
  'use strict';

  /** 台灣縣市 → 行政區對照表 / Taiwan city → district map */
  var TW_CITY_DISTRICTS = {
    '臺北市': ['中正區', '大同區', '中山區', '松山區', '大安區', '萬華區', '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區'],
    '新北市': ['板橋區', '三重區', '中和區', '永和區', '新莊區', '新店區', '樹林區', '鶯歌區', '三峽區', '淡水區', '汐止區', '瑞芳區'],
    '桃園市': ['桃園區', '中壢區', '平鎮區', '八德區', '楊梅區', '蘆竹區', '大溪區', '龍潭區', '龜山區', '大園區', '觀音區', '新屋區', '復興區'],
    '臺中市': ['中區', '東區', '南區', '西區', '北區', '西屯區', '南屯區', '北屯區', '豐原區', '東勢區', '大甲區', '清水區', '沙鹿區', '梧棲區', '后里區', '神岡區', '潭子區', '大雅區', '大肚區', '龍井區', '霧峰區', '太平區', '烏日區', '新社區', '石岡區', '外埔區', '大安區', '和平區'],
    '臺南市': ['中西區', '東區', '南區', '北區', '安平區', '安南區', '永康區', '歸仁區', '新化區', '善化區', '新市區', '安定區'],
    '高雄市': ['新興區', '前金區', '苓雅區', '鹽埕區', '鼓山區', '旗津區', '前鎮區', '三民區', '左營區', '楠梓區', '小港區', '鳳山區'],
    '基隆市': ['仁愛區', '信義區', '中正區', '中山區', '安樂區', '暖暖區', '七堵區'],
    '新竹市': ['東區', '北區', '香山區'],
    '新竹縣': ['竹北市', '竹東鎮', '新埔鎮', '關西鎮', '湖口鄉', '芎林鄉'],
    '苗栗縣': ['苗栗市', '頭份市', '竹南鎮', '後龍鎮', '通霄鎮', '苑裡鎮'],
    '彰化縣': ['彰化市', '員林市', '和美鎮', '鹿港鎮', '溪湖鎮', '二林鎮'],
    '南投縣': ['南投市', '埔里鎮', '草屯鎮', '竹山鎮', '集集鎮', '名間鄉'],
    '雲林縣': ['斗六市', '斗南鎮', '虎尾鎮', '西螺鎮', '土庫鎮', '北港鎮'],
    '嘉義市': ['東區', '西區'],
    '嘉義縣': ['太保市', '朴子市', '布袋鎮', '大林鎮', '民雄鄉', '水上鄉'],
    '屏東縣': ['屏東市', '潮州鎮', '東港鎮', '恆春鎮', '內埔鄉', '萬丹鄉'],
    '宜蘭縣': ['宜蘭市', '羅東鎮', '蘇澳鎮', '頭城鎮', '礁溪鄉', '冬山鄉'],
    '花蓮縣': ['花蓮市', '玉里鎮', '新城鄉', '吉安鄉', '壽豐鄉', '鳳林鎮'],
    '臺東縣': ['臺東市', '成功鎮', '關山鎮', '卑南鄉', '鹿野鄉', '池上鄉'],
    '澎湖縣': ['馬公市', '湖西鄉', '白沙鄉', '西嶼鄉', '望安鄉', '七美鄉'],
    '金門縣': ['金城鎮', '金湖鎮', '金沙鎮', '金寧鄉', '烈嶼鄉', '烏坵鄉'],
    '連江縣': ['南竿鄉', '北竿鄉', '莒光鄉', '東引鄉'],
  };

  function normalizeTwCityName(city) {
    return String(city || '').trim().replace(/^台/, '臺');
  }

  /** 3 碼郵遞區號 lookup（縣市 + 行政區）/ 3-digit zip by city + district */
  function lookupDistrictZip(city, district) {
    var table = window.TW_DISTRICT_ZIP || {};
    var cityKey = normalizeTwCityName(city);
    var districtKey = String(district || '').trim();
    if (!cityKey || !districtKey || !table[cityKey]) {
      return '';
    }
    return table[cityKey][districtKey] || '';
  }

  /** 5 碼郵遞區號比對時取前 3 碼 / Compare first 3 digits when postal is 5-digit */
  function normalizePostalCodeForDistrictMatch(postalCode) {
    var value = String(postalCode || '').trim();
    if (/^\d{5}$/.test(value)) {
      return value.substring(0, 3);
    }
    return value;
  }

  function normalizePhoneValue(phone) {
    return String(phone || '').replace(/[\s\-()]/g, '').trim();
  }

  /** 顯示用電話：純數字，不加 - 區隔 / Display phone as plain digits */
  function formatPhoneDisplay(phone) {
    return normalizePhoneValue(phone);
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cloneShippingAddress(addr) {
    addr = addr || {};
    return {
      lastName: String(addr.lastName || '').trim(),
      firstName: String(addr.firstName || '').trim(),
      postalCode: String(addr.postalCode || '').trim(),
      city: normalizeTwCityName(addr.city),
      district: String(addr.district || '').trim(),
      township: String(addr.township || '').trim(),
      addressLine1: String(addr.addressLine1 || '').trim(),
      addressLine2: String(addr.addressLine2 || '').trim(),
      email: String(addr.email || '').trim(),
      phone: normalizePhoneValue(addr.phone),
    };
  }

  function emptyShippingAddress() {
    return cloneShippingAddress(null);
  }

  function isShippingAddressEmpty(addr) {
    var a = cloneShippingAddress(addr);
    return !a.lastName && !a.firstName && !a.postalCode && !a.city &&
      !a.district && !a.township && !a.addressLine1 && !a.addressLine2 &&
      !a.email && !a.phone;
  }

  function shippingAddressEqual(a, b) {
    return JSON.stringify(cloneShippingAddress(a)) === JSON.stringify(cloneShippingAddress(b));
  }

  /** 顯示用地址行（不含郵遞區號，貼近 UI 截圖） */
  function formatAddressLine(addr) {
    var a = cloneShippingAddress(addr);
    return [a.city, a.district, a.township, a.addressLine1].filter(Boolean).join('');
  }

  /** 收件人全名（姓 + 名）/ Full recipient name for logistics snapshot */
  function formatRecipientName(addr) {
    var a = cloneShippingAddress(addr);
    return (a.lastName + a.firstName).trim();
  }

  var ECPAY_RECIPIENT_MESSAGE =
    '收件人姓名不符合綠界物流格式（僅中英文、不可含 - 或空格）。請改用中文姓名，例如「陳柏榮」。';

  /** 綠界 B2C ReceiverName 規則（與後端 EcpayReceiverNameRules 對齊） */
  function validateEcpayRecipientName(name) {
    var trimmed = String(name || '').trim();
    if (!trimmed) {
      return { ok: false, message: '請填寫收件人姓名' };
    }
    if (!/^[\u4e00-\u9fffA-Za-z]+$/.test(trimmed)) {
      return { ok: false, message: ECPAY_RECIPIENT_MESSAGE };
    }

    var chineseCount = 0;
    for (var i = 0; i < trimmed.length; ) {
      var codePoint = trimmed.codePointAt(i);
      if (codePoint >= 0x4e00 && codePoint <= 0x9fff) {
        chineseCount++;
      }
      i += codePoint > 0xffff ? 2 : 1;
    }
    var totalChars = Array.from(trimmed).length;
    var englishCount = totalChars - chineseCount;
    if (chineseCount > 0 && englishCount > 0) {
      return { ok: false, message: ECPAY_RECIPIENT_MESSAGE };
    }
    if (chineseCount > 0) {
      return chineseCount >= 2 && chineseCount <= 5
        ? { ok: true }
        : { ok: false, message: ECPAY_RECIPIENT_MESSAGE };
    }
    return englishCount >= 4 && englishCount <= 10
      ? { ok: true }
      : { ok: false, message: ECPAY_RECIPIENT_MESSAGE };
  }

  /** 收件人摘要：姓名、手機、Email（三配送方式共用） */
  function formatRecipientSummaryDisplay(addr) {
    if (isShippingAddressEmpty(addr)) {
      return '<span class="shippingAddressEmpty">尚未設定</span>';
    }
    var a = cloneShippingAddress(addr);
    var name = escapeHtml(a.lastName + a.firstName);
    var contactParts = [];
    if (a.phone) contactParts.push(escapeHtml(formatPhoneDisplay(a.phone)));
    if (a.email) contactParts.push(escapeHtml(a.email));
    var contact = contactParts.join(' · ');
    return (
      '<div class="shippingAddressLines">' +
        (name ? '<div class="shippingAddressName">' + name + '</div>' : '') +
        (contact ? '<div class="shippingAddressContact">' + contact + '</div>' : '') +
      '</div>'
    );
  }

  /** 宅配送達地址（不含姓名／聯絡方式） */
  function formatDeliveryAddressDisplay(addr) {
    if (isShippingAddressEmpty(addr)) {
      return '<span class="shippingAddressEmpty">尚未設定</span>';
    }
    var a = cloneShippingAddress(addr);
    if (!a.city && !a.addressLine1) {
      return '<span class="shippingAddressEmpty">尚未設定</span>';
    }
    var line1 = escapeHtml(formatAddressLine(a));
    var line2 = a.addressLine2 ? escapeHtml(a.addressLine2) : '';
    return (
      '<div class="shippingAddressLines">' +
        (line1 ? '<div class="shippingAddressLine">' + line1 + '</div>' : '') +
        (line2 ? '<div class="shippingAddressLine">' + line2 + '</div>' : '') +
      '</div>'
    );
  }

  /** 超商／門市取貨：只驗收件人聯絡欄位，不要求結構化地址 */
  function validateRecipientContact(addr) {
    var fieldErrors = {};
    var a = cloneShippingAddress(addr);

    if (!a.lastName) fieldErrors.shipLastName = '請填寫姓';
    if (!a.firstName) fieldErrors.shipFirstName = '請填寫名字';
    if (!a.phone) {
      fieldErrors.shipPhone = '請填寫手機';
    } else if (typeof window.isValidMobile === 'function' && !window.isValidMobile(a.phone)) {
      fieldErrors.shipPhone = '手機須為 09 開頭的 10 碼數字（例：0988744144）';
    }
    if (!a.email) {
      fieldErrors.shipEmail = '請填寫電子郵件';
    } else if (typeof window.isValidEmail === 'function' && !window.isValidEmail(a.email)) {
      fieldErrors.shipEmail = '電子郵件格式不正確';
    }

    var errorList = Object.keys(fieldErrors).map(function (key) {
      return fieldErrors[key];
    });
    return { ok: errorList.length === 0, fieldErrors: fieldErrors, errors: errorList };
  }

  /** 展開區顯示用 HTML：姓名粗體、地址、電話 · Email */
  function formatShippingAddressDisplay(addr) {
    if (isShippingAddressEmpty(addr)) {
      return '<span class="shippingAddressEmpty">尚未設定</span>';
    }
    var a = cloneShippingAddress(addr);
    var name = escapeHtml(a.lastName + a.firstName);
    var line1 = escapeHtml(formatAddressLine(a));
    var line2 = a.addressLine2 ? escapeHtml(a.addressLine2) : '';
    var contactParts = [];
    if (a.phone) contactParts.push(escapeHtml(formatPhoneDisplay(a.phone)));
    if (a.email) contactParts.push(escapeHtml(a.email));
    var contact = contactParts.join(' · ');
    return (
      '<div class="shippingAddressLines">' +
        (name ? '<div class="shippingAddressName">' + name + '</div>' : '') +
        (line1 ? '<div class="shippingAddressLine">' + line1 + '</div>' : '') +
        (line2 ? '<div class="shippingAddressLine">' + line2 + '</div>' : '') +
        (contact ? '<div class="shippingAddressContact">' + contact + '</div>' : '') +
      '</div>'
    );
  }

  function getTwCityNames() {
    return Object.keys(TW_CITY_DISTRICTS).sort(function (a, b) {
      return a.localeCompare(b, 'zh-Hant');
    });
  }

  function validateShippingAddress(addr) {
    var fieldErrors = {};
    var a = cloneShippingAddress(addr);

    if (isShippingAddressEmpty(a)) {
      fieldErrors.shipAddressLine1 = '請填寫配送地址';
      return {
        ok: false,
        fieldErrors: fieldErrors,
        errors: Object.values(fieldErrors),
      };
    }

    if (!a.lastName) fieldErrors.shipLastName = '請填寫姓';
    if (!a.firstName) fieldErrors.shipFirstName = '請填寫名字';
    if (!a.postalCode) {
      fieldErrors.shipPostalCode = '請填寫郵遞區號';
    } else if (typeof window.isValidPostalCode === 'function' && !window.isValidPostalCode(a.postalCode)) {
      fieldErrors.shipPostalCode = '郵遞區號須為 3 碼或 5 碼數字（例：701 或 70156）';
    }
    if (!a.city) fieldErrors.shipCity = '請選擇縣/市';
    if (!a.district) fieldErrors.shipDistrict = '請選擇區';
    if (!a.addressLine1) fieldErrors.shipAddressLine1 = '請填寫地址';
    if (!a.phone) {
      fieldErrors.shipPhone = '請填寫手機';
    } else if (typeof window.isValidMobile === 'function' && !window.isValidMobile(a.phone)) {
      fieldErrors.shipPhone = '手機須為 09 開頭的 10 碼數字（例：0988744144）';
    }
    if (!a.email) {
      fieldErrors.shipEmail = '請填寫電子郵件';
    } else if (typeof window.isValidEmail === 'function' && !window.isValidEmail(a.email)) {
      fieldErrors.shipEmail = '電子郵件格式不正確';
    }

    var errorList = Object.keys(fieldErrors).map(function (key) {
      return fieldErrors[key];
    });
    return { ok: errorList.length === 0, fieldErrors: fieldErrors, errors: errorList };
  }

  /**
   * 宅配專用：完整地址 + 郵遞區號須與所選行政區一致（綠界 TCAT）。
   * Home delivery: full address + postal code must match selected district.
   */
  function validateEcpayHomeAddress(addr) {
    var result = validateShippingAddress(addr);
    if (!result.ok) {
      return result;
    }
    var a = cloneShippingAddress(addr);
    var expectedZip = lookupDistrictZip(a.city, a.district);
    if (expectedZip) {
      var actualZip = normalizePostalCodeForDistrictMatch(a.postalCode);
      if (actualZip !== expectedZip) {
        var fieldErrors = Object.assign({}, result.fieldErrors, {
          shipPostalCode: '郵遞區號與所選區域不符（' + a.district + ' 應為 ' + expectedZip + '）',
        });
        return {
          ok: false,
          fieldErrors: fieldErrors,
          errors: Object.keys(fieldErrors).map(function (key) { return fieldErrors[key]; }),
        };
      }
    }
    return result;
  }

  /** 從舊版單行 address 字串遷移（相容 yurui_profile.address） */
  function migrateLegacyAddressString(text) {
    var value = String(text || '').trim();
    if (!value) return emptyShippingAddress();
    return cloneShippingAddress({ addressLine1: value });
  }

  function resolveShippingAddress(user, profile) {
    profile = profile || {};
    if (user && user.shippingAddress && !isShippingAddressEmpty(user.shippingAddress)) {
      return cloneShippingAddress(user.shippingAddress);
    }
    if (profile.shippingAddress && !isShippingAddressEmpty(profile.shippingAddress)) {
      return cloneShippingAddress(profile.shippingAddress);
    }
    if (profile.address) {
      return migrateLegacyAddressString(profile.address);
    }
    return emptyShippingAddress();
  }

  window.YuruiShippingAddress = {
    TW_CITY_DISTRICTS: TW_CITY_DISTRICTS,
    TW_DISTRICT_ZIP: window.TW_DISTRICT_ZIP || {},
    clone: cloneShippingAddress,
    empty: emptyShippingAddress,
    isEmpty: isShippingAddressEmpty,
    equal: shippingAddressEqual,
    validate: validateShippingAddress,
    validateEcpayHomeAddress: validateEcpayHomeAddress,
    lookupDistrictZip: lookupDistrictZip,
    formatDisplay: formatShippingAddressDisplay,
    formatRecipientName: formatRecipientName,
    formatRecipientSummary: formatRecipientSummaryDisplay,
    formatDeliveryAddress: formatDeliveryAddressDisplay,
    validateRecipientContact: validateRecipientContact,
    validateEcpayRecipientName: validateEcpayRecipientName,
    ecpayRecipientMessage: ECPAY_RECIPIENT_MESSAGE,
    formatAddressLine: formatAddressLine,
    formatPhoneDisplay: formatPhoneDisplay,
    normalizeCity: normalizeTwCityName,
    getCityNames: getTwCityNames,
    getDistricts: function (city) {
      return TW_CITY_DISTRICTS[normalizeTwCityName(city)] || [];
    },
    migrateLegacy: migrateLegacyAddressString,
    resolve: resolveShippingAddress,
  };

  /** 更新 formatShippingAddressLine 使用共用邏輯 */
  window.formatShippingAddressLine = function (addr) {
    if (!addr || typeof addr !== 'object') return String(addr || '').trim();
    var a = cloneShippingAddress(addr);
    var parts = [
      a.postalCode,
      a.city,
      a.district,
      a.township,
      a.addressLine1,
      a.addressLine2,
    ].filter(Boolean);
    return parts.join(' ').trim();
  };

  console.log('✓ Shipping Address 已初始化');
})();
