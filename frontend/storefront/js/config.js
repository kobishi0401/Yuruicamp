// ========================================
// Yuruicamp 全局配置
// ========================================

/**
 * Stores immutable application configuration used by every runtime module.
 */
window.AppConfig = {
  /**
   * true = 讀 /data/**.json（Mock）；false = 打 Spring REST
   * English: Toggle mock JSON vs real backend. Flip only this when wiring Spring Boot.
   */
  USE_MOCK_API: false,

  /**
   * Spring Boot API base (local default).
   * Override at build/dev time via frontend/.env.local → VITE_API_BASE_URL
   * (applied by storefront/js/apply-vite-env.js when firebase-app loads).
   * Staging example: https://YOUR-SERVICE.run.app/api
   */
  API_BASE_URL: 'http://localhost:8080/api',

  /**
   * 可選 CDN 前綴（通常留空）。若設定，只在 API 適配層加前綴，頁面不改。
   * Optional CDN prefix — apply only inside API adapters, never in pages.
   */
  ASSET_BASE_URL: '',

  // 應用版本
  VERSION: '1.0.0',

  // 環境
  ENVIRONMENT: 'development',

  // 本機可暫時填入 dev: Token；正式環境必須留空並使用 Firebase currentUser。
  AUTH: {
    DEV_TOKEN: '',
  },

  /**
   * LINE 官方帳號聊天入口（聯繫客服）。
   * 不要在 URL 後面加 customerId／訂單號／token。
   * Override via frontend/.env.local → VITE_LINE_OA_CHAT_URL（見 contact-cs.js）。
   */
  LINE: {
    OA_CHAT_URL: 'https://lin.ee/NkgGfc4',
  },

  // 後台正式模式獨立開關；G-6 由 AdminRuntime 套用 readiness，不直接假設所有模組都有端點。
  ADMIN: {
    USE_BACKEND: true,
  },

  // 購物車相關
  CART: {
    MAX_QUANTITY: 999,
    MIN_QUANTITY: 1,
    FREE_SHIPPING_THRESHOLD: 3000,
  },

  // 分頁相關
  PAGINATION: {
    DEFAULT_PAGE_SIZE: 12,
    MAX_PAGE_SIZE: 50,
  },

  // 文件上傳相關
  UPLOAD: {
    MAX_FILE_SIZE: 5 * 1024 * 1024,
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  },

  // 時間與快取設定
  TIMEOUT: 5000,
  CACHE_DURATION: 3600000,

  // 貨幣相關
  CURRENCY: {
    SYMBOL: 'NT$',
    CODE: 'TWD',
    DECIMALS: 0,
  },

  // 品牌與門市資訊
  COMPANY: {
    NAME: 'Yuruicamp',
    SLOGAN: '探索戶外，從這裡開始',
    PHONE: '0800-123-456',
    EMAIL: 'support@yuruicamp.com',
    ADDRESS: '台北市信義區信義路五段 100 號',
  },
};

/**
 * Apply build/dev overrides from /yurui-env.js (window.__YURUI_ENV__).
 * English: Hosting serves classic JS; Vite env is baked into that file by write-yurui-env.mjs.
 * 中文：正式站經典腳本讀這個覆寫；由 npm run dev／build 前的腳本產生。
 */
(function applyYuruiEnvOverrides() {
  var env = window.__YURUI_ENV__;
  if (!env || typeof env !== 'object') {
    return;
  }
  var api = String(env.API_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (api) {
    window.AppConfig.API_BASE_URL = api;
  }
  var oa = String(env.LINE_OA_CHAT_URL || '').trim();
  if (oa) {
    window.AppConfig.LINE = window.AppConfig.LINE || {};
    window.AppConfig.LINE.OA_CHAT_URL = oa;
  }
})();

console.log('✓ AppConfig 已初始化');
