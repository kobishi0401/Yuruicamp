/**
 * Firebase Web App 初始化（步驟 2-2／3-1／3-2）
 * Firebase Web bootstrap — Google / Facebook / LINE
 *
 * 從 frontend/.env.local 讀取 VITE_FIREBASE_*，初始化 Auth，並掛到 window.YuruiFirebase
 *
 * LINE：Identity Platform OIDC，預設 providerId = oidc.line
 * （若 Console 開的名稱不同，設 VITE_FIREBASE_LINE_PROVIDER_ID）
 */
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';

/**
 * @returns {import('firebase/app').FirebaseOptions}
 */
function readFirebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  };
}

/**
 * @param {Record<string, string>} config
 * @returns {string[]}
 */
function missingConfigKeys(config) {
  return Object.entries(config)
    .filter(function (_entry) {
      var value = _entry[1];
      return !String(value || '').trim();
    })
    .map(function (_entry) {
      return _entry[0];
    });
}

/** LINE OIDC provider id（Console 名稱 line → oidc.line） */
function lineProviderId() {
  return (
    import.meta.env.VITE_FIREBASE_LINE_PROVIDER_ID ||
    'oidc.line'
  ).trim();
}

var config = readFirebaseConfig();
var missing = missingConfigKeys(config);

var app = null;
var auth = null;
var ready = false;
var initError = null;
var authStateReadyPromise = null;

if (missing.length > 0) {
  console.warn(
    '[YuruiFirebase] 尚未設定 Firebase Web config。' +
      '請複製 frontend/.env.example 為 .env.local 並填入值，然後重啟 npm run dev。缺少欄位:',
    missing.join(', ')
  );
} else {
  try {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(config);
    auth = getAuth(app);
    ready = true;
    console.log('✓ YuruiFirebase 已初始化 (projectId=' + config.projectId + ')');
  } catch (error) {
    initError = error;
    console.error('[YuruiFirebase] 初始化失敗:', error);
  }
}

/**
 * 將 popup 取消轉成友善錯誤。
 * @param {unknown} error
 * @param {string} label
 * @returns {never}
 */
function rethrowPopupError(error, label) {
  if (
    error &&
    (error.code === 'auth/popup-closed-by-user' ||
      error.code === 'auth/cancelled-popup-request')
  ) {
    var cancelError = new Error('已取消 ' + label + ' 登入');
    cancelError.code = error.code;
    throw cancelError;
  }
  throw error;
}

/**
 * @param {import('firebase/auth').AuthProvider} provider
 * @param {string} label
 * @returns {Promise<{ idToken: string, uid: string, email: string|null, displayName: string|null, provider: string }>}
 */
async function signInWithAuthProvider(provider, label, providerKey) {
  var firebaseAuth = window.YuruiFirebase.getAuth();
  try {
    var result = await signInWithPopup(firebaseAuth, provider);
    var idToken = await result.user.getIdToken();
    return {
      idToken: idToken,
      uid: result.user.uid,
      email: result.user.email || null,
      displayName: result.user.displayName || null,
      provider: providerKey,
    };
  } catch (error) {
    rethrowPopupError(error, label);
  }
}

/**
 * @param {'google'|'facebook'|'line'} providerKey
 * @returns {import('firebase/auth').AuthProvider}
 */
function buildAuthProvider(providerKey) {
  if (providerKey === 'facebook') {
    var facebook = new FacebookAuthProvider();
    facebook.addScope('email');
    facebook.addScope('public_profile');
    return facebook;
  }
  if (providerKey === 'line') {
    // Identity Platform OIDC：Console 名稱 LINE → 程式用 oidc.line
    var line = new OAuthProvider(lineProviderId());
    // 若 LINE 頻道有開 email 權限，可一併請求
    line.addScope('openid');
    line.addScope('profile');
    line.addScope('email')
    return line;
  }
  return new GoogleAuthProvider();
}

window.YuruiFirebase = {
  ready: ready,
  app: app,
  auth: auth,
  meta: {
    projectId: config.projectId || null,
    authDomain: config.authDomain || null,
    lineProviderId: lineProviderId(),
  },
  getAuth: function getAuthOrThrow() {
    if (!ready || !auth) {
      throw new Error(
        'Firebase Auth 尚未就緒。請設定 frontend/.env.local（見 .env.example）並重啟 Vite。'
      );
    }
    return auth;
  },
  isReady: function isReady() {
    return ready;
  },
  getInitError: function getInitError() {
    return initError;
  },

  /** 等待 Firebase 從 IndexedDB 還原登入者，避免 Dashboard 太早判定未登入。 */
  waitForAuthState: function waitForAuthState() {
    if (!ready || !auth) return Promise.resolve(null);

    // 同一個分頁只建立一次等待流程，讓商城、Booking 與後台共用相同結果。
    if (authStateReadyPromise) return authStateReadyPromise;

    if (typeof auth.authStateReady === 'function') {
      authStateReadyPromise = auth.authStateReady().then(function () {
        return auth.currentUser || null;
      });

      return authStateReadyPromise;
    }

    authStateReadyPromise = new Promise(function (resolve) {
      var unsubscribe = onAuthStateChanged(auth, function (user) {
        unsubscribe();
        resolve(user || null);
      });
    });

    return authStateReadyPromise;
  },

  /**
   * 依 provider 彈窗登入（步驟 3-1／3-2：facebook／line；google 沿用）。
   * @param {'google'|'facebook'|'line'} providerKey
   */
  signInWithProvider: async function signInWithProvider(providerKey) {
    var key = String(providerKey || 'google').toLowerCase();
    if (key !== 'google' && key !== 'facebook' && key !== 'line') {
      throw new Error('不支援的登入來源: ' + providerKey);
    }
    var label =
      key === 'line' ? 'LINE' : key === 'facebook' ? 'Facebook' : 'Google';
    return signInWithAuthProvider(buildAuthProvider(key), label, key);
  },

  signInWithGoogle: async function signInWithGoogle() {
    return window.YuruiFirebase.signInWithProvider('google');
  },

  /** 步驟 3-1 */
  signInWithFacebook: async function signInWithFacebook() {
    return window.YuruiFirebase.signInWithProvider('facebook');
  },

  /** 步驟 3-2 */
  signInWithLine: async function signInWithLine() {
    return window.YuruiFirebase.signInWithProvider('line');
  },

  signOut: async function signOutFirebase() {
    if (!ready || !auth) return;
    try {
      await signOut(auth);
    } catch (error) {
      console.warn('[YuruiFirebase] signOut 失敗（可忽略）:', error);
    }
  },
};

export { app, auth, ready };
