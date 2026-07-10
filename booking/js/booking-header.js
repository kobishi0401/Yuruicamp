(function () {
  'use strict';

  function readJsonStorage(key, fallback) {
    try {
      var value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[char];
    });
  }

  function formatMoney(value) {
    return 'NT$' + Number(value || 0).toLocaleString();
  }

  function getBookingCartTotal(cart) {
    var zoneCount = (cart.selected_zones || []).reduce(function (sum, zone) {
      return sum + (zone.quantity || 0);
    }, 0);
    var rentalCount = (cart.selected_rentals || []).reduce(function (sum, rental) {
      return sum + (rental.quantity || 0);
    }, 0);
    return zoneCount + rentalCount;
  }

  function updateBookingBadge() {
    var badge = document.getElementById('bookingBadge');
    var cart = readJsonStorage('bookingCart', null);
    var total = cart ? getBookingCartTotal(cart) : 0;
    if (!badge) return;
    badge.textContent = total > 9 ? '9+' : String(total);
    badge.hidden = total <= 0;
  }

  function getCurrentUser() {
    if (typeof window.YuruiAuth?.getUser !== 'function') {
      console.warn('YuruiAuth.getUser is not available. Booking header treats user as logged out.');
      return null;
    }

    return window.YuruiAuth.getUser();
  }

  function closeUserDropdown() {
    document.querySelectorAll('.bookingHeader .siteUserMenu').forEach(function (menu) {
      var trigger = menu.querySelector('.siteUserTrigger');
      var dropdown = menu.querySelector('.siteUserDropdown');

      if (trigger) trigger.setAttribute('aria-expanded', 'false');

      if (dropdown) {
        dropdown.hidden = true;
        dropdown.classList.remove('isOpen');
      }
    });
  }

  // 委派auth.logout 進行統一的清理，不額外在此檔清理造成不同步
  function logout() {
    if (typeof window.YuruiAuth?.logout !== 'function') {
      console.warn('YuruiAuth.logout is not available. Booking logout was not executed.');
      return false;
    }

    window.YuruiAuth.logout({ close: closeUserDropdown });
    return true;
  }

  function initUserDropdown() {
    var userMenu = document.querySelector('.bookingHeader .siteUserMenu');
    var trigger = userMenu ? userMenu.querySelector('.siteUserTrigger') : null;
    var dropdown = userMenu ? userMenu.querySelector('.siteUserDropdown') : null;
    var logoutButton = userMenu ? userMenu.querySelector('.siteLogoutButton') : null;
    if (!userMenu || !trigger || !dropdown || userMenu.dataset.dropdownBound === 'true') return;
    userMenu.dataset.dropdownBound = 'true';
    trigger.addEventListener('click', function (event) {
      var shouldOpen = trigger.getAttribute('aria-expanded') !== 'true';
      event.stopPropagation();
      dropdown.hidden = !shouldOpen;
      dropdown.classList.toggle('isOpen', shouldOpen);
      trigger.setAttribute('aria-expanded', String(shouldOpen));
    });
    if (logoutButton) {
      logoutButton.addEventListener('click', function (event) {
        event.preventDefault();
        logout();
      });
    }
  }

  function checkLoginState() {
    var loginButton = document.querySelector('.bookingHeader .bookingLoginButton');
    var userMenu = document.querySelector('.bookingHeader .siteUserMenu');
    var user = getCurrentUser();
    if (!loginButton || !userMenu) return;

    loginButton.hidden = Boolean(user && user.name);
    userMenu.hidden = !(user && user.name);
    if (user && user.name) {
      var userName = userMenu.querySelector('.siteUserName');
      var userAvatar = userMenu.querySelector('.siteUserAvatar');
      if (userName) userName.textContent = user.name;
      if (userAvatar) userAvatar.textContent = String(user.avatar || user.name.charAt(0)).toUpperCase();
      initUserDropdown();
    } else {
      closeUserDropdown();
    }
  }

  function setPanelState(panel, backdrop, trigger, shouldOpen) {
    if (panel) {
      panel.classList.toggle('isOpen', shouldOpen);
      panel.setAttribute('aria-hidden', String(!shouldOpen));
    }
    if (backdrop) {
      backdrop.hidden = !shouldOpen;
      backdrop.classList.toggle('isVisible', shouldOpen);
    }
    if (trigger) trigger.setAttribute('aria-expanded', String(shouldOpen));
    document.body.classList.toggle('isHeaderLayerOpen', shouldOpen);
  }

  function closeOffcanvas() {
    // 預約側邊選單：使用 booking* ID 對應 header.partial，避免殘留舊縮寫掛點。
    setPanelState(
      document.getElementById('bookingOffcanvasPanel'),
      document.getElementById('bookingOffcanvasBackdrop'),
      document.getElementById('bookingMenuButton'),
      false
    );
  }

  function openOffcanvas() {
    closeCartPanel();
    // 預約側邊選單：開啟前先關閉預約背包，避免兩個 header layer 同時顯示。
    setPanelState(
      document.getElementById('bookingOffcanvasPanel'),
      document.getElementById('bookingOffcanvasBackdrop'),
      document.getElementById('bookingMenuButton'),
      true
    );
    var panel = document.getElementById('bookingOffcanvasPanel');
    if (panel) panel.querySelector('a, button')?.focus();
  }

  function initOffcanvas() {
    var hamburger = document.getElementById('bookingMenuButton');
    var closeButton = document.getElementById('bookingOffcanvasClose');
    var backdrop = document.getElementById('bookingOffcanvasBackdrop');
    if (hamburger && hamburger.dataset.offcanvasBound !== 'true') {
      hamburger.dataset.offcanvasBound = 'true';
      hamburger.addEventListener('click', openOffcanvas);
    }
    if (closeButton && closeButton.dataset.offcanvasBound !== 'true') {
      closeButton.dataset.offcanvasBound = 'true';
      closeButton.addEventListener('click', closeOffcanvas);
    }
    if (backdrop && backdrop.dataset.offcanvasBound !== 'true') {
      backdrop.dataset.offcanvasBound = 'true';
      backdrop.addEventListener('click', closeOffcanvas);
    }
  }

  function renderCartRow(label, amount) {
    return (
      '<div class="bookingCartPanelRow"><span>' +
      escapeHtml(label) +
      '</span><strong>' +
      formatMoney(amount) +
      '</strong></div>'
    );
  }

  function renderCartPanel() {
    var body = document.getElementById('cartPanelBody');
    var footer = document.getElementById('cartPanelFooter');
    var cart = readJsonStorage('bookingCart', null);
    var html = '';
    if (!body) return;

    if (!cart) {
      body.innerHTML = [
        '<div class="bookingCartPanelEmpty">',
        '  <i class="bi bi-bag-x" aria-hidden="true"></i>',
        '  <p>預約背包目前是空的</p>',
        '  <a class="bookingCartPanelEmptyLink" href="./camp-search.html">前往搜尋營地</a>',
        '</div>',
      ].join('');
      if (footer) footer.hidden = true;
      return;
    }

    var info = cart.booking_info || {};
    var zones = cart.selected_zones || [];
    var rentals = cart.selected_rentals || [];
    var summary = cart.summary || {};

    if (zones.length > 0) {
      html += '<section class="bookingCartPanelSection" aria-label="營位">';
      html += '<h3 class="bookingCartPanelLabel">營位</h3>';
      zones.forEach(function (zone) {
        html += renderCartRow(
          (info.campground_name || '') + ' - ' + (zone.zone_type || '') + ' x' + (zone.quantity || 0),
          zone.subtotal
        );
      });
      if (info.check_in) {
        html +=
          '<p class="bookingCartPanelMeta"><i class="bi bi-calendar3" aria-hidden="true"></i> ' +
          escapeHtml(info.check_in) +
          ' 至 ' +
          escapeHtml(info.check_out || '') +
          '，共 ' +
          escapeHtml(info.total_days || 0) +
          ' 晚</p>';
      }
      html += '</section>';
    }

    if (rentals.length > 0) {
      html += '<section class="bookingCartPanelSection" aria-label="租借裝備">';
      html += '<h3 class="bookingCartPanelLabel">租借裝備</h3>';
      rentals.forEach(function (rental) {
        html += renderCartRow((rental.name || '') + ' x' + (rental.quantity || 0), rental.subtotal);
      });
      html += '</section>';
    }

    if (summary.final_amount !== undefined) {
      html +=
        '<div class="bookingCartPanelTotal"><span>合計</span><strong>' +
        formatMoney(summary.final_amount) +
        '</strong></div>';
    }
    html += '<button class="bookingCartPanelClear" id="cartPanelClear" type="button">清空預約背包</button>';
    body.innerHTML = html;
    if (footer) footer.hidden = false;

    document.getElementById('cartPanelClear')?.addEventListener('click', function () {
      localStorage.removeItem('bookingCart');
      // 同一分頁修改 localStorage 不會觸發 storage event，因此主動發送 booking cart 事件同步 badge。
      window.dispatchEvent(new CustomEvent('yurui:booking-cart-changed', { detail: { action: 'clear' } }));
      updateBookingBadge();
      renderCartPanel();
    });
  }

  function closeCartPanel() {
    // 預約背包面板：使用 bookingPanelBackdrop / bookingCartButton 作為正式互動掛點。
    setPanelState(
      document.getElementById('cartPanel'),
      document.getElementById('bookingPanelBackdrop'),
      document.getElementById('bookingCartButton'),
      false
    );
  }

  function openCartPanel() {
    closeOffcanvas();
    renderCartPanel();
    // 預約背包面板：渲染最新 localStorage 後再開啟抽屜。
    setPanelState(
      document.getElementById('cartPanel'),
      document.getElementById('bookingPanelBackdrop'),
      document.getElementById('bookingCartButton'),
      true
    );
    document.getElementById('cartPanelClose')?.focus();
  }

  function initCartPanel() {
    var cartButton = document.getElementById('bookingCartButton');
    var closeButton = document.getElementById('cartPanelClose');
    var backdrop = document.getElementById('bookingPanelBackdrop');
    if (cartButton && cartButton.dataset.cartBound !== 'true') {
      cartButton.dataset.cartBound = 'true';
      cartButton.addEventListener('click', function (event) {
        event.preventDefault();
        openCartPanel();
      });
    }
    if (closeButton && closeButton.dataset.cartBound !== 'true') {
      closeButton.dataset.cartBound = 'true';
      closeButton.addEventListener('click', closeCartPanel);
    }
    if (backdrop && backdrop.dataset.cartBound !== 'true') {
      backdrop.dataset.cartBound = 'true';
      backdrop.addEventListener('click', closeCartPanel);
    }
  }

  function setActiveNavLink() {
    var path = window.location.pathname;
    [
      ['navSearch', 'camp-search'],
      ['navRentalGuide', 'rental-guide'],
      ['navFaq', 'booking-faq'],
      ['navMember', 'member-center'],
    ].forEach(function (item) {
      var link = document.getElementById(item[0]);
      if (link && path.indexOf(item[1]) !== -1) {
        link.classList.add('isSelected');
        link.setAttribute('aria-current', 'page');
      }
    });
  }

  /**
   * 用途：booking 會員中心入口帶上目前預約頁面作為 returnTo，讓會員中心返回可回到原頁。
   * 套用元件：[data-member-center-entry="booking"]。
   */
  function updateBookingMemberCenterLinks() {
    var currentPath = window.location.pathname + window.location.search + window.location.hash;
    var isMemberCenterPage = window.location.pathname.endsWith('/booking/pages/member-center.html');
    document.querySelectorAll('[data-member-center-entry="booking"]').forEach(function (link) {
      link.href = isMemberCenterPage
        ? './member-center.html'
        : './member-center.html?returnTo=' + encodeURIComponent(currentPath);
    });
  }

  function bindModalTriggers() {
    document.querySelectorAll('[data-modal-target]').forEach(function (button) {
      if (button.dataset.modalTriggerBound === 'true') return;
      button.dataset.modalTriggerBound = 'true';
      button.addEventListener('click', function () {
        window.openModal?.(button.dataset.modalTarget);
      });
    });
  }

  function bindGlobalEvents() {
    if (window.__bookingHeaderGlobalBound) return;
    window.__bookingHeaderGlobalBound = true;
    document.addEventListener('click', function (event) {
      if (!event.target.closest('.bookingHeader .siteUserMenu')) closeUserDropdown();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      closeOffcanvas();
      closeCartPanel();
    });
    
    window.addEventListener('storage', function (event) {
      if (event.key === 'bookingCart') updateBookingBadge();
    });

    window.addEventListener('yurui:booking-cart-changed', function () {
      updateBookingBadge();
      if (document.getElementById('cartPanel')?.classList.contains('isOpen')) renderCartPanel();
    });
    
    window.addEventListener('yurui:auth-changed', function (event) {
      if (event.detail && event.detail.type === 'logout') {
        closeUserDropdown();

        var loginButton = document.querySelector('.bookingHeader .bookingLoginButton');
        var userMenu = document.querySelector('.bookingHeader .siteUserMenu');

        if (loginButton) loginButton.hidden = false;
        if (userMenu) userMenu.hidden = true;

        return;
      }

      checkLoginState();
    });
  }

  function initBookingHeader() {
    updateBookingBadge();
    initOffcanvas();
    initCartPanel();
    bindModalTriggers();
    setActiveNavLink();
    updateBookingMemberCenterLinks();
    checkLoginState();
    bindGlobalEvents();
  }

  initBookingHeader();

  if (typeof window.onBookingHeaderReady === 'function') {
    window.onBookingHeaderReady();
  }
})();
