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
      href="https://line.me"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="LINE 聯絡"
      title="LINE 聯絡"
    >
      <span class="floatingLineLabel">LINE 客服</span>
      <span class="floatingLineIcon" aria-hidden="true">
        <i class="bi bi-chat-dots-fill"></i>
      </span>
    </a>
  `;

  document.body.appendChild(floatingActions);

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
 * 取得全頁 overlay 掛載點，讓 booking modal/panel 脫離 sticky header 的 stacking context。
 * @returns {HTMLElement} 全頁 overlay root。
 */
function getBookingOverlayRoot() {
  let overlayRoot = document.getElementById('yuruiOverlayRoot');

  if (!overlayRoot) {
    overlayRoot = document.createElement('div');
    overlayRoot.id = 'yuruiOverlayRoot';
    overlayRoot.className = 'yuruiOverlayRoot';
    document.body.appendChild(overlayRoot);
  }

  return overlayRoot;
}

/**
 * 將 booking 預約背包面板移到 overlay root，避免被 booking header 層級限制。
 */
function moveBookingOverlayElementsToRoot() {
  const overlayRoot = getBookingOverlayRoot();
  ['cartPanel', 'bookingPanelBackdrop'].forEach(function (elementId) {
    const element = document.getElementById(elementId);
    if (element && element.parentElement !== overlayRoot) {
      overlayRoot.appendChild(element);
    }
  });
}

/**
 * 載入 booking shared auth 與 header 互動腳本。
 * 套用元件：#loginModal、#personalizationModal、.bookingHeader。
 */
function loadBookingHeaderScript() {
  // booking-utils 先載入：header 讀 bookingCart 時需要 normalizeBookingCart（3-13 camelCase）
  loadScriptOnce('../js/booking-utils.js', '__bookingUtilsScriptLoaded')
    .then(function () {
      return loadScriptOnce('../../js/components/modal.js', '__yuruiModalScriptLoaded');
    })
    .then(function () {
      return loadScriptOnce('../../js/components/auth.js', '__yuruiAuthScriptLoaded');
    })
    .then(function () {
      window.initModalListeners?.();
      return loadScriptOnce('../js/booking-header.js', '__bookingHeaderScriptLoaded');
    })
    .catch(function (error) {
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
  const shouldUseOverlayRoot = partSelector === '[data-layout-part="shared-auth"]';
  const target = shouldUseOverlayRoot ? getBookingOverlayRoot() : document.querySelector(targetSelector);
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
      // Shared auth 只需要一組，避免重複初始化時產生同 ID modal。
      if (shouldUseOverlayRoot && target.querySelector('#loginModal')) return true;

      const template = document.createElement('template');
      template.innerHTML = html;
      const part = template.content.querySelector(partSelector);
      const content = part ? part.innerHTML : html;

      // Shared auth 掛到 overlay root，讓登入 modal 使用全頁 modal 層級。
      if (shouldUseOverlayRoot) {
        target.insertAdjacentHTML('beforeend', content);
        applyBookingAuthSemanticClasses(target);
      } else {
        target.innerHTML = content;
      }

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
 * Loads the booking header, shared auth modal, and footer for booking pages.
 */
window.loadBookingSharedLayout = function () {
  loadBookingLayoutPartial(
    '#bookingHeader',
    '../../components/header.partial',
    '[data-layout-part="bookingHeader"]',
    function (ok) {
      if (!ok) return;
      moveBookingOverlayElementsToRoot();
      loadBookingLayoutPartial(
        '#bookingHeader',
        '../../components/header.partial',
        '[data-layout-part="shared-auth"]',
        function () {
          loadBookingHeaderScript();
        }
      );
    }
  );
  loadBookingLayoutPartial(
    '#bookingFooter',
    '../../components/footer.partial',
    '[data-layout-part="bookingFooter"]'
  );
};

document.addEventListener('DOMContentLoaded', initFloatingActions);
