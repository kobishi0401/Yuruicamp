/**
 * Creates the floating scroll-to-top and LINE shortcut buttons on booking pages.
 */
function initFloatingActions() {
  if (document.querySelector('.floatingActions')) return;

  const floatingActions = document.createElement('div');
  floatingActions.className = 'floatingActions';
  floatingActions.innerHTML = `
    <button
      class="floatingTopBtn"
      type="button"
      aria-label="回到頁面頂端"
      title="回到頁面頂端"
    >
      <i class="bi bi-chevron-up"></i>
    </button>
    <a
      class="floatingLineBtn"
      href="#"
      role="button"
      aria-label="聯繫客服（LINE）"
      title="聯繫客服"
    >
      <span class="floatingLineLabel">LINE 客服</span>
      <span class="floatingLineIcon" aria-hidden="true">
        <i class="bi bi-chat-dots-fill"></i>
      </span>
    </a>
  `;

  document.body.appendChild(floatingActions);

  const lineButton = floatingActions.querySelector('.floatingLineBtn');
  if (window.YuruiContactCs && typeof window.YuruiContactCs.bindContactCsControl === 'function') {
    window.YuruiContactCs.bindContactCsControl(lineButton);
  } else if (lineButton) {
    lineButton.addEventListener('click', function (event) {
      event.preventDefault();
      if (typeof window.showToast === 'function') {
        window.showToast('客服模組載入中，請稍候再試', 'error');
      }
    });
  }

  const topButton = floatingActions.querySelector('.floatingTopBtn');

  /**
   * Shows the top button only after the user scrolls past the first viewport segment.
   */
  function toggleTopButton() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const shouldShow = scrollTop > window.innerHeight / 5;
    topButton.classList.toggle('isVisible', shouldShow);
  }

  topButton.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  window.addEventListener('scroll', toggleTopButton, { passive: true });
  window.addEventListener('resize', toggleTopButton);
  toggleTopButton();
}

/**
 * Loads a script once and uses a window flag to prevent duplicate event bindings.
 * @param {string} src - Script URL to load.
 * @param {string} flagName - Window flag used to mark a loaded script.
 * @returns {Promise<void>} Resolves after the script loads.
 */
function loadScriptOnce(src, flagName) {
  return new Promise(function (resolve, reject) {
    if (window[flagName]) {
      resolve();
      return;
    }

    window[flagName] = true;
    const script = document.createElement('script');
    script.src = src;
    script.onload = function () {
      resolve();
    };
    script.onerror = function () {
      window[flagName] = false;
      reject(new Error('script load failed: ' + src));
    };
    document.body.appendChild(script);
  });
}

/**
 * Adds booking-scoped semantic classes to the shared auth partial without
 * changing the shared main-site markup contract or modal IDs.
 * @param {Element} target - Header container that received the shared auth partial.
 */
function applyBookingAuthSemanticClasses(target) {
  const classMap = [
    ['#loginModal', 'bookingAuthModal bookingLoginModal'],
    ['#loginModal .modalContent', 'bookingAuthModalContent'],
    ['#loginModal .modalHeader', 'bookingAuthModalHeader'],
    ['#loginModal .modalTitle', 'bookingAuthModalTitle'],
    ['#loginModal .modalClose', 'bookingAuthModalClose'],
    ['#loginModal .modalBody', 'bookingAuthModalBody'],
    ['#loginModal .btnGoogleLogin', 'bookingAuthProviderGoogle'],
    ['#loginModal .btnFacebookLogin', 'bookingAuthProviderFacebook'],
    ['#loginModal .btnLineLogin', 'bookingAuthProviderLine'],
    ['#loginModal .oauthDesc', 'bookingAuthOauthDesc'],
    ['#loginModal .oauthPrivacy', 'bookingAuthOauthPrivacy'],
  ];

  classMap.forEach(function ([selector, classNames]) {
    target.querySelectorAll(selector).forEach(function (element) {
      element.classList.add(...classNames.split(' '));
    });
  });
}

/**
 * 動態載入 Firebase 初始化模組（只載一次）。
 * Dynamically import firebase-app.js once for booking pages.
 * @returns {Promise<unknown>}
 */
function loadFirebaseAppOnce() {
  if (window.__yuruiFirebaseModuleLoaded) {
    return window.__yuruiFirebaseModuleLoaded;
  }
  window.__yuruiFirebaseModuleLoaded = import('/storefront/js/firebase-app.js');
  return window.__yuruiFirebaseModuleLoaded;
}

/**
 * 把 Firebase Auth 注入 main 的 AppAuth（B 方案接線）。
 * Wire Firebase Auth into AppAuth so ApiClient can attach Bearer tokens.
 */
function injectFirebaseAuthIntoAppAuth() {
  if (!window.AppAuth || typeof window.AppAuth.configure !== 'function') {
    return;
  }

  // Firebase 未設定或模組載入失敗時，也要解除 AppAuth readiness 等待。
  if (!window.YuruiFirebase || typeof window.YuruiFirebase.isReady !== 'function') {
    window.AppAuth.configure({ auth: null });
    return;
  }
  if (!window.YuruiFirebase.isReady()) {
    window.AppAuth.configure({ auth: null });
    return;
  }
  try {
    window.AppAuth.configure({ auth: window.YuruiFirebase.getAuth() });
    console.log('✓ AppAuth 已注入 Firebase Auth');
  } catch (error) {
    console.warn('[AppAuth] Firebase 注入略過:', error);
  }
}

/**
 * 載入 booking shared auth 與 header 互動腳本。
 * 套用元件：#loginModal、#personalizationModal、.bookingHeader。
 */
function loadBookingHeaderScript() {
  // booking-utils 先載入：header 讀 bookingCart 時需要 normalizeBookingCart（3-13 camelCase）
  loadScriptOnce('/booking/js/booking-utils.js', '__bookingUtilsScriptLoaded')
    .then(function () {
      // 2-2：Firebase 必須在 auth.js 之前就緒
      return loadFirebaseAppOnce();
    })
    .then(function () {
      // 等待 Firebase 還原跨分頁登入者，避免 Booking 首批 API 誤判為登出。
      if (window.YuruiFirebase && typeof window.YuruiFirebase.waitForAuthState === 'function') {
        return window.YuruiFirebase.waitForAuthState();
      }

      return null;
    })
    .then(function () {
      // B：Firebase → AppAuth（ApiClient 才能帶 token）
      injectFirebaseAuthIntoAppAuth();
      // auth.js 已收斂到 AppAuth／ApiClient，不再載入過渡層 api-http.js
      return loadScriptOnce('/storefront/js/components/modal.js', '__yuruiModalScriptLoaded');
    })
    .then(function () {
      return loadScriptOnce('/storefront/js/components/auth.js', '__yuruiAuthScriptLoaded');
    })
    .then(function () {
      return loadScriptOnce('/storefront/js/components/contact-cs.js', '__yuruiContactCsScriptLoaded');
    })
    .then(function () {
      window.initModalListeners?.();
      // Re-bind floating LINE button now that YuruiContactCs exists
      var lineBtn = document.querySelector('.floatingLineBtn');
      if (lineBtn && window.YuruiContactCs) {
        delete lineBtn.dataset.contactCsBound;
        window.YuruiContactCs.bindContactCsControl(lineBtn);
      }
      return loadScriptOnce('/booking/js/booking-header.js', '__bookingHeaderScriptLoaded');
    })
    .catch(function (error) {
      // Booking 初始化失敗時讓共用 API 正常回報未登入，不要永久等待。
      if (window.AppAuth && typeof window.AppAuth.configure === 'function') {
        window.AppAuth.configure({ auth: null });
      }
      console.error(error);
    });
}

/**
 * Loads one data-layout-part from a shared partial into a booking page target.
 * @param {string} targetSelector - Target element selector.
 * @param {string} url - Partial URL.
 * @param {string} partSelector - data-layout-part selector to extract.
 * @param {Function=} callback - Optional completion callback.
 * @returns {Promise<boolean>} Whether the partial was loaded.
 */
function loadBookingLayoutPartial(targetSelector, url, partSelector, callback) {
  const target = document.querySelector(targetSelector);
  if (!target) {
    if (callback) callback(false);
    return Promise.resolve(false);
  }

  return fetch(url)
    .then(function (response) {
      if (!response.ok) throw new Error('booking layout partial load failed: ' + url);
      return response.text();
    })
    .then(function (html) {
      const template = document.createElement('template');
      template.innerHTML = html;
      const part = template.content.querySelector(partSelector);
      const content = part ? part.innerHTML : html;

      // Shared auth is appended after the booking header so both systems use one modal.
      if (partSelector === '[data-layout-part="shared-auth"]') {
        target.insertAdjacentHTML('beforeend', content);
        applyBookingAuthSemanticClasses(target);
      } else {
        target.innerHTML = content;
      }

      // Partial 內已使用根絕對路徑，不再改寫 / No path rewriting
      if (callback) callback(true);
      return true;
    })
    .catch(function (error) {
      console.error(error);
      if (callback) callback(false);
      return false;
    });
}

/**
 * 載入 booking 全站共用腳本（config／api-client／formatters／api-mock／booking-api）。
 * 與 booking/partials/booking-core-scripts.partial 清單一致；用 loadScriptOnce 當安全網。
 * @returns {Promise<void>}
 */
function loadBookingCoreScripts() {
  var scripts = [
    ['/storefront/js/config.js', '__bookingCoreConfigLoaded'],
    ['/storefront/js/api-client.js', '__bookingCoreApiClientLoaded'],
    ['/storefront/js/formatters.js', '__bookingCoreFormattersLoaded'],
    ['/storefront/js/api-mock.js', '__bookingCoreApiMockLoaded'],
    ['/storefront/js/booking-api.js', '__bookingCoreBookingApiLoaded'],
  ];

  return scripts.reduce(function (chain, item) {
    return chain.then(function () {
      return loadScriptOnce(item[0], item[1]);
    });
  }, Promise.resolve());
}

/**
 * Loads the booking header, shared auth modal, and footer for booking pages.
 * 使用根絕對路徑載入 partial / Root-absolute partial URLs.
 * 先載入 core scripts，確保登入／session 有 AppConfig.API_BASE_URL。
 */
window.loadBookingSharedLayout = function () {
  return loadBookingCoreScripts()
    .catch(function (error) {
      console.error('booking core scripts load failed:', error);
    })
    .then(function () {
      loadBookingLayoutPartial(
        '#bookingHeader',
        '/components/header.partial',
        '[data-layout-part="bookingHeader"]',
        function (ok) {
          if (!ok) return;
          loadBookingLayoutPartial(
            '#bookingHeader',
            '/components/header.partial',
            '[data-layout-part="shared-auth"]',
            function () {
              loadBookingHeaderScript();
            }
          );
        }
      );
      loadBookingLayoutPartial(
        '#bookingFooter',
        '/components/footer.partial',
        '[data-layout-part="bookingFooter"]'
      );
    });
};

/** 供頁面或測試直接呼叫（與 loadBookingSharedLayout 共用同一清單） */
window.loadBookingCoreScripts = loadBookingCoreScripts;

document.addEventListener('DOMContentLoaded', initFloatingActions);
