/**
 * 「聯繫客服」：確保 LINE 已綁定（登入或 Account Linking）→ 開 OA 聊天。
 * Contact CS — bind LINE identity first, then open OA without identity in the URL.
 *
 * States:
 * 1) Guest → LINE login → session (persist line_user_id) → open OA
 * 2) Signed-in without LINE → link LINE onto current Firebase user → session → open OA
 * 3) Already bound (session lineBound or Firebase providerData) → open OA
 */
(function () {
  'use strict';

  /**
   * OA entry URL from AppConfig (optionally overridden by VITE_LINE_OA_CHAT_URL via firebase-app).
   * Callers must not append customerId, order ids, or tokens.
   * @returns {string}
   */
  function getLineOaChatUrl() {
    var fromConfig =
      window.AppConfig &&
      window.AppConfig.LINE &&
      window.AppConfig.LINE.OA_CHAT_URL
        ? String(window.AppConfig.LINE.OA_CHAT_URL).trim()
        : '';
    return fromConfig || 'https://lin.ee/NkgGfc4';
  }

  function openOaChat() {
    window.open(getLineOaChatUrl(), '_blank', 'noopener,noreferrer');
  }

  function toastError(message) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, 'error');
    } else {
      console.error('[ContactCS]', message);
      window.alert(message);
    }
  }

  function firebaseReady() {
    return (
      window.YuruiFirebase &&
      typeof window.YuruiFirebase.isReady === 'function' &&
      window.YuruiFirebase.isReady()
    );
  }

  /** Wait for Firebase to restore currentUser from IndexedDB when possible. */
  function waitForFirebaseUser() {
    if (!firebaseReady()) {
      return Promise.resolve(null);
    }
    if (typeof window.YuruiFirebase.waitForAuthState === 'function') {
      return window.YuruiFirebase.waitForAuthState();
    }
    return Promise.resolve(
      window.YuruiFirebase.auth ? window.YuruiFirebase.auth.currentUser : null
    );
  }

  /**
   * Refresh session from current Firebase user (force token refresh for new identities).
   */
  function refreshSessionFromCurrentUser() {
    if (!window.YuruiAuth || typeof window.YuruiAuth.establishSessionWithIdToken !== 'function') {
      return Promise.reject(new Error('YuruiAuth 尚未載入'));
    }
    if (!window.AppAuth || typeof window.AppAuth.getIdToken !== 'function') {
      return Promise.reject(new Error('AppAuth 尚未就緒'));
    }
    return window.AppAuth.getIdToken({ required: true, forceRefresh: true }).then(function (idToken) {
      return window.YuruiAuth.establishSessionWithIdToken(idToken).then(function (user) {
        if (typeof window.YuruiAuth.persistSessionUser === 'function') {
          window.YuruiAuth.persistSessionUser(user);
        }
        return user;
      });
    });
  }

  /**
   * Main entry for floating 「LINE 客服」 / 「聯繫客服」 buttons.
   * @returns {Promise<void>}
   */
  function ensureLineBoundAndOpenOa() {
    if (!firebaseReady()) {
      toastError('Firebase 尚未就緒，請稍後再試或確認本機 .env.local');
      return Promise.resolve();
    }
    if (!window.YuruiAuth) {
      toastError('登入模組尚未載入，請重新整理頁面');
      return Promise.resolve();
    }

    return waitForFirebaseUser()
      .then(function (firebaseUser) {
        var sessionUser =
          typeof window.YuruiAuth.getUser === 'function' ? window.YuruiAuth.getUser() : null;

        // Prefer fresh server bind when Firebase already has LINE (covers stale localStorage)
        if (
          firebaseUser &&
          typeof window.YuruiFirebase.hasLineProvider === 'function' &&
          window.YuruiFirebase.hasLineProvider()
        ) {
          return refreshSessionFromCurrentUser().then(function (user) {
            if (!user || user.lineBound !== true) {
              toastError('LINE 身分尚未寫入會員資料，請再試一次或重新登入');
              return;
            }
            openOaChat();
          });
        }

        // Session already says bound and Firebase has a user (no need to re-link)
        if (sessionUser && sessionUser.lineBound && firebaseUser) {
          openOaChat();
          return;
        }

        // Signed in on Firebase without LINE → Account Linking (keep same firebase_uid)
        if (firebaseUser) {
          return window.YuruiAuth.linkLineAndRefreshSession({ showToast: true }).then(function (user) {
            if (!user || user.lineBound !== true) {
              toastError('LINE 綁定未完成，請再試一次');
              return;
            }
            openOaChat();
          });
        }

        // App thinks logged in but Firebase user missing → do not guest LINE-login
        // (would risk a second Firebase UID / Customer). Ask user to re-login first.
        if (sessionUser && typeof window.YuruiAuth.isLoggedIn === 'function' && window.YuruiAuth.isLoggedIn()) {
          toastError('登入狀態尚未就緒，請重新整理後再點聯繫客服');
          return;
        }

        // Guest → LINE login first
        return window.YuruiAuth
          .loginWithProvider('line', { showToast: true, openSurvey: false })
          .then(function (user) {
            if (!user || user.lineBound !== true) {
              toastError('LINE 登入後尚未完成綁定，請再試一次');
              return;
            }
            openOaChat();
          });
      })
      .catch(function (error) {
        if (error && error.code === 'LINE_USER_ID_CONFLICT') {
          toastError(error.message);
          return;
        }
        toastError(error && error.message ? error.message : '聯繫客服失敗');
      });
  }

  /**
   * Wire a button/link: prevent default navigation, run bind flow, open OA.
   * @param {Element|null} element
   */
  function bindContactCsControl(element) {
    if (!element || element.dataset.contactCsBound === '1') return;
    element.dataset.contactCsBound = '1';
    element.addEventListener('click', function (event) {
      event.preventDefault();
      if (element.dataset.contactCsBusy === '1') return;
      element.dataset.contactCsBusy = '1';
      ensureLineBoundAndOpenOa().finally(function () {
        element.dataset.contactCsBusy = '0';
      });
    });
  }

  window.YuruiContactCs = {
    getLineOaChatUrl: getLineOaChatUrl,
    ensureLineBoundAndOpenOa: ensureLineBoundAndOpenOa,
    bindContactCsControl: bindContactCsControl,
  };
})();
