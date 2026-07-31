// ========================================
// Yuruicamp 應用入口
// ========================================
// 此文件初始化應用並設置全局事件監聽器
// ===================================================

// 用來記錄「全局組件是否已被初始化」的旗標
// Guard flag: prevent double-initialization when page JS already called init functions
window._appComponentsInitialized = false;

/**
 * 應用初始化函數（被各頁面 JS 呼叫，或由 main.js 自行呼叫）
 * App init function - called by page JS or by main.js itself
 *
 * 若頁面 JS（如 home.js、product-list.js）已自行初始化過，
 * 這裡只補跑「全局事件監聽」，不重複跑 header/modal/cart。
 */
window.initApp = async () => {
  console.log('========================================');
  console.log('Yuruicamp 應用初始化');
  console.log('========================================');

  // 全局事件監聽（online/offline/beforeunload）始終需要設定
  window.initGlobalListeners();
  // 先載入 header/footer HTML 與 shared auth 所需腳本
  await initGlobalLayout();

  // Header partial 注入完成後才綁定共用互動，避免 product-detail 等頁面先初始化造成空 DOM 綁定。
  // Bind shared interactions only after partial markup exists, so page scripts cannot bind empty DOM.
  if (!window._appComponentsInitialized) {
    window.initNavbar();
    window.initModalListeners();
    window.initCartListeners();
    window.initPersonalizationModal();
    window._appComponentsInitialized = true;
  } else {
    // Header markup may be injected after a page script already ran init; these init functions are idempotent.
    window.initNavbar?.();
    window.initModalListeners?.();
    window.initCartListeners?.();
    window.initPersonalizationModal?.();
    window.updateNavbarLoginState?.();
    window.updateCartBadge?.();
  }

  initFloatingActions(); // 懸浮按鈕
  window.initLazyLoadingFallback?.();

  // 第 13 階段：offcanvas 開啟時鎖住 body 捲動（iOS Safari 需要）
  // Stage 13: Lock body scroll when offcanvas is open (required for iOS Safari)
  window.initBodyScrollLock();
  // 偵測目前頁面，呼叫對應的頁面初始化函式
  if (typeof window.initHomePage === 'function') {
    await window.initHomePage();
  }

  console.log('✓ 應用初始化完成');
  console.log('AppState:', window.AppState);
};

window.initGlobalListeners = () => {
  // 記錄頁面卸載
  window.addEventListener('beforeunload', () => {
    window.saveAppState();
  });

  // 性能監測（使用 PerformanceObserver 更精確）
  // Performance monitoring using PerformanceObserver
  window.addEventListener('load', () => {
    // 基本計算方式（舊版）
    const perfData = window.performance.timing;
    const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
    console.log(`⏱️ 頁面加載時間: ${pageLoadTime}ms`);

    // 現代 API：LCP（最大內容繪製）監測
    // Largest Contentful Paint monitoring (modern browsers only)
    if ('PerformanceObserver' in window) {
      try {
        const lcpObserver = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          const lastEntry = entries[entries.length - 1];
          console.log(`🎨 LCP（最大內容繪製）: ${lastEntry.startTime.toFixed(0)}ms`);
        });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (e) {
        // LCP 不支援時靜默跳過 / Silently ignore if LCP not supported
      }
    }

    // 頁面加載時間警告（超過 3 秒提醒）
    // Warn if page takes over 3 seconds to load
    if (pageLoadTime > 3000) {
      console.warn(`⚠️ 頁面加載超過 3 秒（${pageLoadTime}ms），建議優化資源`);
    }
  });
};

/**
 * 第 13 階段：Body Scroll Lock（鎖定 body 捲動）
 * 當 Offcanvas 或 Modal 開啟時，防止背景頁面繼續捲動
 * 特別是 iOS Safari 需要 position: fixed 才有效
 *
 * Body scroll lock for offcanvas/modal open state
 * iOS Safari requires position:fixed to truly prevent background scroll
 */
window.initBodyScrollLock = () => {
  let scrollY = 0; // 記錄捲動位置，關閉時還原

  // 觀察 body 是否有 offcanvasOpen class
  // Watch for offcanvasOpen class on body
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const isOpen = document.body.classList.contains('offcanvasOpen');
        if (isOpen) {
          // 記住目前捲動位置，套用固定
          // Remember scroll position and fix body
          scrollY = window.scrollY;
          document.body.style.top = `-${scrollY}px`;
        } else {
          // 還原捲動位置
          // Restore scroll position
          document.body.style.top = '';
          window.scrollTo(0, scrollY);
        }
      }
    });
  });

  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
};

// 全局佈局動態載入 (Header & Footer)
// ===================================================

// 輔助函式：載入局部 HTML
// Shared layout fragments use `.partial` instead of `.html` because VS Code
// Live Server injects reload scripts into HTML responses and can corrupt
// fragment-only files that are fetched into the page.

/**
 * 載入指定 partial 區塊並取代目標容器內容。
 * 使用網站根絕對路徑（/components/...），不依頁面深度改寫。
 * English: Load partial via root-absolute URL — no path rewriting.
 * @param {string} targetId - 目標容器 id。
 * @param {string} url - partial 檔案路徑。
 * @param {string} partSelector - 要載入的 data-layout-part selector。
 */
async function loadPartial(targetId, url, partSelector) {
  const target = document.getElementById(targetId);
  if (!target) return;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`無法載入組件: ${url}`);
    const html = await response.text();
    // 重點：header/footer partial 已整合主站與 booking 版型，主站載入時只取 main-* 區塊。
    if (partSelector) {
      const template = document.createElement('template');
      template.innerHTML = html;
      const part = template.content.querySelector(partSelector);
      target.innerHTML = part ? part.innerHTML : html;
      return;
    }
    target.innerHTML = html;
  } catch (error) {
    console.error(error);
  }
}

/**
 * 將指定 partial 區塊附加到既有容器中。
 * @param {string} targetId - 目標容器 id。
 * @param {string} url - partial 檔案路徑。
 * @param {string} partSelector - 要附加的 data-layout-part selector。
 */
async function appendPartial(targetId, url, partSelector) {
  const target = document.getElementById(targetId);
  if (!target) return;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`無法載入組件: ${url}`);
    const html = await response.text();
    const template = document.createElement('template');
    template.innerHTML = html;
    const part = template.content.querySelector(partSelector);
    if (part) {
      target.insertAdjacentHTML('beforeend', part.innerHTML);
    }
  } catch (error) {
    console.error(error);
  }
}

/**
 * 輔助函式：動態載入 JS 腳本。
 * @param {string} src - Script 路徑。
 * @returns {Promise<void>} 載入完成 promise。
 */
function loadComponentScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

/**
 * 載入共用 header/footer partial 與 shared auth/header 互動腳本。
 * 一律使用根絕對路徑，避免 storefront 多一層後破圖／404。
 * English: Always use root-absolute /components and /storefront/js paths.
 */
async function initGlobalLayout() {
  await Promise.all([
    loadPartial('header', '/components/header.partial', '[data-layout-part="main-header"]'),
    loadPartial('footer', '/components/footer.partial', '[data-layout-part="main-footer"]'),
  ]);
  await appendPartial(
    'header',
    '/components/header.partial',
    '[data-layout-part="shared-auth"]'
  );

  try {
    // 2-2：先載入 Firebase ES module（npm firebase），再載入經典 auth.js
    // Load Firebase ESM first so window.YuruiFirebase exists before auth.js
    await import('/storefront/js/firebase-app.js');
    // 等待 Firebase 還原跨分頁登入者，避免 Header 與首批 API 太早判定未登入。
    if (window.YuruiFirebase && typeof window.YuruiFirebase.waitForAuthState === 'function') {
      await window.YuruiFirebase.waitForAuthState();
    }
    // B：無論 Firebase 是否有設定，都要完成 AppAuth readiness，避免提早發出的 API 永久等待。
    if (window.AppAuth && typeof window.AppAuth.configure === 'function') {
      var firebaseAuth = null;

      try {
        if (window.YuruiFirebase && window.YuruiFirebase.isReady && window.YuruiFirebase.isReady()) {
          firebaseAuth = window.YuruiFirebase.getAuth();
        }
        window.AppAuth.configure({ auth: firebaseAuth });
        if (firebaseAuth) {
          console.log('✓ AppAuth 已注入 Firebase Auth');
        }
      } catch (injectError) {
        window.AppAuth.configure({ auth: null });
        console.warn('[AppAuth] Firebase 注入略過:', injectError);
      }
    }
    // auth.js 已收斂到 AppAuth／ApiClient，不再載入過渡層 api-http.js
    await loadComponentScript('/storefront/js/components/auth.js');
    await loadComponentScript('/storefront/js/components/contact-cs.js');
    await loadComponentScript('/storefront/js/components/modal.js');
    await loadComponentScript('/storefront/js/components/header.js');
  } catch (error) {
    // Firebase 模組載入失敗也要解除 readiness，讓 API 回傳正常的未登入錯誤而非卡住。
    if (window.AppAuth && typeof window.AppAuth.configure === 'function') {
      window.AppAuth.configure({ auth: null });
    }
    console.error('組件腳本載入失敗:', error);
  }
}

/**
 * Adds global floating actions once per page and wires their scroll behavior.
 */
function initFloatingActions() {
  if (document.querySelector('.floatingActions')) return;

  const floatingActions = document.createElement('div');
  floatingActions.className = 'floatingActions';

  // 按鈕順序：回到頂部在上，Line客服在下
  floatingActions.innerHTML = `
    <button
      class="floatingTopBtn"
      type="button"
      aria-label="回到頁面頂部"
      title="回到頂部"
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
    // contact-cs.js not loaded — do not open OA unbound; ask user to retry after scripts load
    lineButton.addEventListener('click', function (event) {
      event.preventDefault();
      if (typeof window.showToast === 'function') {
        window.showToast('客服模組載入中，請稍候再試', 'error');
      }
    });
  }

  const topButton = floatingActions.querySelector('.floatingTopBtn');

  /**
   * Shows the top button after the user scrolls away from the first viewport area.
   */
  function toggleTopButton() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;

    // 核心修改：當向下捲動的距離超過目前視窗高度的 1/5 時，就顯示按鈕。
    const shouldShowTopButton = scrollTop >= window.innerHeight / 5;

    topButton.classList.toggle('isVisible', shouldShowTopButton);
  }

  topButton.addEventListener('click', function () {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  });

  window.addEventListener('scroll', toggleTopButton, { passive: true });
  window.addEventListener('resize', toggleTopButton);

  // 初始化時執行一次，確保重整網頁時狀態正確
  toggleTopButton();
}

/**
 * 應用啟動入口
 * 等待 DOM 完全加載後執行
 */
if (document.readyState === 'loading') {
  // DOM 仍在加載中
  document.addEventListener('DOMContentLoaded', window.initApp);
} else {
  // DOM 已加載完成
  window.initApp();
}

console.log('✓ Main.js 已加載');
