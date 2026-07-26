/**
 * 後台登入頁：Firebase Google 登入、development Dev Token 與 Admin Session。
 */
(function (global) {
  'use strict';

  var DEV_SEED_TOKEN =
    'dev:booking-seed-admin:booking-seed@example.test:google:Booking Seed Admin';
  var AUTH_SOURCE_KEY = 'adminAuthSource';

  function showError(message) {
    $('#loginError').removeClass('d-none').text(message);
  }

  function clearError() {
    $('#loginError').addClass('d-none').text('');
  }

  function showFirebaseStatus(message, type) {
    $('#firebaseLoginStatus')
      .removeClass('d-none alert-info alert-success alert-warning')
      .addClass('alert-' + type)
      .text(message);
  }

  function setBusy($button, busy, label) {
    $button.prop('disabled', busy);
    if (busy) {
      $button.data('original-html', $button.html());
      $button.html('<span class="spinner-border spinner-border-sm me-2"></span>' + label);
      return;
    }
    if ($button.data('original-html')) {
      $button.html($button.data('original-html'));
    }
  }

  function friendlyMessage(error) {
    var code = error && error.code ? String(error.code) : '';
    var message = (error && error.message) || '登入失敗，請稍後再試。';
    if (code === 'ADMIN_NOT_WHITELISTED' || /not whitelisted/i.test(message)) {
      return '此 Google 帳號不在後台白名單中。';
    }
    if (code === 'ADMIN_INACTIVE' || /disabled/i.test(message)) {
      return '此管理員帳號已停用。';
    }
    if (code === 'FORBIDDEN' || /different Firebase/i.test(message)) {
      return '此 Email 已綁定其他 Firebase 帳號。';
    }
    if (code === 'API_NETWORK_ERROR') {
      return '無法連線後端，請確認 Spring Boot 已啟動於 localhost:8080。';
    }
    if (/auth\/unauthorized-domain/i.test(code + message)) {
      return '目前網址未加入 Firebase Authorized domains，請加入 127.0.0.1 與 localhost。';
    }
    if (/auth\/popup-blocked/i.test(code + message)) {
      return '瀏覽器阻擋了 Google 登入視窗，請允許此網站開啟彈出視窗。';
    }
    return message;
  }

  /** Google 登入成功後，以 ID Token 建立後端管理員 Session。 */
  async function loginWithGoogle() {
    var auth = await global.AdminRuntime.initializeFirebase();
    if (!auth) {
      throw new Error(
        'Firebase 尚未就緒。請確認 frontend/.env.local 的 VITE_FIREBASE_*，並重啟 npm run dev。'
      );
    }

    var firebaseResult = await global.YuruiFirebase.signInWithGoogle();
    sessionStorage.removeItem('adminDevToken');
    global.AppAuth.configure({ auth: auth, devToken: '' });
    var session = await global.AdminRuntime.refreshBackendSession({
      idToken: firebaseResult.idToken,
    });
    sessionStorage.setItem(AUTH_SOURCE_KEY, 'firebase');
    return session;
  }

  /** 本機後端關閉 Firebase 驗證時，使用 Seed 管理員 Dev Token。 */
  async function loginWithDevSeedToken() {
    if (!global.AppConfig || global.AppConfig.ENVIRONMENT !== 'development') {
      throw new Error('Dev Token 登入只允許 development 環境。');
    }

    sessionStorage.setItem('adminDevToken', DEV_SEED_TOKEN);
    global.AppAuth.configure({ auth: null, devToken: DEV_SEED_TOKEN });
    var session = await global.AdminRuntime.refreshBackendSession({ idToken: DEV_SEED_TOKEN });
    sessionStorage.setItem(AUTH_SOURCE_KEY, 'dev-token');
    return session;
  }

  function clearAdminSessionStorage() {
    if (global.AdminRuntime) {
      global.AdminRuntime.clearSession();
    }
    sessionStorage.removeItem(AUTH_SOURCE_KEY);
  }

  async function logout() {
    if (global.AdminRuntime) {
      await global.AdminRuntime.signOut();
    } else {
      clearAdminSessionStorage();
    }
    sessionStorage.removeItem(AUTH_SOURCE_KEY);
    if (global.AppAuth) {
      global.AppAuth.configure({ auth: null, devToken: '' });
    }
  }

  /** Dashboard 相容入口；實際 Firebase 還原由 AdminRuntime 負責。 */
  async function restoreAppAuthIfNeeded() {
    if (!global.AdminRuntime || !global.AdminRuntime.isBackendMode()) return;
    if (sessionStorage.getItem(AUTH_SOURCE_KEY) === 'firebase') {
      try {
        await global.AdminRuntime.initializeFirebase();
      } catch (error) {
        console.warn('[AdminAuth] Firebase 登入狀態還原失敗:', error);
      }
    }
  }

  async function initializeLoginPage() {
    var $googleButton = $('#googleLoginBtn');
    var $devButton = $('#devTokenLoginBtn');
    $googleButton.prop('disabled', true);

    var storedMessage = sessionStorage.getItem('adminLoginMessage');
    sessionStorage.removeItem('adminLoginMessage');
    if (storedMessage) showError(storedMessage);

    if (!global.AdminRuntime || !global.AdminRuntime.isBackendMode()) {
      showFirebaseStatus('Admin Backend 目前未啟用，Google 登入不可用。', 'warning');
      return;
    }

    if (global.AppConfig && global.AppConfig.ENVIRONMENT === 'development') {
      $('#devLoginHoverZone').removeClass('d-none');
    }

    try {
      var auth = await global.AdminRuntime.initializeFirebase();
      if (!auth) {
        showFirebaseStatus(
          'Firebase 設定未載入。請確認 frontend/.env.local 後重新啟動 Vite。',
          'warning'
        );
        return;
      }
      showFirebaseStatus('Firebase 已就緒，可以使用 Google 管理員帳號登入。', 'success');
      $googleButton.prop('disabled', false);
      if (auth.currentUser) {
        $googleButton.html(
          '<i class="fab fa-google me-2"></i>繼續使用 ' +
          $('<div>').text(auth.currentUser.email || '目前帳號').html()
        );
      }
    } catch (error) {
      showFirebaseStatus(friendlyMessage(error), 'warning');
    }

    $googleButton.off('click.adminAuth').on('click.adminAuth', async function () {
      clearError();
      setBusy($googleButton, true, '驗證管理員資格...');
      try {
        await loginWithGoogle();
        global.location.href = '/admin/dashboard.html';
      } catch (error) {
        showError(friendlyMessage(error));
        setBusy($googleButton, false);
      }
    });

    $devButton.off('click.adminAuth').on('click.adminAuth', async function () {
      clearError();
      setBusy($devButton, true, '驗證開發帳號...');
      try {
        await loginWithDevSeedToken();
        global.location.href = '/admin/dashboard.html';
      } catch (error) {
        showError(friendlyMessage(error));
        setBusy($devButton, false);
      }
    });
  }

  global.AdminAuth = {
    DEV_SEED_TOKEN: DEV_SEED_TOKEN,
    loginWithGoogle: loginWithGoogle,
    loginWithDevSeedToken: loginWithDevSeedToken,
    clearAdminSessionStorage: clearAdminSessionStorage,
    logout: logout,
    restoreAppAuthIfNeeded: restoreAppAuthIfNeeded,
    friendlySessionError: friendlyMessage,
  };

  $(document).ready(function () {
    if ($('#googleLoginBtn').length === 1) {
      initializeLoginPage();
    }
  });
})(typeof window !== 'undefined' ? window : this);
