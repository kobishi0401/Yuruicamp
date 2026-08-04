/**
 * Apply Vite `VITE_*` env vars onto window.AppConfig.
 * English: Build-time env (Staging Hosting) overrides local defaults in config.js.
 * 中文：Staging／正式 build 時用環境變數覆蓋 config.js 的本機預設。
 *
 * Must run after config.js has created window.AppConfig.
 * Imported by firebase-app.js (storefront / booking / admin all load it).
 */

/**
 * Normalize API base: trim, drop trailing slashes (api-client joins paths safely).
 * @param {string} value
 * @returns {string}
 */
function normalizeApiBaseUrl(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

/**
 * Mutate AppConfig from import.meta.env when values are present.
 * Empty env keeps config.js defaults (local: http://localhost:8080/api).
 */
export function applyViteEnvToAppConfig() {
  if (!window.AppConfig) {
    return;
  }

  var apiBase = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL || '');
  if (apiBase) {
    window.AppConfig.API_BASE_URL = apiBase;
  }

  var oa = String(import.meta.env.VITE_LINE_OA_CHAT_URL || '').trim();
  if (oa) {
    window.AppConfig.LINE = window.AppConfig.LINE || {};
    window.AppConfig.LINE.OA_CHAT_URL = oa;
  }
}

applyViteEnvToAppConfig();
