(function () {
  'use strict';
  var cfg = Object.assign(
    {
      authStorageKey: 'currentUser',
      fallbackAuthStorageKey: 'yuruiUser',
      homeHref: 'home.html',
      requireLogin: true,
      lockGoogleEmail: false,
    },
    window.MemberCenterConfig || {}
  );
  // Canonical status enums（與 commerce JSON / schema-enums 對齊）
  var statusMeta = {
    purchase: [
      ['all', '全部', ''],
      ['unshipped', '待出貨', 'isPending'],
      ['shipped', '已出貨', 'isUpcoming'],
      ['completed', '已完成', 'isDone'],
      ['returned', '已退貨', 'isCancelled'],
      ['cancelled', '已取消', 'isCancelled'],
    ],
    rental: [
      ['all', '全部', ''],
      ['pending', '待確認', 'isPending'],
      ['confirmed', '已確認', 'isUpcoming'],
      ['completed', '已完成', 'isDone'],
      ['cancelled', '已取消', 'isCancelled'],
    ],
  };
  // 過渡相容：舊別名 → canonical（資料已正規化後可再刪）
  var aliases = {
    purchase: { processing: 'unshipped', delivered: 'completed' },
    rental: { processing: 'pending', shipped: 'confirmed', delivered: 'completed', refunded: 'cancelled' },
  };
  var stylePrefs = [
    'glamping',
    'backpacking',
    'family',
    'solo',
    'hiking',
    'car-camping',
    'ultralight',
    'base-camp',
  ];
  var gearPrefs = [
    'tent',
    'sleeping-bag',
    'backpack',
    'cooking',
    'lighting',
    'clothing',
    'chair',
    'navigation',
    'safety',
    'photography',
  ];
  var state = {
    user: null,
    orders: [],
    rentalOrders: [],
    availableCoupons: [],
    notifications: [],
    reviews: [],
    filters: { purchase: 'all', rental: 'all' },
    review: { orderId: '', itemName: '', rating: 0, files: [] },
    lastFocus: null,
    initialized: false,
    dataLoading: false,
    dataReloadQueued: false,
    refreshEventsBound: false,
  };

  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function parse(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function html(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function text(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value == null ? '' : String(value);
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function input(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value == null ? '' : String(value);
  }

  function minimumAdultBirthday() {
    var cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 18);
    var year = cutoff.getFullYear();
    var month = String(cutoff.getMonth() + 1).padStart(2, '0');
    var day = String(cutoff.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function registeredDate(value) {
    return value ? String(value).slice(0, 10) : '--';
  }

  /** 商城／預約列表日期：統一 YYYY-MM-DD（對齊後台訂單列表） */
  function commerceDate(value) {
    if (!value) return '--';
    return String(value).split(/[ T]/)[0] || '--';
  }

  // 依 Firebase 或會員資料判斷目前登入管道，沒有資料時保持欄位可編輯。
  function currentAuthProvider() {
    var firebaseUser = window.YuruiFirebase?.getAuth?.()?.currentUser;
    var firebaseProvider =
      firebaseUser &&
      Array.isArray(firebaseUser.providerData) &&
      firebaseUser.providerData.find(function (item) {
        return item && item.providerId;
      });
    var currentUser = loginUser();
    var provider =
      (currentUser && (currentUser.provider || currentUser.authProvider)) ||
      (state.user && (state.user.provider || state.user.authProvider)) ||
      (firebaseProvider && firebaseProvider.providerId) ||
      '';

    return String(provider).trim().toLowerCase();
  }

  // Booking 會員中心的 Google 信箱由登入帳號管理，不允許在個人資料表單修改。
  function isGoogleProfileEmailLocked() {
    var provider = currentAuthProvider();
    return cfg.lockGoogleEmail === true && (provider === 'google' || provider === 'google.com');
  }

  // 同步 Email 欄位的唯讀狀態與無障礙說明。
  function applyProfileEmailAccess() {
    var emailInput = document.getElementById('profileEmail');
    if (!emailInput) return;
    var locked = isGoogleProfileEmailLocked();

    emailInput.readOnly = locked;
    emailInput.setAttribute('aria-readonly', String(locked));
    emailInput.setAttribute('aria-label', locked ? '電子郵件（Google 登入帳號，無法修改）' : '電子郵件');
    if (locked) emailInput.title = 'Google 登入信箱無法在此修改';
    else emailInput.removeAttribute('title');
  }

  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function money(value) {
    return 'NT$ ' + Number(value || 0).toLocaleString('zh-TW');
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function toast(message, type) {
    if (typeof window.showToast === 'function') window.showToast(message, type || 'info');
    else console.log(message);
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function orderDisplayId(order) {
    if (!order) return '--';
    if (window.formatOrderDisplayId) return window.formatOrderDisplayId(order);
    return String(order.id || order);
  }

  /** 露營預約編號 BK-0001 */
  function bookingDisplayId(booking) {
    if (!booking) return '--';
    if (window.formatBookingDisplayId) return window.formatBookingDisplayId(booking);
    return String(booking.id || booking);
  }

  function bookingTitle(booking) {
    var info = (booking && booking.bookingInfo) || {};
    return info.campgroundName || '露營預約';
  }

  function bookingAmount(booking) {
    var summary = (booking && booking.summary) || {};
    return summary.finalAmount != null ? summary.finalAmount : 0;
  }

  function bookingDetailItems(booking) {
    var zones = (booking.selectedZones || []).map(function (z) {
      var qty = Number(z.quantity) || 1;
      return {
        name: (z.zoneType || '營位') + '營位',
        quantity: qty,
        price: Math.round((Number(z.subtotal) || 0) / qty),
        image: '',
      };
    });
    var rentals = (booking.selectedRentals || []).map(function (r) {
      var qty = Number(r.quantity) || 1;
      return {
        name: r.name || '營區裝備',
        quantity: qty,
        price: Math.round((Number(r.subtotal) || 0) / qty),
        image: '',
      };
    });
    return zones.concat(rentals);
  }

  /**
   * 判斷字串是否為頭像圖片 URL（含相對路徑 ../assets/...）
   * Treat absolute, relative, and http(s) paths as image URLs (not initials).
   */
  function isAvatarImageUrl(avatar) {
    if (typeof avatar !== 'string' || !avatar) return false;
    if (/^https?:\/\//i.test(avatar) || avatar.indexOf('data:') === 0) return true;
    if (avatar.charAt(0) === '/' || avatar.indexOf('../') === 0 || avatar.indexOf('./') === 0) {
      return true;
    }
    return /\.(png|jpe?g|webp|gif|svg)(\?|#|$)/i.test(avatar);
  }

  function renderAvatarElement(el, user, fallbackName) {
    if (!el || !user) return;
    var avatar = user.avatarUrl;
    // 路徑改寫後會變 ../assets/...，不可只認「以 / 開頭」
    if (isAvatarImageUrl(avatar)) {
      var src = avatar;
      el.innerHTML = '<img src="' + html(src) + '" alt="" loading="lazy" />';
    } else {
      el.textContent = String(avatar || (fallbackName || 'U').charAt(0)).toUpperCase();
    }
  }

  /**
   * 目前登入會員：優先 YuruiAuth（Firebase session 後寫入的真實 customerId）
   * Never invent demo id U001 when only isLoggedIn flag exists.
   */
  function loginUser() {
    if (window.YuruiAuth && typeof window.YuruiAuth.getUser === 'function') {
      var authUser = window.YuruiAuth.getUser();
      if (authUser && authUser.id) return authUser;
    }
    if (window.AppState && window.AppState.isLoggedIn && window.AppState.currentUser) {
      var appUser = window.AppState.currentUser;
      if (appUser && appUser.id) return appUser;
    }
    var keys = [cfg.authStorageKey, cfg.fallbackAuthStorageKey, 'currentUser', 'yuruiUser'].filter(Boolean);
    for (var i = 0; i < keys.length; i++) {
      var u = parse(localStorage.getItem(keys[i]), null);
      if (u && u.id) return u;
    }
    return null;
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function loggedIn() {
    return cfg.requireLogin === false || Boolean(loginUser());
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function norm(type, value) {
    // purchase 預設 unshipped；rental 預設 pending
    var fallback = type === 'purchase' ? 'unshipped' : 'pending';
    return (aliases[type] && aliases[type][value]) || value || fallback;
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function meta(type, value) {
    var normalized = norm(type, value);
    var row = statusMeta[type].find(function (item) {
      return item[0] === normalized;
    });
    return row
      ? { value: row[0], label: row[1], cls: row[2] }
      : { value: normalized, label: normalized, cls: 'isPending' };
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  /** @returns {string|null} 真實 customerId；未登入為 null */
  function currentMemberId() {
    var u = loginUser();
    return u && u.id ? String(u.id) : null;
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function pointOf(order) {
    var p = Number(order && order.points);
    return Number.isFinite(p) ? p : Math.ceil((Number(order && order.subtotal) || 0) * 0.1);
  }
  // 用途：將訂單付款代碼轉為會員明細可讀文字。
  function paymentLabel(value) {
    var labels = {
      'ecpay-credit': '線上付款（綠界信用卡）',
      'ecpay-atm': '線上付款（綠界 ATM）',
      'ecpay-cvs': '線上付款（綠界超商）',
      'ecpay-other': '線上付款（綠界）',
      'credit-card': '線上付款（綠界信用卡）', // legacy mock alias
      'line-pay': '線上付款（綠界）', // legacy mock alias
      cod: '貨到付款',
      transfer: '銀行轉帳',
    };
    return labels[value] || value || '--';
  }
  // 用途：將物流與門市欄位整理成明細資訊列。
  function fulfillmentLabel(order, type) {
    if (type === 'rental') {
      var info = (order && order.bookingInfo) || {};
      return '營地：' + (info.campgroundName || '--') + '（' + (info.region || '--') + '）';
    }
    if (order.shippingMethod === 'store') return '取貨門市：' + (order.storeAddress || order.address || '--');
    return '配送地址：' + (order.address || order.storeAddress || '--');
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function prefValues(p) {
    if (Array.isArray(p)) return p.filter(Boolean);
    if (typeof p === 'string' && p) return [p];
    if (!p || typeof p !== 'object') return [];
    return []
      .concat(p.styles || [])
      .concat(p.equipment || [])
      .filter(Boolean);
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function prefObject(values) {
    var out = { styles: [], equipment: [] };
    prefValues(values).forEach(function (v) {
      var g = stylePrefs.includes(v) ? 'styles' : gearPrefs.includes(v) ? 'equipment' : null;
      if (g && !out[g].includes(v)) out[g].push(v);
    });
    return out;
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function savedProfile() {
    return parse(localStorage.getItem('yurui_profile'), {}) || {};
  }

  // 將會員中心姓名同步到共用登入狀態，讓主站與 Booking Header 顯示相同內容。
  function syncProfileDisplayName(name) {
    var normalizedName = String(name || '').trim();
    if (!normalizedName) return;
    var userId = state.user && state.user.id ? String(state.user.id) : null;
    var changed = false;

    if (state.user && state.user.name !== normalizedName) {
      state.user.name = normalizedName;
      changed = true;
    }
    if (
      window.AppState &&
      window.AppState.currentUser &&
      (!userId || String(window.AppState.currentUser.id) === userId) &&
      window.AppState.currentUser.name !== normalizedName
    ) {
      window.AppState.currentUser.name = normalizedName;
      changed = true;
    }
    if (changed && typeof window.saveAppState === 'function') window.saveAppState();
    window.dispatchEvent(
      new CustomEvent('yurui:profile-updated', {
        detail: { userId: userId, name: normalizedName },
      })
    );
  }

  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function selectedPrefs() {
    var app = prefValues(window.AppState && window.AppState.preferences);
    if (app.length) return app;
    var profile = prefValues(savedProfile().preferences);
    if (profile.length) return profile;
    var local = prefValues(parse(localStorage.getItem('preferences'), {}));
    return local.length ? local : prefValues(state.user && state.user.preferences);
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function syncPrefs(values) {
    var set = new Set(prefValues(values));
    document.querySelectorAll('#prefTags .memberPreferenceTag').forEach(function (tag) {
      var on = set.has(tag.dataset.value);
      tag.classList.toggle('isSelected', on);
      tag.setAttribute('aria-pressed', String(on));
    });
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function savePrefs(values) {
    var obj = prefObject(values),
      profile = savedProfile();
    profile.preferences = obj;
    localStorage.setItem('yurui_profile', JSON.stringify(profile));
    localStorage.setItem('preferences', JSON.stringify(obj));
    if (window.AppState) {
      window.AppState.preferences = obj;
      if (typeof window.saveAppState === 'function') window.saveAppState();
    }
    if (state.user && state.user.id && window.API && window.API.customers && window.API.customers.update) {
      window.API.customers.update(state.user.id, { preferences: obj }).catch(function (error) {
        console.warn('Sync normalized customer preferences failed', error);
      });
    }
    window.syncPersonalizationPreferenceTags?.(obj);
    window.dispatchEvent(new CustomEvent('yurui:preferences-updated', { detail: obj }));
  }
  // 用途：初始化會員資料頁的配送地址顯示與編輯 Modal。
  function initProfileShippingAddress() {
    if (!window.YuruiShippingAddressUI || !window.YuruiShippingAddress) return;
    var addr = window.YuruiShippingAddress.resolve(state.user, savedProfile());
    if (!state.profileShippingUi) {
      state.profileShippingUi = window.YuruiShippingAddressUI.init({
        displayEl: document.getElementById('shippingAddressDisplay'),
        editBtn: document.getElementById('shippingAddressEditBtn'),
        initialAddress: addr,
        persist: true,
        getAddress: function () {
          return window.YuruiShippingAddress.resolve(state.user, savedProfile());
        },
        onSave: function (next) {
          if (state.user) state.user.shippingAddress = next;
          if (window.AppState && window.AppState.currentUser) {
            window.AppState.currentUser.shippingAddress = next;
          }
        },
      });
    } else {
      window.YuruiShippingAddressUI.setAddress(addr);
    }
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function applyProfile() {
    if (!state.user) return;
    var s = savedProfile();
    var name = state.user.name || s.name || 'Yurui Camper';
    var email = state.user.email || s.email || 'member@yuruicamp.test';
    syncProfileDisplayName(name);
    text('mcName', name);
    text('mcEmail', email);
    renderAvatarElement(document.getElementById('mcAvatar'), state.user, name);
    text('cardName', name);
    text('cardTier', state.user.tierName || 'Explorer');
    text('cardSince', '加入日期：' + registeredDate(state.user.registeredAt));
    text('cardPoints', '回饋點數：' + Number(state.user.points || 0).toLocaleString('zh-TW'));
    input('profileName', name);
    input('profilePhone', s.phone || state.user.phone || '');
    input('profileEmail', email);
    input('profileBirthday', s.birthday || state.user.birthday || '');
    applyProfileEmailAccess();
    var birthdayInput = document.getElementById('profileBirthday');
    if (birthdayInput) birthdayInput.max = minimumAdultBirthday();
    initProfileShippingAddress();
    renderProgress();
    syncPrefs(selectedPrefs());
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function renderProgress() {
    var spent =
      Number(state.user && state.user.totalSpent) ||
      state.orders.reduce(function (t, o) {
        return norm('purchase', o.status) === 'completed' ? t + (Number(o.subtotal) || 0) : t;
      }, 0);
    var nextThreshold = window.getNextTierThreshold
      ? window.getNextTierThreshold(spent)
      : spent >= 28000
        ? null
        : spent >= 12000
          ? 28000
          : 12000;
    var progress = nextThreshold ? Math.min(Math.round((spent / nextThreshold) * 100), 100) : 100;
    text('nextTierSpend', money(Math.max((nextThreshold || spent) - spent, 0)));
    var bar = document.getElementById('tierProgressBar');
    if (!bar) return;
    // 用途：用 class 呈現進度條寬度，避免在 runtime 寫入 inline style。
    bar.className = bar.className
      .split(/\s+/)
      .filter(function (name) {
        return name && !/^memberTierProgressStep\d+$/.test(name);
      })
      .concat('memberTierProgressStep' + progress)
      .join(' ');
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function itemTitle(items) {
    var list = Array.isArray(items) ? items : [];
    if (!list.length) return '商品明細';
    if (list.length === 1) return list[0].name || '商品明細';
    return (list[0].name || '商品明細') + ' 等 ' + list.length + ' 件';
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  /** 訂單商品圖：直接使用 /assets 或 https */
  function resolveItemImageSrc(src, fallback) {
    return src || fallback || 'https://picsum.photos/seed/fallback/80/80';
  }

  function thumbs(items) {
    var list = Array.isArray(items) ? items : [];
    return (
      '<div class="memberOrderThumbs">' +
      list
        .slice(0, 3)
        .map(function (i) {
          var src = resolveItemImageSrc(i.image, 'https://picsum.photos/seed/fallback/80/80');
          return (
            '<img class="memberOrderThumb" src="' + html(src) + '" alt="' + html(i.name || '商品') + '">'
          );
        })
        .join('') +
      (list.length > 3 ? '<span class="memberOrderMore">+' + (list.length - 3) + '</span>' : '') +
      '</div>'
    );
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function renderFilters(type, orders) {
    var c = document.getElementById(type === 'rental' ? 'rentalOrderStatusTabs' : 'purchaseOrderStatusTabs');
    if (!c) return;
    var selected = state.filters[type] || 'all';
    c.innerHTML = statusMeta[type]
      .map(function (row) {
        var count =
          row[0] === 'all'
            ? orders.length
            : orders.filter(function (o) {
                return norm(type, o.status) === row[0] || norm(type, o.paymentStatus) === row[0];
              }).length;
        var on = selected === row[0];
        return (
          '<button class="memberOrderFilter' +
          (on ? ' isSelected' : '') +
          '" type="button" data-filter="' +
          html(row[0]) +
          '" aria-pressed="' +
          String(on) +
          '">' +
          html(row[1]) +
          ' <span>' +
          count +
          '</span>' +
          '</button>'
        );
      })
      .join('');
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function filtered(type, orders) {
    var selected = state.filters[type] || 'all';
    if (selected === 'all') return orders;
    return orders.filter(function (o) {
      return norm(type, o.status) === selected || norm(type, o.paymentStatus) === selected;
    });
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function canReview(o) {
    return Boolean(o && norm('purchase', o.status) === 'completed');
  }

  function itemIsReviewed(item) {
    var orderItemId = Number(item && item.orderItemId);
    return (
      Number.isInteger(orderItemId) &&
      state.reviews.some(function (review) {
        return Number(review.orderItemId) === orderItemId;
      })
    );
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function renderOrders() {
    var c = document.getElementById('ordersList');
    if (!c) return;
    var orders = filtered('purchase', state.orders);
    if (!orders.length) {
      c.innerHTML =
        '<div class="memberEmptyState">' +
        '<div class="memberEmptyStateIcon">' +
        '<i class="bi bi-bag-x"></i>' +
        '</div>' +
        '目前沒有符合條件的購買紀錄' +
        '</div>';
      return;
    }
    c.innerHTML = orders
      .map(function (o) {
        var st = meta('purchase', o.status),
          title = itemTitle(o.items);
        return (
          '<article class="memberOrderCard" data-order-id="' +
          html(o.id) +
          '">' +
          '<div class="memberOrderInfo">' +
          '<h3 class="memberOrderTitle">' +
          html(title) +
          '</h3>' +
          '<p class="memberOrderMeta">' +
          html(orderDisplayId(o)) +
          ' ｜ ' +
          html(commerceDate(o.createdAt || o.placedAt)) +
          ' ｜ ' +
          ((o.items || []).length || 0) +
          ' 件商品</p>' +
          thumbs(o.items) +
          '</div>' +
          '<div class="memberOrderSummary">' +
          '<div class="memberOrderAmount">' +
          money(o.total) +
          '</div>' +
          '<span class="memberOrderStatus ' +
          st.cls +
          '">' +
          html(st.label) +
          '</span>' +
          '<button class="memberOrderDetailButton" type="button" data-order-detail="' +
          html(o.id) +
          '">查看明細</button>' +
          '</div>' +
          '</article>'
        );
      })
      .join('');
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function renderRentals() {
    var c = document.getElementById('rentalOrdersList');
    if (!c) return;
    var orders = filtered('rental', state.rentalOrders);
    if (!orders.length) {
      c.innerHTML =
        '<div class="memberEmptyState">' +
        '<div class="memberEmptyStateIcon">' +
        '<i class="bi bi-tent"></i>' +
        '</div>' +
        '目前沒有符合條件的預約紀錄' +
        '</div>';
      return;
    }
    c.innerHTML = orders
      .map(function (o) {
        var st = meta('rental', o.status);
        var info = o.bookingInfo || {};
        return (
          '<article class="memberOrderCard" data-rental-order-id="' +
          html(o.id) +
          '">' +
          '<div class="memberOrderInfo">' +
          '<h3 class="memberOrderTitle">' +
          html(bookingTitle(o)) +
          '</h3>' +
          '<p class="memberOrderMeta">' +
          html(bookingDisplayId(o)) +
          ' ｜ ' +
          html(info.checkIn || '--') +
          ' - ' +
          html(info.checkOut || '--') +
          ' ｜ ' +
          html(info.region || '--') +
          '</p>' +
          '</div>' +
          '<div class="memberOrderSummary">' +
          '<div class="memberOrderAmount">' +
          money(bookingAmount(o)) +
          '</div>' +
          '<span class="memberOrderStatus ' +
          st.cls +
          '">' +
          html(st.label) +
          '</span>' +
          '<button class="memberOrderDetailButton" type="button" data-rental-detail="' +
          html(o.id) +
          '">查看明細</button>' +
          '</div>' +
          '</article>'
        );
      })
      .join('');
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function couponOff(c) {
    if (c.used === true) return true;
    var expiry = c.expiry || c.endDate;
    return expiry && new Date(String(expiry).replace('T', ' ')) < new Date();
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function renderCoupons() {
    var a = document.getElementById('activeCoupons'),
      e = document.getElementById('expiredCoupons');
    if (!a || !e) return;
    var list = (state.availableCoupons || []).map(function (c) {
      return Object.assign({}, c, { isDisabled: couponOff(c) });
    });
    function card(c) {
      var percent = c.type === 'percent';
      return (
        '<article class="memberCouponCard' +
        (c.isDisabled ? ' isDisabled' : '') +
        '">' +
        '<div class="memberCouponValue">' +
        '<div class="memberCouponDiscountValue">' +
        html(c.discount || 0) +
        '</div>' +
        '<div class="memberCouponDiscountUnit">' +
        (percent ? '% OFF' : 'NT$') +
        '</div>' +
        '</div>' +
        '<div class="memberCouponDivider" aria-hidden="true"></div>' +
        '<div class="memberCouponContent">' +
        '<h3 class="memberCouponTitle">' +
        html(c.code || '會員折價券') +
        '</h3>' +
        '<p class="memberCouponMeta">滿 ' +
        money(c.minOrder || 0) +
        ' 可用</p>' +
        '<p class="memberCouponStatus">期限 ' +
        html(c.expiry || (c.endDate && String(c.endDate).slice(0, 10)) || '無期限') +
        '</p>' +
        '<div class="memberCouponCodeRow">' +
        '<span class="memberCouponCode">' +
        html(c.code || '') +
        '</span>' +
        (!c.isDisabled
          ? '<button class="memberCopyButton" type="button" data-copy-coupon="' +
            html(c.code || '') +
            '">複製</button>'
          : '') +
        '</div>' +
        '</div>' +
        '</article>'
      );
    }
    var on = list.filter(function (c) {
        return !c.isDisabled;
      }),
      off = list.filter(function (c) {
        return c.isDisabled;
      });
    a.innerHTML = on.length
      ? on.map(card).join('')
      : '<div class="memberEmptyState">目前沒有可使用的折價券</div>';
    e.innerHTML = off.length
      ? off.map(card).join('')
      : '<div class="memberEmptyState">目前沒有已失效的折價券</div>';
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function renderNotifications() {
    var c = document.getElementById('notificationList');
    if (!c) return;
    var list = state.notifications || [];
    if (!list.length) {
      c.innerHTML = '<div class="memberEmptyState">目前沒有通知</div>';
      return;
    }
    c.innerHTML = list
      .map(function (n) {
        var seen = Boolean(n.read);
        // 訂單通知：掛 data-notification-order-detail，點擊可開訂單明細
        var orderAttr = n.orderId ? ' data-notification-order-detail="' + html(n.orderId) + '"' : '';
        var clickable = n.orderId ? ' isClickable' : '';
        return (
          '<article class="memberNotification' +
          (seen ? ' isRead' : '') +
          clickable +
          '" data-notif-id="' +
          html(n.id) +
          '"' +
          orderAttr +
          (n.orderId ? ' role="button" tabindex="0"' : '') +
          '>' +
          '<span class="memberNotificationIndicator" aria-hidden="true"></span>' +
          '<div class="memberNotificationContent">' +
          '<h3 class="memberNotificationTitle">' +
          html(n.title || '會員通知') +
          '</h3>' +
          '<p class="memberNotificationBody">' +
          html(n.message || '') +
          '</p>' +
          '<p class="memberNotificationMeta">' +
          html(n.time || '') +
          '</p>' +
          '</div>' +
          '</article>'
        );
      })
      .join('');
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function renderActivity() {
    var c = document.getElementById('recentActivity');
    if (!c) return;
    var list = [];
    state.orders.slice(0, 3).forEach(function (o) {
      list.push({
        date: o.createdAt,
        title: '訂單 ' + orderDisplayId(o) + ' ' + meta('purchase', o.status).label,
        type: 'purchase',
        id: o.id,
      });
    });
    state.rentalOrders.slice(0, 2).forEach(function (o) {
      list.push({
        date: o.submittedAt || o.createdAt,
        title: '預約 ' + bookingDisplayId(o) + ' ' + meta('rental', o.status).label,
        type: 'rental',
        id: o.id,
      });
    });
    (state.notifications || []).slice(0, 2).forEach(function (n) {
      list.push({ date: n.time, title: n.title });
    });
    list.sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
    c.innerHTML = list.length
      ? list
          .slice(0, 5)
          .map(function (i) {
            var attr =
              i.type === 'purchase'
                ? ' data-notification-order-detail="' + html(i.id) + '"'
                : i.type === 'rental'
                  ? ' data-notification-rental-detail="' + html(i.id) + '"'
                  : '';
            var title = attr
              ? '<button class="memberActivityTitle memberActivityTitleButton" type="button"' +
                attr +
                '>' +
                html(i.title) +
                '</button>'
              : '<div class="memberActivityTitle">' + html(i.title) + '</div>';
            return (
              '<article class="memberActivityItem">' +
              title +
              '<div class="memberActivityDate">' +
              html(commerceDate(i.date)) +
              '</div>' +
              '</article>'
            );
          })
          .join('')
      : '<div class="memberEmptyState">目前沒有最近活動</div>';
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function updateStats() {
    var coupons = (state.availableCoupons || []).filter(function (c) {
      return !couponOff(c);
    }).length;
    var unread = (state.notifications || []).filter(function (n) {
      return !n.read;
    }).length;
    // 進行中：商城 unshipped/shipped；預約 pending/confirmed（不含付款狀態別名）
    text(
      'statOrders',
      state.orders.filter(function (o) {
        return ['unshipped', 'shipped'].includes(norm('purchase', o.status));
      }).length
    );
    text(
      'statBookings',
      state.rentalOrders.filter(function (o) {
        return ['pending', 'confirmed'].includes(norm('rental', o.status));
      }).length
    );
    text('statCoupons', coupons);
    text('statUnread', unread);
  }
  function detailRows(order, st, type) {
    var items = type === 'rental' ? bookingDetailItems(order) : Array.isArray(order.items) ? order.items : [];
    var itemTitleLabel = type === 'rental' ? '預約明細' : '商品明細';
    var subtotalLabel = type === 'rental' ? '預約費用' : '商品小計';
    var shippingFee = Number(order.shippingFee || 0);
    var orderDate =
      type === 'rental'
        ? commerceDate(order.submittedAt || order.createdAt)
        : commerceDate(order.createdAt || order.placedAt);
    var orderTotal = type === 'rental' ? bookingAmount(order) : order.total;
    var orderSubtotal =
      type === 'rental'
        ? order.summary
          ? (Number(order.summary.zoneTotal) || 0) + (Number(order.summary.rentalTotal) || 0)
          : bookingAmount(order)
        : order.subtotal;
    var infoRows = [
      '<p class="memberDetailMeta"><i class="bi bi-credit-card" aria-hidden="true"></i><span>付款方式：' +
        html(paymentLabel(order.payment)) +
        '</span></p>',
      '<p class="memberDetailMeta"><i class="bi ' +
        (type === 'rental' ? 'bi-shop' : order.shippingMethod === 'store' ? 'bi-shop' : 'bi-geo-alt') +
        '" aria-hidden="true"></i><span>' +
        html(fulfillmentLabel(order, type)) +
        '</span></p>',
    ];
    // trackingNumber ↔ schema orders.tracking_number（出貨後才有值）
    if (type === 'purchase' && order.trackingNumber) {
      infoRows.push(
        '<p class="memberDetailMeta"><i class="bi bi-truck" aria-hidden="true"></i><span>運單編號：' +
          html(order.trackingNumber) +
          '</span></p>'
      );
    }
    if (type === 'rental') {
      var info = order.bookingInfo || {};
      infoRows.unshift(
        '<p class="memberDetailMeta">入住：' +
          html(info.checkIn || '--') +
          ' ｜ 退營：' +
          html(info.checkOut || '--') +
          ' ｜ 人數：' +
          html(info.guestCount || '--') +
          '</p>'
      );
    }
    var cancelBookingAction =
      type === 'rental' && order.status === 'pending' && order.paymentStatus === 'unpaid'
        ? '<button class="memberDetailLineButton" type="button" data-cancel-booking="' +
          html(order.id) +
          '"><i class="bi bi-x-circle" aria-hidden="true"></i><span>取消待付款預約</span></button>'
        : '';
    // 商品訂單只在後端允許取消的待出貨、未付款狀態顯示操作。
    var cancelPurchaseAction =
      type === 'purchase' &&
      norm('purchase', order.status) === 'unshipped' &&
      order.paymentStatus === 'unpaid'
        ? '<button class="memberDetailLineButton" type="button" data-cancel-order="' +
          html(order.id) +
          '"><i class="bi bi-x-circle" aria-hidden="true"></i><span>取消訂單</span></button>'
        : '';
    return (
      '<div class="memberDetailSummary">' +
      '<div class="memberDetailDate">' +
      html(orderDate) +
      '</div>' +
      '<span class="memberOrderStatus ' +
      st.cls +
      '">' +
      html(st.label) +
      '</span>' +
      '</div>' +
      '<section class="memberDetailSection" aria-label="' +
      html(itemTitleLabel) +
      '">' +
      '<h3 class="memberDetailSectionTitle">' +
      html(itemTitleLabel) +
      '</h3>' +
      '<div class="memberDetailItems">' +
      items
        .map(function (i) {
          var quantity = Number(i.quantity || 1);
          var reviewAction = '';
          var orderItemId = Number(i.orderItemId);
          var hasValidOrderItemId = Number.isInteger(orderItemId) && orderItemId > 0;
          if (type === 'purchase' && canReview(order) && hasValidOrderItemId) {
            reviewAction = itemIsReviewed(i)
              ? '<button class="memberItemReviewButton" type="button" data-review-order="' +
                html(order.id) +
                '" data-review-order-item="' +
                html(i.orderItemId) +
                '" data-review-item="' +
                html(i.name || '商品') +
                '"><i class="bi bi-pencil-square" aria-hidden="true"></i> 查看／修改評論</button>'
              : '<button class="memberItemReviewButton" type="button" data-review-order="' +
                html(order.id) +
                '" data-review-order-item="' +
                html(i.orderItemId) +
                '" data-review-item="' +
                html(i.name || '商品') +
                '">評價此商品</button>';
          }
          return (
            '<article class="memberDetailItem">' +
            '<img class="memberDetailItemImage" src="' +
            html(resolveItemImageSrc(i.image, 'https://picsum.photos/seed/yurui-detail/80/80')) +
            '" alt="" loading="lazy" />' +
            '<div class="memberDetailItemText">' +
            '<h4 class="memberDetailItemName">' +
            html(i.name || '商品') +
            '</h4>' +
            (i.specLabel ? '<p class="memberDetailItemSpec">' + html(i.specLabel) + '</p>' : '') +
            '<p class="memberDetailItemMeta">x ' +
            quantity +
            '，' +
            money((i.price || 0) * quantity) +
            '</p>' +
            '</div>' +
            reviewAction +
            '</article>'
          );
        })
        .join('') +
      '</div>' +
      '</section>' +
      '<div class="memberDetailDivider" aria-hidden="true"></div>' +
      '<section class="memberDetailSection" aria-label="費用明細">' +
      '<div class="memberDetailRow"><span class="memberDetailRowLabel">' +
      subtotalLabel +
      '</span><span class="memberDetailRowValue">' +
      money(orderSubtotal) +
      '</span></div>' +
      (type === 'purchase'
        ? '<div class="memberDetailRow"><span class="memberDetailRowLabel">運費</span><span class="memberDetailRowValue">' +
          (shippingFee > 0 ? money(shippingFee) : '免費') +
          '</span></div>'
        : '') +
      (order.discount
        ? '<div class="memberDetailRow memberDetailRowDanger"><span class="memberDetailRowLabel">折扣</span><span class="memberDetailRowValue">- ' +
          money(order.discount) +
          '</span></div>'
        : '') +
      (order.deposit
        ? '<div class="memberDetailRow"><span class="memberDetailRowLabel">押金</span><span class="memberDetailRowValue">' +
          money(order.deposit) +
          '</span></div>'
        : '') +
      '<div class="memberDetailRow memberDetailRowTotal"><span class="memberDetailRowLabel">訂單總計</span><span class="memberDetailRowValue">' +
      money(orderTotal) +
      '</span></div>' +
      (type === 'purchase'
        ? '<div class="memberDetailRow memberDetailRowSuccess"><span class="memberDetailRowLabel">回饋點數</span><span class="memberDetailRowValue">' +
          Number(order.points || pointOf(order)).toLocaleString('zh-TW') +
          ' 點</span></div>'
        : '') +
      '</section>' +
      '<section class="memberDetailSection memberDetailInfo" aria-label="訂單資訊">' +
      infoRows.join('') +
      '</section>' +
      cancelBookingAction +
      '<a class="memberDetailLineButton" href="https://line.me/R/ti/p/@yuruicamp" target="_blank" rel="noopener">' +
      '<i class="bi bi-chat-dots" aria-hidden="true"></i>' +
      '<span>使用 LINE 詢問' +
      (type === 'rental' ? '預約' : '訂單') +
      '</span>' +
      '</a>' +
      cancelPurchaseAction
    );
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function openModal(id) {
    var o = document.getElementById(id);
    if (!o) return;
    state.lastFocus = document.activeElement;
    o.classList.add('isOpen');
    o.setAttribute('aria-hidden', 'false');
    document.body.classList.add('memberModalOpen');
    var d = o.querySelector('.memberModalDialog');
    if (d) d.focus();
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function closeModal(id) {
    var o = document.getElementById(id);
    if (!o) return;
    o.classList.remove('isOpen');
    o.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.memberModalOverlay.isOpen'))
      document.body.classList.remove('memberModalOpen');
    if (state.lastFocus && typeof state.lastFocus.focus === 'function') state.lastFocus.focus();
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  window.openOrderDetail = function (id) {
    var o = state.orders.find(function (x) {
      return window.sameId ? window.sameId(x.id, id) : String(x.id) === String(id);
    });
    if (!o) return;
    text('orderDetailTitle', '訂單詳情 ' + orderDisplayId(o));
    var b = document.getElementById('orderDetailBody');
    if (b) b.innerHTML = detailRows(o, meta('purchase', o.status), 'purchase');
    openModal('orderDetailOverlay');
  };
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  window.openRentalOrderDetail = async function (id) {
    var o = state.rentalOrders.find(function (x) {
      return window.sameId ? window.sameId(x.id, id) : String(x.id) === String(id);
    });
    if (!o) return;

    // 列表是精簡契約；開啟明細時再向後端讀取完整快照。
    if (window.BookingAPI && window.BookingAPI.getBookingById) {
      try {
        o = await window.BookingAPI.getBookingById(id);
        var index = state.rentalOrders.findIndex(function (item) {
          return window.sameId ? window.sameId(item.id, id) : String(item.id) === String(id);
        });
        if (index >= 0) state.rentalOrders[index] = o;
      } catch (error) {
        console.error('Booking detail load failed', error);
        toast(error && error.message ? error.message : '預約明細載入失敗', 'error');
        return;
      }
    }

    text('orderDetailTitle', '露營預約詳情 ' + bookingDisplayId(o));
    var b = document.getElementById('orderDetailBody');
    if (b) b.innerHTML = detailRows(o, meta('rental', o.status), 'rental');
    openModal('orderDetailOverlay');
  };

  // 主動取消一律交給 Booking API，前端不自行改成 cancelled。
  window.cancelRentalBooking = async function (id) {
    if (!window.BookingAPI || !window.BookingAPI.cancelBooking) return;

    try {
      await window.BookingAPI.cancelBooking(id);
      toast('待付款預約已取消', 'success');
      closeModal('orderDetailOverlay');
      await loadData();
    } catch (error) {
      console.error('Booking cancellation failed', error);
      toast(error && error.message ? error.message : '取消預約失敗', 'error');
    }
  };

  // 商品訂單取消交由既有 Checkout API，成功後重新讀取本人訂單。
  window.cancelPurchaseOrder = async function (id, trigger) {
    if (!window.API || !window.API.checkout || !window.API.checkout.cancelSession) {
      toast('取消訂單功能目前不可用', 'error');
      return;
    }

    if (trigger) {
      trigger.disabled = true;
      trigger.setAttribute('aria-busy', 'true');
    }
    try {
      await window.API.checkout.cancelSession(id);
      toast('訂單已取消', 'success');
      closeModal('orderDetailOverlay');
      await loadData();
    } catch (error) {
      console.error('Purchase order cancellation failed', error);
      toast(error && error.message ? error.message : '取消訂單失敗', 'error');
      if (trigger) {
        trigger.disabled = false;
        trigger.removeAttribute('aria-busy');
      }
    }
  };
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  window.openReviewModal = function (id, orderItemId, name) {
    var order = state.orders.find(function (candidate) {
      return String(candidate.id) === String(id);
    });
    var item =
      order &&
      (order.items || []).find(function (candidate) {
        return Number(candidate.orderItemId) === Number(orderItemId);
      });
    if (!order || !item || !canReview(order)) {
      toast('此商品目前無法評價', 'warning');
      return;
    }
    var existingReview = state.reviews.find(function (review) {
      return Number(review.orderItemId) === Number(orderItemId);
    });
    clearReviewPhotos();
    state.review = {
      orderId: id,
      orderItemId: Number(orderItemId),
      itemName: name || '',
      rating: Number(existingReview && existingReview.rating) || 0,
      reviewId: existingReview ? existingReview.id : '',
      files: existingReview
        ? (existingReview.photos || []).map(function (url) {
            return { existingUrl: url };
          })
        : [],
    };
    text('reviewProductName', name || '商品評價');
    input('reviewContent', existingReview ? existingReview.comment || '' : '');
    var submitLabel = existingReview ? '儲存評論修改' : '送出此商品評價';
    text('submitReviewBtnLabel', submitLabel);
    var submitButton = document.getElementById('submitReviewBtn');
    if (submitButton) submitButton.dataset.idleLabel = submitLabel;
    var deleteButton = document.getElementById('deleteReviewBtn');
    if (deleteButton) deleteButton.hidden = !existingReview;
    stars(state.review.rating);
    clearReviewValidation();
    updateReviewCharacterCount();
    renderReviewPhotoPreview();
    openModal('reviewOverlay');
  };
  function clearReviewPhotos() {
    (state.review.files || []).forEach(function (entry) {
      if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
    });
    state.review.files = [];
    var inputElement = document.getElementById('reviewPhotos');
    if (inputElement) inputElement.value = '';
    renderReviewPhotoPreview();
  }
  function renderReviewPhotoPreview() {
    var preview = document.getElementById('reviewPhotoPreview');
    if (!preview) return;
    preview.replaceChildren();
    (state.review.files || []).forEach(function (entry, index) {
      var item = document.createElement('div');
      item.className = 'memberReviewPhotoItem';
      var image = document.createElement('img');
      image.src = entry.previewUrl || resolveReviewPhotoSrc(entry.existingUrl);
      image.alt = '評論圖片預覽 ' + (index + 1);
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'memberReviewPhotoRemove';
      remove.setAttribute('aria-label', '移除第 ' + (index + 1) + ' 張圖片');
      remove.textContent = '×';
      remove.addEventListener('click', function () {
        if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
        state.review.files.splice(index, 1);
        renderReviewPhotoPreview();
      });
      item.append(image, remove);
      preview.appendChild(item);
    });
  }
  function resolveReviewPhotoSrc(value) {
    if (!value || !value.startsWith('/assets/uploads/reviews/')) return value || '';
    var apiBase = window.AppConfig && window.AppConfig.API_BASE_URL
      ? window.AppConfig.API_BASE_URL
      : window.location.origin;
    return new URL(value, new URL(apiBase, window.location.origin).origin).href;
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function stars(rating) {
    state.review.rating = Number(rating) || 0;
    var ratingGroup = document.getElementById('reviewRatingGroup');
    var ratingError = document.getElementById('reviewRatingError');
    if (ratingGroup) {
      ratingGroup.classList.remove('isInvalid');
      ratingGroup.removeAttribute('aria-invalid');
    }
    if (ratingError) ratingError.hidden = true;
    document.querySelectorAll('.memberRatingStar').forEach(function (b) {
      var on = Number(b.dataset.reviewRating) <= state.review.rating;
      b.classList.toggle('isSelected', on);
      b.setAttribute('aria-checked', String(on));
    });
  }
  function previewStars(rating) {
    var previewRating = Number(rating) || 0;
    document.querySelectorAll('.memberRatingStar').forEach(function (b) {
      var on = previewRating > 0 && Number(b.dataset.reviewRating) <= previewRating;
      b.classList.toggle('isPreview', on);
    });
  }

  // 清除上一次送出留下的欄位與業務錯誤。
  function clearReviewValidation() {
    ['reviewRatingError', 'reviewContentError', 'reviewSubmitError'].forEach(function (id) {
      var element = document.getElementById(id);
      if (!element) return;
      element.hidden = true;
      element.textContent = id === 'reviewRatingError' ? '必須選擇 1 至 5 星。' : '';
    });
    var ratingGroup = document.getElementById('reviewRatingGroup');
    var content = document.getElementById('reviewContent');
    if (ratingGroup) ratingGroup.removeAttribute('aria-invalid');
    if (content) {
      content.classList.remove('isInvalid');
      content.removeAttribute('aria-invalid');
    }
  }

  // 顯示評論字數，空白內容仍計入輸入長度但送出時會正規化為 null。
  function updateReviewCharacterCount() {
    var content = document.getElementById('reviewContent');
    var counter = document.getElementById('reviewCharacterCount');
    if (content && counter) counter.textContent = content.value.length + '／1000';
  }

  // 鎖定表單避免重複送出，完成後恢復原本按鈕文字。
  function setReviewSubmitting(submitting) {
    var form = document.getElementById('reviewForm');
    var submit = document.getElementById('submitReviewBtn');
    var label = document.getElementById('submitReviewBtnLabel');
    if (!form || !submit) return;
    form.dataset.submitting = String(submitting);
    form.setAttribute('aria-busy', String(submitting));
    Array.from(form.querySelectorAll('button,input,textarea')).forEach(function (control) {
      control.disabled = submitting;
    });
    if (label) {
      label.textContent = submitting ? '送出中...' : submit.dataset.idleLabel || '送出此商品評價';
    }
  }

  function showReviewFieldError(id, control, message) {
    var error = document.getElementById(id);
    if (error) {
      error.textContent = message;
      error.hidden = false;
    }
    if (control) {
      control.setAttribute('aria-invalid', 'true');
      control.classList.add('isInvalid');
    }
  }

  // 將後端穩定錯誤碼轉成會員可採取行動的提示。
  function getReviewErrorMessage(error) {
    var code = String(error && error.code || '').toUpperCase();
    if (code === 'REVIEW_ALREADY_EXISTS') return '這項商品已經評價過，重新整理後即可查看或修改評論。';
    if (code === 'REVIEW_ORDER_FORBIDDEN' || Number(error && error.status) === 403) {
      return '這筆訂單明細不屬於目前登入的會員，無法送出評價。';
    }
    if (code === 'REVIEW_ORDER_NOT_COMPLETED') return '訂單尚未完成，完成訂單後才能評價。';
    if (code === 'UNAUTHORIZED' || Number(error && error.status) === 401) {
      return '登入狀態已失效，重新登入後再送出評價。';
    }
    if (code === 'NOT_FOUND') return '找不到這筆訂單明細，可能已被更新或移除。';
    if (code === 'VALIDATION_ERROR') return '評價資料格式不正確，檢查評分、內容與照片後再送出。';
    if (code === 'API_NETWORK_ERROR') return '目前無法連線到後端服務，確認網路後再試一次。';
    return error && error.message ? error.message : '評價送出失敗，稍後再試。';
  }

  function showReviewSubmitError(error) {
    var message = getReviewErrorMessage(error);
    var details = Array.isArray(error && error.details) ? error.details : [];
    var commentError = details.find(function (detail) {
      return String(detail && detail.field || '').endsWith('comment');
    });
    var ratingError = details.find(function (detail) {
      return String(detail && detail.field || '').endsWith('rating');
    });
    if (commentError) {
      showReviewFieldError(
        'reviewContentError',
        document.getElementById('reviewContent'),
        '評論內容不可超過 1000 字。'
      );
    }
    if (ratingError) {
      showReviewFieldError(
        'reviewRatingError',
        document.getElementById('reviewRatingGroup'),
        '評分必須介於 1 至 5 星。'
      );
    }
    var target = document.getElementById('reviewSubmitError');
    if (target) {
      target.textContent = message;
      target.hidden = false;
    }
    toast(message, 'error');
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function switchPanel(tab) {
    var selected = tab === 'orders' ? 'records' : tab || 'overview';
    document.querySelectorAll('.memberNavItem,.memberMobileNavItem').forEach(function (i) {
      var on = i.dataset.tab === selected;
      i.classList.toggle('isActive', on);
      i.setAttribute('aria-selected', String(on));
      if (i.classList.contains('memberNavItem')) {
        if (on) i.setAttribute('aria-current', 'page');
        else i.removeAttribute('aria-current');
      }
    });
    document.querySelectorAll('.memberPanel').forEach(function (p) {
      var on = p.dataset.panel === selected;
      p.classList.toggle('isActive', on);
      p.hidden = !on;
    });
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function switchRecord(type) {
    var selected = type === 'rental' ? 'rental' : 'purchase';
    document.querySelectorAll('.memberRecordTab[data-rec]').forEach(function (t) {
      var on = t.dataset.rec === selected;
      t.classList.toggle('isActive', on);
      t.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll('.memberRecordPanel').forEach(function (p) {
      var on = p.dataset.recPanel === selected;
      p.classList.toggle('isActive', on);
      p.hidden = !on;
    });
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function switchCoupon(value) {
    var show = value !== 'unavailable';
    document.querySelectorAll('.memberRecordTab[data-coupon-tab]').forEach(function (t) {
      var on = t.dataset.couponTab === (show ? 'available' : 'unavailable');
      t.classList.toggle('isActive', on);
      t.setAttribute('aria-selected', String(on));
    });
    var a = document.getElementById('activeCoupons'),
      e = document.getElementById('expiredCoupons');
    if (a) a.hidden = !show;
    if (e) e.hidden = show;
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function applyLogin() {
    var guard = document.getElementById('memberLoginGuard'),
      shell = document.getElementById('memberCenterShell'),
      ok = loggedIn();
    if (guard) {
      guard.hidden = ok;
      guard.classList.toggle('isHidden', ok);
    }
    if (shell) shell.hidden = !ok;
    if (ok) applyProfile();
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  async function loadData() {
    if (state.dataLoading) {
      state.dataReloadQueued = true;
      return;
    }
    state.dataLoading = true;
    var uid = currentMemberId();
    if (!uid || !window.API) {
      state.user = null;
      state.orders = [];
      state.rentalOrders = [];
      state.availableCoupons = [];
      state.notifications = [];
      state.reviews = [];
      applyLogin();
      state.dataLoading = false;
      return;
    }
    try {
      state.user = await window.API.customers.getById(uid);
    } catch (error) {
      console.warn('Member profile load failed; keeping current login profile', error);
      state.user = loginUser();
    }

    // 正式模式從 GET /api/me/profile 讀取 DB 主檔（phone／birthday）；Mock 仍走 localStorage overlay。
    if (state.user && window.API.memberProfile && window.API.memberProfile.get) {
      try {
        var dbProfile = await window.API.memberProfile.get();
        if (dbProfile) {
          state.user.name = dbProfile.name || state.user.name;
          state.user.email = dbProfile.email || state.user.email;
          state.user.phone = dbProfile.phone || state.user.phone;
          state.user.birthday = dbProfile.birthday || state.user.birthday;
          state.user.authProvider = dbProfile.authProvider || state.user.authProvider;
          state.user.registeredAt = dbProfile.registeredAt || state.user.registeredAt;
        }
      } catch (error) {
        console.warn('Member profile API load skipped', error);
      }
    }

    // 正式模式從會員本人 API 載入預設地址；沒有地址時維持空表單。
    if (state.user && window.API.shippingAddresses?.getDefault) {
      try {
        var shippingAddress = await window.API.shippingAddresses.getDefault();
        if (shippingAddress) state.user.shippingAddress = shippingAddress;
      } catch (error) {
        console.warn('Member shipping address load skipped', error);
      }
    }
    if (state.user && window.AppState) {
      window.AppState.isLoggedIn = true;
      window.AppState.currentUser = state.user;
      if (typeof window.saveAppState === 'function') window.saveAppState();
    }

    // 各領域獨立載入；單一 API 失敗不得連帶清空其他已完成的會員資料。
    var results = await Promise.allSettled([
      window.API.orders.getByCustomerId
        ? window.API.orders.getByCustomerId(uid)
        : window.API.orders.getAll().then(function (allOrders) {
            return (allOrders || []).filter(function (order) {
              return order && order.customerId === uid;
            });
          }),
      window.API.customers.getNotifications(uid),
      // 正式模式讀取會員本人 claims；Mock 模式由 facade 保留既有資格展示。
      window.API.coupons.getMemberCenter(uid),
      window.API.reviews && window.API.reviews.getAll ? window.API.reviews.getAll() : Promise.resolve([]),
      window.BookingAPI && window.BookingAPI.getBookings
        ? window.BookingAPI.getBookings(uid)
        : Promise.resolve([]),
    ]);
    state.orders = results[0].status === 'fulfilled' ? results[0].value : [];
    state.notifications = results[1].status === 'fulfilled' ? results[1].value : [];
    state.availableCoupons = results[2].status === 'fulfilled' ? results[2].value : [];
    state.reviews = results[3].status === 'fulfilled' ? results[3].value : [];
    state.rentalOrders = results[4].status === 'fulfilled' ? results[4].value : [];

    results.forEach(function (result) {
      if (result.status === 'rejected') {
        console.warn('Member center domain load skipped', result.reason);
      }
    });

    try {
      state.orders.forEach(function (o) {
        if (o.status === 'completed' && window.API.orders.awardPointsIfCompleted) {
          window.API.orders.awardPointsIfCompleted(o);
        }
      });
      state.user = await window.API.customers.getById(uid);
    } catch (error) {
      console.warn('Member profile refresh skipped', error);
    }
    applyProfile();
    renderFilters('purchase', state.orders);
    renderFilters('rental', state.rentalOrders);
    renderOrders();
    renderRentals();
    renderCoupons();
    renderNotifications();
    renderActivity();
    updateStats();
    applyLogin();
    state.dataLoading = false;
    if (state.dataReloadQueued) {
      state.dataReloadQueued = false;
      loadData();
    }
  }

  // 會員中心改採事件驅動更新，避免固定間隔重讀全部 Mock 資料。
  function bindRefreshEvents() {
    if (state.refreshEventsBound) return;
    state.refreshEventsBound = true;

    window.addEventListener('yurui:auth-changed', function (event) {
      applyLogin();
      if (event.detail && event.detail.type === 'logout') {
        state.user = null;
        state.orders = [];
        state.rentalOrders = [];
        state.availableCoupons = [];
        state.notifications = [];
        state.reviews = [];
        return;
      }
      if (loggedIn()) loadData();
    });

    window.addEventListener('storage', function (event) {
      var refreshKeys = [
        cfg.authStorageKey,
        cfg.fallbackAuthStorageKey,
        'currentUser',
        'yuruiUser',
        'mockOrders',
        'mockBookings',
        'mockReviews',
        'mockCustomerOverlay',
        'mockCustomerRelations',
      ];
      if (refreshKeys.indexOf(event.key) !== -1) {
        applyLogin();
        if (loggedIn()) loadData();
      }
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && loggedIn()) loadData();
    });

    window.addEventListener('yurui:shipping-address-updated', function (event) {
      if (!state.user || !event.detail || event.detail.userId !== state.user.id) return;
      state.user.shippingAddress = event.detail.address;
      applyProfile();
    });

    window.addEventListener('yurui:preferences-updated', function (event) {
      if (!state.user) return;
      state.user.preferences = event.detail || state.user.preferences;
      applyProfile();
    });
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function bind() {
    document.querySelectorAll('.memberNavItem,.memberMobileNavItem').forEach(function (b) {
      if (b.dataset.bound) return;
      b.dataset.bound = 'true';
      b.addEventListener('click', function () {
        switchPanel(b.dataset.tab);
      });
    });
    document.querySelectorAll('.memberRecordTab[data-rec]').forEach(function (b) {
      if (b.dataset.bound) return;
      b.dataset.bound = 'true';
      b.addEventListener('click', function () {
        switchRecord(b.dataset.rec);
      });
    });
    document.querySelectorAll('.memberRecordTab[data-coupon-tab]').forEach(function (b) {
      if (b.dataset.bound) return;
      b.dataset.bound = 'true';
      b.addEventListener('click', function () {
        switchCoupon(b.dataset.couponTab);
      });
    });
    document.querySelectorAll('.memberOrderFilters').forEach(function (c) {
      if (c.dataset.bound) return;
      c.dataset.bound = 'true';
      c.addEventListener('click', function (e) {
        var b = e.target.closest('.memberOrderFilter[data-filter]');
        if (!b) return;
        var type = c.dataset.orderStatusTabs === 'rental' ? 'rental' : 'purchase';
        state.filters[type] = b.dataset.filter || 'all';
        renderFilters(type, type === 'rental' ? state.rentalOrders : state.orders);
        if (type === 'rental') renderRentals();
        else renderOrders();
      });
    });
    document.querySelectorAll('#prefTags .memberPreferenceTag').forEach(function (t) {
      if (t.dataset.bound) return;
      t.dataset.bound = 'true';
      t.addEventListener('click', function () {
        t.classList.toggle('isSelected');
        var vals = Array.from(document.querySelectorAll('#prefTags .memberPreferenceTag.isSelected')).map(
          function (x) {
            return x.dataset.value;
          }
        );
        savePrefs(vals);
        syncPrefs(vals);
      });
    });
    function showMemberFieldError(inputId, message) {
      var input = document.getElementById(inputId);
      if (!input) return;
      input.classList.add('isInvalid');
      input.setAttribute('aria-invalid', 'true');
      var errEl = input.parentElement && input.parentElement.querySelector('.memberFieldError');
      if (!errEl) {
        errEl = document.createElement('p');
        errEl.className = 'memberFieldError';
        errEl.setAttribute('role', 'alert');
        input.insertAdjacentElement('afterend', errEl);
      }
      errEl.id = inputId + 'Error';
      errEl.textContent = message;
      errEl.hidden = false;
      input.setAttribute('aria-describedby', errEl.id);
      input.focus({ preventScroll: true });
    }
    function clearMemberFieldError(inputId) {
      var input = document.getElementById(inputId);
      if (!input) return;
      input.classList.remove('isInvalid');
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
      var errEl = input.parentElement && input.parentElement.querySelector('.memberFieldError');
      if (errEl) {
        errEl.hidden = true;
        errEl.textContent = '';
      }
    }
    var form = document.getElementById('profileForm');
    if (form && !form.dataset.bound) {
      form.dataset.bound = 'true';
      var profilePhoneInput = document.getElementById('profilePhone');
      if (profilePhoneInput && !profilePhoneInput.dataset.errorBound) {
        profilePhoneInput.dataset.errorBound = 'true';
        profilePhoneInput.addEventListener('input', function () {
          profilePhoneInput.value = profilePhoneInput.value.replace(/\D/g, '').slice(0, 10);
          if (profilePhoneInput.classList.contains('isInvalid')) {
            clearMemberFieldError('profilePhone');
          }
        });
      }
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        clearMemberFieldError('profileName');
        clearMemberFieldError('profilePhone');
        clearMemberFieldError('profileEmail');
        clearMemberFieldError('profileBirthday');
        var nameRaw = document.getElementById('profileName').value.trim();
        var phoneRaw = document.getElementById('profilePhone').value.trim();
        var emailInput = document.getElementById('profileEmail');
        var emailRaw = isGoogleProfileEmailLocked()
          ? String((state.user && state.user.email) || '').trim()
          : emailInput.value.trim();
        var birthdayRaw = document.getElementById('profileBirthday').value;
        if (!nameRaw) {
          showMemberFieldError('profileName', '請填寫姓名');
          return;
        }
        if (!phoneRaw) {
          showMemberFieldError('profilePhone', '請填寫手機');
          return;
        }
        if (window.isValidMobile && !window.isValidMobile(phoneRaw)) {
          showMemberFieldError('profilePhone', '手機須為 09 開頭的 10 碼數字（例：0988744144）');
          return;
        }
        if (!emailRaw || (window.isValidEmail && !window.isValidEmail(emailRaw))) {
          showMemberFieldError('profileEmail', '請填寫有效的電子郵件');
          return;
        }
        if (birthdayRaw && birthdayRaw > minimumAdultBirthday()) {
          showMemberFieldError('profileBirthday', '會員年齡必須滿 18 歲');
          return;
        }
        var s = savedProfile();
        s.name = nameRaw;
        s.phone = window.normalizeMobile
          ? window.normalizeMobile(phoneRaw)
          : phoneRaw.replace(/[\s\-()]/g, '');
        s.birthday = birthdayRaw;
        s.email = emailRaw;
        s.preferences = prefObject(
          Array.from(document.querySelectorAll('#prefTags .memberPreferenceTag.isSelected')).map(
            function (t) {
              return t.dataset.value;
            }
          )
        );
        localStorage.setItem('yurui_profile', JSON.stringify(s));
        syncProfileDisplayName(s.name);
        if (state.user) {
          state.user.phone = s.phone;
          state.user.email = s.email;
          state.user.birthday = s.birthday || null;
        }
        if (window.AppState && window.AppState.currentUser) {
          window.AppState.currentUser.phone = s.phone;
          window.AppState.currentUser.email = s.email;
          window.AppState.currentUser.birthday = s.birthday || null;
          window.saveAppState && window.saveAppState();
        }
        if (
          window.API &&
          window.API.memberProfile &&
          window.API.memberProfile.update &&
          state.user &&
          state.user.id
        ) {
          // 正式模式寫入 customers 主檔；preferences 仍走 localStorage，不在 profile PATCH 範圍。
          window.API.memberProfile
            .update({
              name: s.name,
              phone: s.phone,
              birthday: s.birthday || null,
            })
            .catch(function (err) {
              console.warn('Sync member profile failed', err);
              toast('會員資料同步失敗，請稍後再試', 'error');
            });
        } else if (
          window.API &&
          window.API.customers &&
          window.API.customers.update &&
          state.user &&
          state.user.id
        ) {
          // Mock 模式沿用 localStorage overlay。
          var profileUpdates = {
            name: s.name,
            phone: s.phone,
            birthday: s.birthday || null,
            preferences: s.preferences,
          };
          if (!isGoogleProfileEmailLocked()) profileUpdates.email = s.email;
          window.API.customers.update(state.user.id, profileUpdates).catch(function (err) {
            console.warn('Sync member profile failed', err);
          });
        }
        toast('會員資料已更新', 'success');
        applyProfile();
      });
    }
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function bindGlobal() {
    if (document.body.dataset.memberCenterActionsBound) return;
    document.body.dataset.memberCenterActionsBound = 'true';
    document.addEventListener('click', function (e) {
      var o = e.target.closest('[data-order-detail]');
      if (o) return window.openOrderDetail(o.dataset.orderDetail);
      var r = e.target.closest('[data-rental-detail]');
      if (r) return window.openRentalOrderDetail(r.dataset.rentalDetail);
      var cancelOrder = e.target.closest('[data-cancel-order]');
      if (cancelOrder) return window.cancelPurchaseOrder(cancelOrder.dataset.cancelOrder, cancelOrder);
      var cancelBooking = e.target.closest('[data-cancel-booking]');
      if (cancelBooking) return window.cancelRentalBooking(cancelBooking.dataset.cancelBooking);
      var rv = e.target.closest('[data-review-order]');
      if (rv)
        return window.openReviewModal(
          rv.dataset.reviewOrder,
          rv.dataset.reviewOrderItem,
          rv.dataset.reviewItem
        );
      var cp = e.target.closest('[data-copy-coupon]');
      if (cp) return copy(cp.dataset.copyCoupon);
      var no = e.target.closest('[data-notification-order-detail]');
      if (no) {
        switchPanel('records');
        switchRecord('purchase');
        return window.openOrderDetail(no.dataset.notificationOrderDetail);
      }
      var nr = e.target.closest('[data-notification-rental-detail]');
      if (nr) {
        switchPanel('records');
        switchRecord('rental');
        return window.openRentalOrderDetail(nr.dataset.notificationRentalDetail);
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeModal('profileOnboardingOverlay');
        closeModal('orderDetailOverlay');
        closeModal('reviewOverlay');
      }
    });
  }
  // 用途：整理會員中心函式行為
  function copy(code) {
    if (!code) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(function () {
        toast('折價券代碼已複製', 'success');
      });
      return;
    }
    var el = document.createElement('textarea');
    el.className = 'memberClipboardProxy';
    el.value = code;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    el.remove();
    toast('折價券代碼已複製', 'success');
  }
  // 用途：整理會員中心函式行為
  function bindModals() {
    [
      ['profileOnboardingOverlay', 'profileOnboardingClose'],
      ['orderDetailOverlay', 'orderDetailClose'],
      ['reviewOverlay', 'reviewClose'],
    ].forEach(function (p) {
      var o = document.getElementById(p[0]),
        c = document.getElementById(p[1]);
      if (c && !c.dataset.bound) {
        c.dataset.bound = 'true';
        c.addEventListener('click', function () {
          closeModal(p[0]);
        });
      }
      if (o && !o.dataset.bound) {
        o.dataset.bound = 'true';
        o.addEventListener('click', function (e) {
          if (e.target === o) closeModal(p[0]);
        });
        o.addEventListener('keydown', function (e) {
          if (e.key !== 'Tab') return;
          var f = Array.from(
            o.querySelectorAll('button,[href],input,textarea,[tabindex]:not([tabindex="-1"])')
          ).filter(function (x) {
            return !x.disabled && !x.hidden;
          });
          if (!f.length) return;
          if (e.shiftKey && document.activeElement === f[0]) {
            e.preventDefault();
            f[f.length - 1].focus();
          } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
            e.preventDefault();
            f[0].focus();
          }
        });
      }
    });
    var onboardingAcknowledge = document.getElementById('profileOnboardingAcknowledge');
    if (onboardingAcknowledge && !onboardingAcknowledge.dataset.bound) {
      onboardingAcknowledge.dataset.bound = 'true';
      onboardingAcknowledge.addEventListener('click', function () {
        closeModal('profileOnboardingOverlay');
      });
    }
    document.querySelectorAll('.memberRatingStar').forEach(function (b) {
      if (b.dataset.bound) return;
      b.dataset.bound = 'true';
      b.addEventListener('click', function () {
        stars(b.dataset.reviewRating);
      });
      b.addEventListener('mouseenter', function () {
        previewStars(b.dataset.reviewRating);
      });
      b.addEventListener('mouseleave', function () {
        previewStars(0);
      });
    });
    var form = document.getElementById('reviewForm');
    var photoInput = document.getElementById('reviewPhotos');
    var reviewContent = document.getElementById('reviewContent');
    if (reviewContent && !reviewContent.dataset.bound) {
      reviewContent.dataset.bound = 'true';
      reviewContent.addEventListener('input', function () {
        updateReviewCharacterCount();
        reviewContent.classList.remove('isInvalid');
        reviewContent.removeAttribute('aria-invalid');
        var contentError = document.getElementById('reviewContentError');
        if (contentError) contentError.hidden = true;
      });
    }
    if (photoInput && !photoInput.dataset.bound) {
      photoInput.dataset.bound = 'true';
      photoInput.addEventListener('change', function () {
        var selected = Array.from(photoInput.files || []);
        var nextTotal = state.review.files.length + selected.length;
        var invalid = selected.find(function (file) {
          return !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024;
        });
        if (nextTotal > 5 || invalid) {
          photoInput.value = '';
          toast(nextTotal > 5 ? '評論圖片最多 5 張' : '圖片格式不支援或超過 5 MB', 'warning');
          return;
        }
        selected.forEach(function (file) {
          state.review.files.push({ file: file, previewUrl: URL.createObjectURL(file) });
        });
        photoInput.value = '';
        renderReviewPhotoPreview();
      });
    }
    if (form && !form.dataset.bound) {
      form.dataset.bound = 'true';
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (form.dataset.submitting === 'true') return;
        clearReviewValidation();
        if (!state.review.orderId || !state.review.orderItemId || !state.review.rating) {
          showReviewFieldError(
            'reviewRatingError',
            document.getElementById('reviewRatingGroup'),
            '必須選擇 1 至 5 星。'
          );
          document.querySelector('.memberRatingStar')?.focus();
          return;
        }
        var rawComment = document.getElementById('reviewContent').value;
        if (rawComment.length > 1000) {
          showReviewFieldError(
            'reviewContentError',
            document.getElementById('reviewContent'),
            '評論內容不可超過 1000 字。'
          );
          document.getElementById('reviewContent').focus();
          return;
        }
        if (window.API && window.API.reviews && window.API.reviews.create) {
          setReviewSubmitting(true);
          try {
            var newPhotoEntries = state.review.files.filter(function (entry) { return entry.file; });
            var retainedPhotoUrls = state.review.files
              .filter(function (entry) { return entry.existingUrl; })
              .map(function (entry) { return entry.existingUrl; });
            var uploadedPhotoUrls =
              newPhotoEntries.length > 0
                ? await window.API.reviews.uploadPhotos(
                    state.review.orderItemId,
                    newPhotoEntries.map(function (entry) { return entry.file; })
                  )
                : [];
            var payload = {
              orderItemId: state.review.orderItemId,
              rating: state.review.rating,
              comment: rawComment.trim() || null,
              photoUrls: retainedPhotoUrls.concat(uploadedPhotoUrls),
            };
            var review = state.review.reviewId
              ? await window.API.reviews.update(state.review.reviewId, payload)
              : await window.API.reviews.create(payload);
            if (state.review.reviewId) {
              state.reviews = state.reviews.map(function (current) {
                return current.id === review.id ? review : current;
              });
            } else {
              state.reviews.push(review);
            }
            renderOrders();
            var reviewedOrder = state.orders.find(function (candidate) {
              return String(candidate.id) === String(state.review.orderId);
            });
            var detailBody = document.getElementById('orderDetailBody');
            if (reviewedOrder && detailBody) {
              detailBody.innerHTML = detailRows(
                reviewedOrder,
                meta('purchase', reviewedOrder.status),
                'purchase'
              );
            }
            closeModal('reviewOverlay');
            clearReviewPhotos();
            toast(state.review.reviewId ? '評論已更新' : '商品評價已送出', 'success');
          } catch (error) {
            showReviewSubmitError(error);
          } finally {
            setReviewSubmitting(false);
          }
          return;
        }
        toast('評價功能不可用', 'error');
      });
    }
    var deleteReviewButton = document.getElementById('deleteReviewBtn');
    if (deleteReviewButton && !deleteReviewButton.dataset.bound) {
      deleteReviewButton.dataset.bound = 'true';
      deleteReviewButton.addEventListener('click', async function () {
        if (!state.review.reviewId || !window.confirm('確定要刪除這則評論嗎？')) return;
        try {
          await window.API.reviews.delete(state.review.reviewId);
          state.reviews = state.reviews.filter(function (review) {
            return review.id !== state.review.reviewId;
          });
          closeModal('reviewOverlay');
          clearReviewPhotos();
          renderOrders();
          toast('評論已刪除', 'success');
        } catch {
          toast('評論刪除失敗，請稍後再試', 'error');
        }
      });
    }
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function bindNotifications() {
    var list = document.getElementById('notificationList');
    if (list && !list.dataset.bound) {
      list.dataset.bound = 'true';
      // 點通知：標已讀；若有 orderId 則開訂單明細（bindGlobal 會處理 data-notification-order-detail）
      list.addEventListener('click', function (e) {
        var item = e.target.closest('.memberNotification[data-notif-id]');
        if (!item || !state.notifications) return;
        var n = state.notifications.find(function (x) {
          return x.id === item.dataset.notifId;
        });
        if (n) n.read = true;
        renderNotifications();
        updateStats();
        // 有訂單關聯時再開明細（避免與 bindGlobal 搶事件：這裡主動開，並 stopPropagation）
        if (n && n.orderId) {
          e.stopPropagation();
          switchPanel('records');
          switchRecord('purchase');
          window.openOrderDetail(n.orderId);
        }
      });
      // 鍵盤：Enter / Space 也可開訂單通知
      list.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var item = e.target.closest('.memberNotification[data-notif-id]');
        if (!item || !item.dataset.notificationOrderDetail) return;
        e.preventDefault();
        item.click();
      });
    }
    var all = document.getElementById('markAllReadBtn');
    if (all && !all.dataset.bound) {
      all.dataset.bound = 'true';
      all.addEventListener('click', function () {
        if (state.notifications)
          state.notifications.forEach(function (n) {
            n.read = true;
          });
        renderNotifications();
        updateStats();
        toast('通知已全部標示為已讀', 'success');
      });
    }
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function init() {
    var root = document.getElementById('memberCenterComponentRoot');
    if (!root) return;
    state.root = root;
    document.querySelectorAll('[data-member-center-home-link]').forEach(function (a) {
      a.setAttribute('href', cfg.homeHref || 'home.html');
    });
    bind();
    bindGlobal();
    bindModals();
    bindNotifications();
    var onboarding = new URLSearchParams(window.location.search).get('onboarding');
    if (onboarding === 'profile') {
      switchPanel('profile');
      setTimeout(function () {
        document.getElementById('profileName')?.focus({ preventScroll: true });
        openModal('profileOnboardingOverlay');
      }, 0);
    }
    var login = document.getElementById('guardLoginBtn');
    if (login && !login.dataset.bound) {
      login.dataset.bound = 'true';
      login.addEventListener('click', function () {
        if (typeof window.openModal === 'function') window.openModal('loginModal');
      });
    }
    window.syncMemberPreferenceTags = syncPrefs;
    switchCoupon('available');
    applyLogin();
    loadData();
    bindRefreshEvents();
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  window.initMemberCenterComponent = function () {
    if (state.initialized && state.root === document.getElementById('memberCenterComponentRoot')) {
      loadData();
      applyLogin();
      return;
    }
    state.initialized = true;
    init();
  };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', window.initMemberCenterComponent);
  else window.initMemberCenterComponent();
})();
