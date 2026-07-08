(function () {
  'use strict';
  var cfg = Object.assign(
    {
      dataBasePath: '../data',
      authStorageKey: 'currentUser',
      homeHref: 'home.html',
      requireLogin: true,
    },
    window.MemberCenterConfig || {}
  );
  var REVIEW_KEY = 'member_center_reviews';
  var MOCK_ORDERS_KEY = 'mockOrders';
  var MOCK_POINTS_KEY = 'mockUserPointDeltas';
  var MEMBER_PREFERENCE_DRAFT_KEY = 'memberPreferenceDraft';
  var statusMeta = {
    purchase: [
      ['all', '全部', ''],
      ['unshipped', '待出貨', 'isPending'],
      ['shipped', '已出貨', 'isUpcoming'],
      ['delivered', '已完成', 'isDone'],
      ['returned', '已退貨', 'isCancelled'],
    ],
    rental: [
      ['all', '全部', ''],
      ['pending', '待確認', 'isPending'],
      ['confirmed', '已確認', 'isUpcoming'],
      ['completed', '已完成', 'isDone'],
      ['refunded', '已退款', 'isCancelled'],
    ],
  };
  var aliases = {
    purchase: { processing: 'unshipped', cod: 'paid' },
    rental: { processing: 'pending', shipped: 'confirmed', delivered: 'completed', cancelled: 'refunded' },
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
    filters: { purchase: 'all', rental: 'all' },
    review: { orderId: '', itemName: '', rating: 0, mode: 'write' },
    lastFocus: null,
    modalScrollPosition: null,
    initialized: false,
  };

  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function path(file) {
    return String(cfg.dataBasePath || '').replace(/\/+$/, '') + '/' + file;
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function parse(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function arrays(key) {
    var value = parse(localStorage.getItem(key), []);
    return Array.isArray(value) ? value : [];
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
  async function json(file, fallback) {
    try {
      var r = await fetch(path(file), { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch {
      return fallback;
    }
  }

  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function fallbackUsers() {
    return [
      {
        id: 'user-001',
        name: 'Yurui Camper',
        email: 'member@yuruicamp.test',
        phone: '0912-345-678',
        address: '台北市中山區露營路 100 號',
        birthday: '1995-01-01',
        tierName: 'Explorer',
        joinDate: '2025-01-15',
        points: 760,
        nextTierSpend: 30000,
        preferences: { styles: ['backpacking', 'hiking'], equipment: ['tent', 'backpack'] },
        coupons: [
          { code: 'WELCOME100', discount: 100, type: 'fixed', minOrder: 500, expiry: '2026-12-31' },
          { code: 'SUMMER10', discount: 10, type: 'percent', minOrder: 1000, expiry: '2026-08-31' },
        ],
        notifications: [
          {
            id: 'n1',
            title: '訂單已成立',
            message: '你的訂單正在準備出貨。',
            time: '2026-05-13',
            read: false,
          },
          {
            id: 'n2',
            title: '折價券提醒',
            message: '記得在期限前使用會員折價券。',
            time: '2026-05-10',
            read: false,
          },
        ],
      },
    ];
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function fallbackOrders() {
    return [
      {
        id: 'ord-001',
        userId: 'user-001',
        orderNumber: '#ORD-20260101',
        createdAt: '2026-01-01',
        status: 'delivered',
        paymentStatus: 'paid',
        subtotal: 3797,
        total: 3797,
        points: 380,
        canReview: true,
        items: [
          { name: '兩人帳篷', price: 2999, quantity: 1, image: 'https://picsum.photos/seed/tent1/80/80' },
        ],
      },
      {
        id: 'ord-002',
        userId: 'user-001',
        orderNumber: '#ORD-20260310',
        createdAt: '2026-03-10',
        status: 'unshipped',
        paymentStatus: 'paid',
        subtotal: 4997,
        discount: 500,
        total: 4497,
        points: 500,
        items: [
          { name: '防風外套', price: 3599, quantity: 1, image: 'https://picsum.photos/seed/jacket1/80/80' },
        ],
      },
    ];
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function fallbackRentals() {
    return [
      {
        id: 'rent-001',
        userId: 'user-001',
        orderNumber: '#RENT-20260412',
        createdAt: '2026-04-12',
        rentalStart: '2026-04-18',
        rentalEnd: '2026-04-20',
        pickupStore: '台北門市',
        returnStore: '台北門市',
        status: 'completed',
        paymentStatus: 'paid',
        subtotal: 1320,
        deposit: 2000,
        total: 3320,
        items: [
          { name: '露營帳篷', price: 480, quantity: 1, image: 'https://picsum.photos/seed/rent-tent/80/80' },
        ],
      },
    ];
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function loginUser() {
    if (typeof window.YuruiAuth?.getUser === 'function') return window.YuruiAuth.getUser();
    if (window.AppState && window.AppState.isLoggedIn && window.AppState.currentUser)
      return window.AppState.currentUser;

    if (localStorage.getItem('isLoggedIn') === 'false') return null;
    var u = parse(localStorage.getItem(cfg.authStorageKey || 'currentUser'), null);
    if (u) return u;
    return localStorage.getItem('isLoggedIn') === 'true' ? { id: 'user-001' } : null;
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function loggedIn() {
    return cfg.requireLogin === false || Boolean(loginUser());
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function norm(type, value) {
    return (aliases[type] && aliases[type][value]) || value || 'pending';
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
  function currentMemberId() {
    var u = loginUser() || {};
    return u.id || u.userId || 'user-001';
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function mergeOrders(base, mock) {
    var m = new Map();
    (Array.isArray(base) ? base : []).concat(Array.isArray(mock) ? mock : []).forEach(function (o) {
      if (o && o.id) m.set(o.id, o);
    });
    return Array.from(m.values());
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function pointOf(order) {
    var p = Number(order && order.points);
    return Number.isFinite(p) ? p : Math.ceil((Number(order && order.subtotal) || 0) * 0.1);
  }
  // 用途：將訂單付款代碼轉為會員明細可讀文字。
  function paymentLabel(value) {
    var labels = {
      'credit-card': '信用卡',
      'line-pay': 'LINE Pay',
      cod: '貨到付款',
      transfer: '銀行轉帳',
    };
    return labels[value] || value || '--';
  }
  // 用途：將物流與門市欄位整理成明細資訊列。
  function fulfillmentLabel(order, type) {
    if (type === 'rental') {
      return '取貨 / 還貨：' + (order.pickupStore || '--') + ' / ' + (order.returnStore || '--');
    }
    if (order.shippingMethod === 'store')
      return '取貨門市：' + (order.storeAddress || order.shippingAddress || '--');
    return '配送地址：' + (order.shippingAddress || order.storeAddress || '--');
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function applyPointDeltas(users) {
    var deltas = arrays(MOCK_ORDERS_KEY).reduce(
      function (acc, o) {
        if (norm('purchase', o && o.status) === 'delivered') {
          var uid = o.userId || 'user-001';
          acc[uid] = (Number(acc[uid]) || 0) + pointOf(o);
        }
        return acc;
      },
      parse(localStorage.getItem(MOCK_POINTS_KEY), {}) || {}
    );
    return users.map(function (u) {
      return Object.assign({}, u, { points: (Number(u.points) || 0) + (Number(deltas[u.id]) || 0) });
    });
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
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function savedPreferenceDraft() {
    if (!sessionStorage.getItem(MEMBER_PREFERENCE_DRAFT_KEY)) return null;
    return parse(sessionStorage.getItem(MEMBER_PREFERENCE_DRAFT_KEY), { styles: [], equipment: [] });
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function selectedPrefs() {
    var draft = savedPreferenceDraft(),
      profile = savedProfile();
    if (draft) return prefValues(draft);
    if (Object.prototype.hasOwnProperty.call(profile, 'preferences')) return prefValues(profile.preferences);
    return [];
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
  function savePreferenceDraft(values) {
    sessionStorage.setItem(MEMBER_PREFERENCE_DRAFT_KEY, JSON.stringify(prefObject(values)));
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function selectedPreferenceObject() {
    var draft = savedPreferenceDraft();
    if (draft) return prefObject(draft);
    return prefObject(
      Array.from(document.querySelectorAll('#prefTags .memberPreferenceTag.isSelected')).map(function (t) {
        return t.dataset.value;
      })
    );
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function clearPreferenceDraft() {
    sessionStorage.removeItem(MEMBER_PREFERENCE_DRAFT_KEY);
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function applyProfile() {
    if (!state.user) return;
    var s = savedProfile();
    var name = s.name || state.user.name || 'Yurui Camper';
    var email = state.user.email || s.email || 'member@yuruicamp.test';
    text('mcAvatar', name.charAt(0).toUpperCase());
    text('mcName', name);
    text('mcEmail', email);
    text('cardName', name);
    text('cardTier', state.user.tierName || 'Explorer');
    text('cardSince', '加入日期：' + (state.user.joinDate || '--'));
    text('cardPoints', '回饋點數：' + Number(state.user.points || 0).toLocaleString('zh-TW'));
    input('profileName', name);
    input('profilePhone', s.phone || state.user.phone || '');
    input('profileEmail', email);
    input('profileBirthday', s.birthday || state.user.birthday || '');
    input('profileAddress', s.address || state.user.address || '');
    renderProgress();
    syncPrefs(selectedPrefs());
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function renderProgress() {
    var next = Number(state.user && state.user.nextTierSpend) || 0;
    var spent = state.orders.reduce(function (t, o) {
      return norm('purchase', o.status) === 'delivered' ? t + (Number(o.subtotal) || 0) : t;
    }, 0);
    var progress = next > 0 ? Math.min(Math.round((spent / next) * 100), 100) : 0;
    text('nextTierSpend', money(Math.max(next - spent, 0)));
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
  function thumbs(items) {
    var list = Array.isArray(items) ? items : [];
    return (
      '<div class="memberOrderThumbs">' +
      list
        .slice(0, 3)
        .map(function (i) {
          var src = i.image || 'https://picsum.photos/seed/fallback/80/80';
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
  // 用途：統一讀取評論清單，避免各處直接解析 localStorage 時判斷標準不一致。
  function storedReviews() {
    var reviews = parse(localStorage.getItem(REVIEW_KEY), []);
    return Array.isArray(reviews) ? reviews : [];
  }
  // 用途：只有同時具備訂單、1-5 分評分與非空評論內容，才視為有效完成評論。
  function isValidReview(review) {
    if (!review || !review.orderId) return false;
    var rating = Number(review.rating);
    var content = String(review.content || '').trim();
    return rating >= 1 && rating <= 5 && content.length > 0;
  }
  // 用途：以有效評論紀錄作為是否已評論的依據，不只依賴訂單上的 reviewed 旗標。
  function reviewForOrder(orderId) {
    if (!orderId) return null;
    var reviews = storedReviews().filter(function (review) {
      return review && review.orderId === orderId && isValidReview(review);
    });
    return reviews.length ? reviews[reviews.length - 1] : null;
  }
  // 用途：格式化查看評論時顯示的送出時間，時間無效時保留原始值避免畫面空白。
  function reviewDateLabel(value) {
    if (!value) return '--';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  // 用途：判斷訂單是否可新增評論；只要已有有效評論，就改走查看評論流程。
  function canWriteReview(o) {
    if (!o || !o.canReview || norm('purchase', o.status) !== 'delivered') return false;
    return !reviewForOrder(o.id);
  }
  // 用途：判斷訂單是否能查看既有評論，確保空內容或無評分的舊資料不會被當成已評論。
  function canViewReview(o) {
    return Boolean(o && reviewForOrder(o.id));
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
        var review = '';
        if (canViewReview(o)) {
          review =
            '<button class="memberOrderDetailButton" type="button" data-review-detail="' +
            html(o.id) +
            '">查看評論</button>';
        } else if (canWriteReview(o)) {
          review =
            '<button class="memberOrderDetailButton" type="button" data-review-order="' +
            html(o.id) +
            '" data-review-item="' +
            html(title) +
            '">寫評價</button>';
        }
        return (
          '<article class="memberOrderCard" data-order-id="' +
          html(o.id) +
          '">' +
          '<div class="memberOrderInfo">' +
          '<h3 class="memberOrderTitle">' +
          html(title) +
          '</h3>' +
          '<p class="memberOrderMeta">' +
          html(o.orderNumber || o.id) +
          ' ｜ ' +
          html(o.createdAt || '--') +
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
          review +
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
        '目前沒有符合條件的預約與租借紀錄' +
        '</div>';
      return;
    }
    c.innerHTML = orders
      .map(function (o) {
        var st = meta('rental', o.status);
        return (
          '<article class="memberOrderCard" data-rental-order-id="' +
          html(o.id) +
          '">' +
          '<div class="memberOrderInfo">' +
          '<h3 class="memberOrderTitle">' +
          html(itemTitle(o.items)) +
          '</h3>' +
          '<p class="memberOrderMeta">' +
          html(o.orderNumber || o.id) +
          ' ｜ ' +
          html(o.rentalStart || '--') +
          ' - ' +
          html(o.rentalEnd || '--') +
          ' ｜ ' +
          html(o.pickupStore || '--') +
          ' / ' +
          html(o.returnStore || '--') +
          '</p>' +
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
    return c.used || (c.expiry && new Date(c.expiry + 'T23:59:59') < new Date());
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function renderCoupons() {
    var a = document.getElementById('activeCoupons'),
      e = document.getElementById('expiredCoupons');
    if (!a || !e) return;
    var list = ((state.user && state.user.coupons) || []).map(function (c) {
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
        html(c.expiry || '無期限') +
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
    var list = (state.user && state.user.notifications) || [];
    if (!list.length) {
      c.innerHTML = '<div class="memberEmptyState">目前沒有通知</div>';
      return;
    }
    c.innerHTML = list
      .map(function (n) {
        var seen = Boolean(n.read);
        return (
          '<article class="memberNotification' +
          (seen ? ' isRead' : '') +
          '" data-notif-id="' +
          html(n.id) +
          '">' +
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
        title: '訂單 ' + (o.orderNumber || o.id) + ' ' + meta('purchase', o.status).label,
        type: 'purchase',
        id: o.id,
      });
    });
    state.rentalOrders.slice(0, 2).forEach(function (o) {
      list.push({
        date: o.createdAt,
        title: '租借 ' + (o.orderNumber || o.id) + ' ' + meta('rental', o.status).label,
        type: 'rental',
        id: o.id,
      });
    });
    ((state.user && state.user.notifications) || []).slice(0, 2).forEach(function (n) {
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
              html(i.date || '--') +
              '</div>' +
              '</article>'
            );
          })
          .join('')
      : '<div class="memberEmptyState">目前沒有最近活動</div>';
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function updateStats() {
    var coupons = ((state.user && state.user.coupons) || []).filter(function (c) {
      return !couponOff(c);
    }).length;
    var unread = ((state.user && state.user.notifications) || []).filter(function (n) {
      return !n.read;
    }).length;
    text(
      'statOrders',
      state.orders.filter(function (o) {
        return ['paid', 'unshipped', 'shipped'].includes(norm('purchase', o.status));
      }).length
    );
    text(
      'statBookings',
      state.rentalOrders.filter(function (o) {
        return ['paid', 'pending', 'confirmed'].includes(norm('rental', o.status));
      }).length
    );
    text('statCoupons', coupons);
    text('statUnread', unread);
  }
  function detailRows(order, st, type) {
    var items = Array.isArray(order.items) ? order.items : [];
    var itemTitle = type === 'rental' ? '租借品項' : '商品明細';
    var subtotalLabel = type === 'rental' ? '租借費用' : '商品小計';
    var shippingFee = Number(order.shippingFee || 0);
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
    if (type === 'purchase' && order.trackingNumber) {
      infoRows.push(
        '<p class="memberDetailMeta"><i class="bi bi-truck" aria-hidden="true"></i><span>物流追蹤：' +
          html(order.trackingNumber) +
          '</span></p>'
      );
    }
    if (type === 'rental') {
      infoRows.unshift(
        '<p class="memberDetailMeta">租借期間：' +
          html(order.rentalStart || '--') +
          ' - ' +
          html(order.rentalEnd || '--') +
          '</p>'
      );
    }
    return (
      '<div class="memberDetailSummary">' +
      '<div class="memberDetailDate">' +
      html(order.createdAt || '--') +
      '</div>' +
      '<span class="memberOrderStatus ' +
      st.cls +
      '">' +
      html(st.label) +
      '</span>' +
      '</div>' +
      '<section class="memberDetailSection" aria-label="' +
      html(itemTitle) +
      '">' +
      '<h3 class="memberDetailSectionTitle">' +
      html(itemTitle) +
      '</h3>' +
      '<div class="memberDetailItems">' +
      items
        .map(function (i) {
          var quantity = Number(i.quantity || 1);
          return (
            '<article class="memberDetailItem">' +
            '<img class="memberDetailItemImage" src="' +
            html(i.image || 'https://picsum.photos/seed/yurui-detail/80/80') +
            '" alt="" loading="lazy" />' +
            '<div class="memberDetailItemText">' +
            '<h4 class="memberDetailItemName">' +
            html(i.name || '商品') +
            '</h4>' +
            '<p class="memberDetailItemMeta">x ' +
            quantity +
            '，' +
            money((i.price || 0) * quantity) +
            '</p>' +
            '</div>' +
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
      money(order.subtotal) +
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
      money(order.total) +
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
      '<a class="memberDetailLineButton" href="https://line.me/R/ti/p/@yuruicamp" target="_blank" rel="noopener">' +
      '<i class="bi bi-chat-dots" aria-hidden="true"></i>' +
      '<span>使用 LINE 詢問' +
      (type === 'rental' ? '租借' : '訂單') +
      '</span>' +
      '</a>'
    );
  }
  // 用途：記錄 modal 開啟前的頁面位置，避免 focus 或鎖定滾動時把畫面帶到最上方。
  function currentScrollPosition() {
    var doc = document.documentElement;
    return {
      x: window.scrollX || window.pageXOffset || doc.scrollLeft || 0,
      y: window.scrollY || window.pageYOffset || doc.scrollTop || 0,
    };
  }
  // 用途：modal 開啟或關閉後還原原本位置；requestAnimationFrame 處理瀏覽器延後 focus 捲動。
  function restoreScrollPosition(position) {
    if (!position) return;
    window.scrollTo(position.x, position.y);
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(function () {
        window.scrollTo(position.x, position.y);
      });
    }
  }
  // 用途：聚焦 modal 或原按鈕時禁止瀏覽器自動捲動，舊瀏覽器則回退到一般 focus。
  function focusWithoutScroll(element) {
    if (!element || typeof element.focus !== 'function') return;
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
  }
  // 用途：開啟會員中心 modal 時保留背景頁位置，避免 dialog focus 造成頁面跳動。
  function openModal(id) {
    var o = document.getElementById(id);
    if (!o) return;
    var scrollPosition = currentScrollPosition();
    state.lastFocus = document.activeElement;
    state.modalScrollPosition = scrollPosition;
    o.classList.add('isOpen');
    o.setAttribute('aria-hidden', 'false');
    document.body.classList.add('memberModalOpen');
    var d = o.querySelector('.memberModalDialog');
    focusWithoutScroll(d);
    restoreScrollPosition(scrollPosition);
  }
  // 用途：關閉會員中心 modal 後回到開啟前位置，避免恢復 focus 時跳到頁面最上方。
  function closeModal(id) {
    var o = document.getElementById(id);
    if (!o) return;
    var scrollPosition = state.modalScrollPosition || currentScrollPosition();
    o.classList.remove('isOpen');
    o.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.memberModalOverlay.isOpen')) {
      document.body.classList.remove('memberModalOpen');
      state.modalScrollPosition = null;
    }
    focusWithoutScroll(state.lastFocus);
    restoreScrollPosition(scrollPosition);
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  window.openOrderDetail = function (id) {
    var o = state.orders.find(function (x) {
      return x.id === id;
    });
    if (!o) return;
    text('orderDetailTitle', '訂單詳情 ' + (o.orderNumber || o.id));
    var b = document.getElementById('orderDetailBody');
    if (b) b.innerHTML = detailRows(o, meta('purchase', o.status), 'purchase');
    openModal('orderDetailOverlay');
  };
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  window.openRentalOrderDetail = function (id) {
    var o = state.rentalOrders.find(function (x) {
      return x.id === id;
    });
    if (!o) return;
    text('orderDetailTitle', '預約與租借詳情 ' + (o.orderNumber || o.id));
    var b = document.getElementById('orderDetailBody');
    if (b) b.innerHTML = detailRows(o, meta('rental', o.status), 'rental');
    openModal('orderDetailOverlay');
  };
  // 用途：開啟寫評價模式，重置評分與評論內容，避免沿用上一筆訂單的輸入狀態。
  window.openReviewModal = function (id, name) {
    state.review = { orderId: id, itemName: name || '', rating: 0, mode: 'write' };
    setReviewModalMode('write');
    text('reviewTitle', '撰寫評價');
    text('reviewProductName', name || '商品評價');
    text('reviewMeta', '');
    input('reviewContent', '');
    stars(0);
    openModal('reviewOverlay');
  };
  // 用途：開啟查看評論模式，將既有有效評論填回 modal，並鎖定欄位避免誤修改。
  window.openReviewDetailModal = function (id) {
    var review = reviewForOrder(id);
    if (!review) {
      toast('找不到有效評論內容', 'warning');
      return;
    }
    state.review = {
      orderId: review.orderId,
      itemName: review.itemName || '',
      rating: Number(review.rating) || 0,
      mode: 'view',
    };
    setReviewModalMode('view');
    text('reviewTitle', '查看評論');
    text('reviewProductName', review.itemName || '商品評價');
    text('reviewMeta', '送出時間：' + reviewDateLabel(review.createdAt));
    input('reviewContent', review.content || '');
    stars(review.rating);
    openModal('reviewOverlay');
  };
  // 用途：在寫入與查看模式間切換控制項狀態，讓同一個 modal 可重複使用。
  function setReviewModalMode(mode) {
    var isView = mode === 'view';
    var meta = document.getElementById('reviewMeta');
    var content = document.getElementById('reviewContent');
    var submit = document.getElementById('submitReviewBtn');
    if (meta) meta.hidden = !isView;
    if (content) content.readOnly = isView;
    if (submit) submit.hidden = isView;
    document.querySelectorAll('.memberRatingStar').forEach(function (button) {
      button.disabled = isView;
    });
  }
  // 用途：依目前評分狀態更新星星，寫評論與查看評論都使用同一套顯示規則。
  function stars(rating) {
    state.review.rating = Number(rating) || 0;
    document.querySelectorAll('.memberRatingStar').forEach(function (b) {
      var on = Number(b.dataset.reviewRating) <= state.review.rating;
      b.classList.toggle('isSelected', on);
      b.setAttribute('aria-checked', String(on));
    });
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
    var rs = await Promise.all([
      json('users.json', fallbackUsers()),
      json('orders.json', fallbackOrders()),
      json('rentalOrders.json', fallbackRentals()),
    ]);
    var uid = currentMemberId();
    var users = Array.isArray(rs[0]) ? rs[0] : fallbackUsers();
    state.user =
      applyPointDeltas(users).find(function (u) {
        var l = loginUser() || {};
        return u.id === (l.id || l.userId) || u.email === l.email;
      }) || applyPointDeltas(users)[0];
    state.orders = mergeOrders(
      Array.isArray(rs[1]) ? rs[1] : fallbackOrders(),
      arrays(MOCK_ORDERS_KEY).filter(function (o) {
        return o && o.type !== 'booking' && o.type !== 'rental';
      })
    ).filter(function (o) {
      return !o.userId || o.userId === uid || (state.user && o.userId === state.user.id);
    });
    state.rentalOrders = mergeOrders(
      Array.isArray(rs[2]) ? rs[2] : fallbackRentals(),
      arrays(MOCK_ORDERS_KEY).filter(function (o) {
        return o && (o.type === 'booking' || o.type === 'rental');
      })
    ).filter(function (o) {
      return !o.userId || o.userId === uid || (state.user && o.userId === state.user.id);
    });
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
        savePreferenceDraft(vals);
        syncPrefs(vals);
      });
    });
    var form = document.getElementById('profileForm');
    if (form && !form.dataset.bound) {
      form.dataset.bound = 'true';
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var s = savedProfile();
        s.name = document.getElementById('profileName').value.trim();
        s.phone = document.getElementById('profilePhone').value.trim();
        s.address = document.getElementById('profileAddress').value.trim();
        s.birthday = document.getElementById('profileBirthday').value;
        s.preferences = selectedPreferenceObject();
        localStorage.setItem('yurui_profile', JSON.stringify(s));
        clearPreferenceDraft();
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
      var rd = e.target.closest('[data-review-detail]');
      if (rd) return window.openReviewDetailModal(rd.dataset.reviewDetail);
      var rv = e.target.closest('[data-review-order]');
      if (rv) return window.openReviewModal(rv.dataset.reviewOrder, rv.dataset.reviewItem);
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
    document.querySelectorAll('.memberRatingStar').forEach(function (b) {
      if (b.dataset.bound) return;
      b.dataset.bound = 'true';
      b.addEventListener('click', function () {
        stars(b.dataset.reviewRating);
      });
    });
    var form = document.getElementById('reviewForm');
    if (form && !form.dataset.bound) {
      form.dataset.bound = 'true';
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (state.review.mode === 'view') return;
        if (!state.review.orderId || !state.review.rating) {
          toast('請先選擇評分', 'warning');
          return;
        }
        var contentEl = document.getElementById('reviewContent');
        var content = contentEl ? contentEl.value.trim() : '';
        if (!content) {
          toast('請輸入評論內容', 'warning');
          if (contentEl) contentEl.focus();
          return;
        }
        // 用途：同一訂單只保留最新一筆有效評論，避免重複資料造成查看內容不明確。
        var reviews = storedReviews().filter(function (review) {
          return !review || review.orderId !== state.review.orderId;
        });
        reviews.push({
          orderId: state.review.orderId,
          itemName: state.review.itemName,
          rating: state.review.rating,
          content: content,
          createdAt: new Date().toISOString(),
        });
        localStorage.setItem(REVIEW_KEY, JSON.stringify(reviews));
        var o = state.orders.find(function (x) {
          return x.id === state.review.orderId;
        });
        if (o) o.reviewed = true;
        renderOrders();
        closeModal('reviewOverlay');
        toast('評價已送出', 'success');
      });
    }
  }
  // 用途：整理會員中心函式行為，僅說明用途不改變邏輯。
  function bindNotifications() {
    var list = document.getElementById('notificationList');
    if (list && !list.dataset.bound) {
      list.dataset.bound = 'true';
      list.addEventListener('click', function (e) {
        var item = e.target.closest('.memberNotification[data-notif-id]');
        if (!item || !state.user) return;
        var n = (state.user.notifications || []).find(function (x) {
          return x.id === item.dataset.notifId;
        });
        if (n) n.read = true;
        renderNotifications();
        updateStats();
      });
    }
    var all = document.getElementById('markAllReadBtn');
    if (all && !all.dataset.bound) {
      all.dataset.bound = 'true';
      all.addEventListener('click', function () {
        if (state.user && Array.isArray(state.user.notifications))
          state.user.notifications.forEach(function (n) {
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
    window.clearInterval(state.loginTimer);
    state.loginTimer = window.setInterval(applyLogin, 1500);
    window.clearInterval(state.pointsTimer);
    state.pointsTimer = window.setInterval(
      function () {
        if (loggedIn()) loadData();
      },
      Number(cfg.pointsRefreshMs) || 5000
    );
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
