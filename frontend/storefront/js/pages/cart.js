// Storefront 確認背包頁：進頁建立 Draft Checkout Session 並保留商品庫存。
let storefrontCartSessionQueue = Promise.resolve();
let storefrontCartSessionRevision = 0;
let storefrontCartNeedsAuthRetry = false;

const STOREFRONT_CART_LAST_SESSION_KEY = 'lastCheckoutSession';
const STOREFRONT_CART_ORDER_ID_KEY = 'checkoutCompletedOrderId';
const STOREFRONT_CART_IDEMPOTENCY_KEY = 'checkoutIdempotencyKey';
const STOREFRONT_CART_FINGERPRINT_KEY = 'checkoutCartFingerprint';

window.initStorefrontCartPage = () => {
  if (document.body.dataset.storefrontCartInitialized === 'true') return;
  document.body.dataset.storefrontCartInitialized = 'true';

  _renderStorefrontCartPage();
  _bindStorefrontCartActions();

  if (!window.AppState?.cart?.length) return;

  const storedFingerprint = sessionStorage.getItem(STOREFRONT_CART_FINGERPRINT_KEY);
  let currentFingerprint;
  try {
    currentFingerprint = _buildStorefrontCartFingerprint(window.AppState.cart);
  } catch {
    _setStorefrontCartSessionStatus({
      state: 'error',
      title: '部分商品規格資料已失效',
      message: '請移除提示的舊商品，再從商品頁重新選擇規格。',
    });
    return;
  }
  const storedSession = _readStorefrontCartSession();
  const mustReplace =
    Boolean(storedSession) &&
    (storedFingerprint !== currentFingerprint || _isStorefrontCartSessionExpired(storedSession));

  if (storedSession && !mustReplace && ['draft', 'ready_to_pay'].includes(storedSession.checkoutStep)) {
    _applyStorefrontCartSessionPricing(storedSession.pricing);
    _setStorefrontCartSessionStatus({
      state: 'ready',
      title: '商品庫存已暫時保留',
      message: '請於 15 分鐘內填寫結帳資料並完成付款。',
    });
    return;
  }

  _prepareStorefrontCartSession(mustReplace);
};

function _bindStorefrontCartActions() {
  const cartItems = document.getElementById('storefrontCartItems');

  cartItems?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-cart-action]');
    if (!button) return;

    const item = _findStorefrontCartItem(button.dataset.productId, button.dataset.variantId);
    if (!item) return;

    if (button.dataset.cartAction === 'increase') {
      window.updateCartQuantity(item.id, item.quantity + 1, item.variantId);
    } else if (button.dataset.cartAction === 'decrease') {
      window.updateCartQuantity(item.id, item.quantity - 1, item.variantId);
    } else if (button.dataset.cartAction === 'remove') {
      window.removeFromCart(item.id, item.variantId);
    }
  });

  // 手動輸入數量時沿用共用購物車更新事件，讓金額與 Checkout Session 一起重建。
  cartItems?.addEventListener('change', (event) => {
    const input = event.target.closest('input[data-cart-quantity]');
    if (!input) return;

    const item = _findStorefrontCartItem(input.dataset.productId, input.dataset.variantId);
    if (!item) return;

    const quantity = Number(input.value);
    const maxQuantity = Number(window.AppConfig?.CART?.MAX_QUANTITY || 999);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
      input.value = String(item.quantity);
      window.showToast?.(`請輸入 1 到 ${maxQuantity} 之間的整數。`, 'warning');
      return;
    }
    if (quantity === Number(item.quantity)) return;

    window.updateCartQuantity(item.id, quantity, item.variantId);
  });

  document.getElementById('storefrontCartClearBtn')?.addEventListener('click', () => {
    const previousSession = _readStorefrontCartSession();

    // 先停止舊流程並立即更新空背包畫面，再於背景釋放後端保留庫存。
    storefrontCartSessionRevision += 1;
    window.clearCart();
    _clearStorefrontCartSessionState();
    _renderStorefrontCartPage();
    _cancelStorefrontCartSession(previousSession);
  });

  document.getElementById('storefrontCartCheckoutLink')?.addEventListener('click', (event) => {
    if (event.currentTarget.getAttribute('aria-disabled') === 'true') {
      event.preventDefault();
      window.showToast?.('請等待庫存確認完成。', 'info');
    }
  });

  document.addEventListener('yurui:cart-changed', () => {
    _renderStorefrontCartPage();
    if (window.AppState?.cart?.length) {
      _prepareStorefrontCartSession(true);
    } else {
      storefrontCartSessionRevision += 1;
      _clearStorefrontCartSessionState();
    }
  });

  window.addEventListener('yurui:auth-changed', (event) => {
    if (event.detail?.type === 'login' && storefrontCartNeedsAuthRetry) {
      storefrontCartNeedsAuthRetry = false;
      _prepareStorefrontCartSession(false);
    } else if (event.detail?.type === 'logout') {
      storefrontCartSessionRevision += 1;
      storefrontCartNeedsAuthRetry = true;
      _clearStorefrontCartSessionState();
      _setStorefrontCartSessionStatus({
        state: 'error',
        title: '請先登入',
        message: '登入後系統會自動確認並保留商品庫存。',
      });
    }
  });
}

function _renderStorefrontCartPage() {
  const cart = window.AppState?.cart || [];
  const hasItems = cart.length > 0;
  const empty = document.getElementById('storefrontCartEmpty');
  const content = document.getElementById('storefrontCartContent');
  const stepProgress = document.querySelector('.storefrontCartStepProgress');

  // 空背包時同步隱藏結帳流程與商品內容，只保留空狀態引導。
  if (empty) empty.hidden = hasItems;
  if (content) content.hidden = !hasItems;
  if (stepProgress) stepProgress.hidden = !hasItems;
  if (!hasItems) return;

  const list = document.getElementById('storefrontCartItems');
  if (list) list.innerHTML = cart.map(_buildStorefrontCartItemHtml).join('');

  const itemCount = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const subtotal = window.calculateCartTotal(cart);
  const shipping = window.calculateShippingFee(subtotal);

  _setStorefrontCartText('storefrontCartItemCount', `共 ${itemCount} 件商品`);
  _setStorefrontCartText('storefrontCartSubtotal', window.formatCurrency(subtotal));
  _setStorefrontCartText('storefrontCartShipping', shipping === 0 ? '免運' : window.formatCurrency(shipping));
  _setStorefrontCartText('storefrontCartTotal', window.formatCurrency(subtotal + shipping));
}

function _buildStorefrontCartItemHtml(item) {
  const productId = _escapeStorefrontCartHtml(item.id);
  const variantId = _escapeStorefrontCartHtml(item.variantId || '');
  const name = _escapeStorefrontCartHtml(item.name || '');
  const brand = _escapeStorefrontCartHtml(item.brand || '');
  const spec = _escapeStorefrontCartHtml(item.specLabel || '');
  const image = _escapeStorefrontCartHtml(item.image || 'https://picsum.photos/seed/default/96/96');
  const quantity = Number(item.quantity || 0);
  const maxQuantity = Number(window.AppConfig?.CART?.MAX_QUANTITY || 999);
  const unitPrice = Number(item.price || 0);

  return `
    <article class="storefrontCartItem">
      <a href="./product-detail.html?id=${encodeURIComponent(item.id)}">
        <img class="storefrontCartItemImage" src="${image}" alt="${name}">
      </a>
      <div>
        ${brand ? `<p class="storefrontCartItemBrand">${brand}</p>` : ''}
        <h3 class="storefrontCartItemName">${name}</h3>
        ${spec ? `<p class="storefrontCartItemSpec">${spec}</p>` : ''}
        <p class="storefrontCartItemUnitPrice">單價 ${window.formatCurrency(unitPrice)}</p>
      </div>
      <div class="storefrontCartItemActions">
        <div class="storefrontCartQuantity" aria-label="${name}數量">
          <button type="button" data-cart-action="decrease" data-product-id="${productId}" data-variant-id="${variantId}" aria-label="減少${name}數量">−</button>
          <input class="storefrontCartQuantityInput" type="number" value="${quantity}" min="1" max="${maxQuantity}" step="1" inputmode="numeric" data-cart-quantity data-product-id="${productId}" data-variant-id="${variantId}" aria-label="輸入${name}數量">
          <button type="button" data-cart-action="increase" data-product-id="${productId}" data-variant-id="${variantId}" aria-label="增加${name}數量">＋</button>
        </div>
        <strong class="storefrontCartItemSubtotal">${window.formatCurrency(unitPrice * quantity)}</strong>
        <button class="storefrontCartRemoveBtn" type="button" data-cart-action="remove" data-product-id="${productId}" data-variant-id="${variantId}">
          <i class="bi bi-trash3" aria-hidden="true"></i> 移除
        </button>
      </div>
    </article>
  `;
}

// 進頁或數量變更時建立 Draft；變更商品前先取消舊保留。
function _prepareStorefrontCartSession(replaceExisting) {
  const revision = ++storefrontCartSessionRevision;
  _setStorefrontCartSessionStatus({
    state: 'loading',
    title: '正在確認商品庫存',
    message: '請稍候，我們正在建立 Checkout Session。',
  });

  storefrontCartSessionQueue = storefrontCartSessionQueue
    .catch(() => {
      // 前一次失敗不阻斷使用者調整數量後的下一次重試。
    })
    .then(async () => {
      const previousSession = _readStorefrontCartSession();
      if (replaceExisting && previousSession?.orderId) {
        await window.API.checkout.cancelSession(previousSession.orderId);
      }

      if (replaceExisting || _isStorefrontCartSessionExpired(previousSession)) {
        _clearStorefrontCartSessionState();
      }

      const cartSnapshot = window.AppState.cart;
      const request = _buildStorefrontCartCheckoutRequest(cartSnapshot);
      const checkoutSession = await window.API.checkout.createSession(request);

      return {
        checkoutSession,
        fingerprint: _buildStorefrontCartFingerprint(cartSnapshot),
      };
    })
    .then(async (result) => {
      if (revision !== storefrontCartSessionRevision) {
        await _cancelStorefrontCartSession(result.checkoutSession);
        return;
      }

      _saveStorefrontCartSession(result.checkoutSession, result.fingerprint);
      storefrontCartNeedsAuthRetry = false;
      _applyStorefrontCartSessionPricing(result.checkoutSession.pricing);
      _setStorefrontCartSessionStatus({
        state: 'ready',
        title: '商品庫存已暫時保留',
        message: '請於 15 分鐘內填寫結帳資料並完成付款。',
      });
    })
    .catch((error) => {
      if (revision !== storefrontCartSessionRevision) return;

      _clearStorefrontCartSessionState();
      storefrontCartNeedsAuthRetry = _isStorefrontCartAuthError(error);
      _renderStorefrontCartSessionError(error);
    });

  return storefrontCartSessionQueue;
}

function _buildStorefrontCartCheckoutRequest(cart) {
  return {
    items: _buildStorefrontCartRequestItems(cart),
    idempotencyKey: _getStorefrontCartIdempotencyKey(cart),
  };
}

function _buildStorefrontCartRequestItems(cart) {
  return cart.map((item) => {
    const variantId = String(item.variantId || '').trim();
    const quantity = Number(item.quantity);
    if (!variantId || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error('購物車商品缺少有效的規格或數量。');
    }

    return { variantId, quantity };
  });
}

function _buildStorefrontCartFingerprint(cart) {
  return JSON.stringify(
    _buildStorefrontCartRequestItems(cart)
      .slice()
      .sort((left, right) => left.variantId.localeCompare(right.variantId))
  );
}

function _getStorefrontCartIdempotencyKey(cart) {
  const fingerprint = _buildStorefrontCartFingerprint(cart);
  const previousFingerprint = sessionStorage.getItem(STOREFRONT_CART_FINGERPRINT_KEY);
  let key = sessionStorage.getItem(STOREFRONT_CART_IDEMPOTENCY_KEY);

  if (!key || previousFingerprint !== fingerprint) {
    if (!window.crypto?.randomUUID) throw new Error('瀏覽器無法建立安全的 Checkout 識別碼。');
    key = window.crypto.randomUUID();
    sessionStorage.setItem(STOREFRONT_CART_IDEMPOTENCY_KEY, key);
    sessionStorage.setItem(STOREFRONT_CART_FINGERPRINT_KEY, fingerprint);
  }

  return key;
}

function _saveStorefrontCartSession(checkoutSession, fingerprint) {
  sessionStorage.setItem(STOREFRONT_CART_LAST_SESSION_KEY, JSON.stringify(checkoutSession));
  sessionStorage.setItem(STOREFRONT_CART_ORDER_ID_KEY, checkoutSession.orderId);
  sessionStorage.setItem(STOREFRONT_CART_FINGERPRINT_KEY, fingerprint);
}

function _readStorefrontCartSession() {
  try {
    return JSON.parse(sessionStorage.getItem(STOREFRONT_CART_LAST_SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

function _clearStorefrontCartSessionState() {
  sessionStorage.removeItem(STOREFRONT_CART_LAST_SESSION_KEY);
  sessionStorage.removeItem(STOREFRONT_CART_ORDER_ID_KEY);
  sessionStorage.removeItem(STOREFRONT_CART_IDEMPOTENCY_KEY);
  sessionStorage.removeItem(STOREFRONT_CART_FINGERPRINT_KEY);
}

function _isStorefrontCartSessionExpired(checkoutSession) {
  const expiresAt = checkoutSession?.checkoutExpiresAt;
  return Boolean(expiresAt && Date.parse(expiresAt) <= Date.now());
}

async function _cancelStorefrontCartSession(checkoutSession) {
  if (!checkoutSession?.orderId || !window.API?.checkout?.cancelSession) return;
  try {
    await window.API.checkout.cancelSession(checkoutSession.orderId);
  } catch (error) {
    console.warn('[storefront-cart] 無法釋放舊 Checkout Session：', error);
  }
}

function _applyStorefrontCartSessionPricing(pricing) {
  const subtotal = Number(pricing?.subtotal);
  const shipping = Number(pricing?.shippingFee);
  const total = Number(pricing?.total);
  if (![subtotal, shipping, total].every((value) => Number.isFinite(value) && value >= 0)) return;

  _setStorefrontCartText('storefrontCartSubtotal', window.formatCurrency(subtotal));
  _setStorefrontCartText(
    'storefrontCartShipping',
    shipping === 0 ? '結帳時計算' : window.formatCurrency(shipping)
  );
  _setStorefrontCartText('storefrontCartTotal', window.formatCurrency(total));
}

function _renderStorefrontCartSessionError(error) {
  const code = String(error?.code || '').toUpperCase();
  const details = Array.isArray(error?.details) ? error.details : [];

  if (code === 'STOCK_INSUFFICIENT') {
    _setStorefrontCartSessionStatus({
      state: 'error',
      title: '商品剩餘數量不足請重新調整數量',
      message: '請依目前可用數量調整購物背包。',
      details,
    });
    return;
  }
  if (code === 'VARIANT_NOT_SELLABLE') {
    _setStorefrontCartSessionStatus({
      state: 'error',
      title: '部分商品目前無法購買',
      message: '請移除已下架的商品後再繼續。',
      details,
    });
    return;
  }
  if (_isStorefrontCartAuthError(error)) {
    _setStorefrontCartSessionStatus({
      state: 'error',
      title: '請先登入',
      message: '登入後系統會自動確認並保留商品庫存。',
    });
    window.openModal?.('loginModal');
    return;
  }

  _setStorefrontCartSessionStatus({
    state: 'error',
    title: '暫時無法確認商品庫存',
    message: error?.message || '請稍後重新整理頁面再試。',
  });
}

function _setStorefrontCartSessionStatus({ state, title, message, details = [] }) {
  const panel = document.getElementById('storefrontCartSessionStatus');
  const icon = document.getElementById('storefrontCartSessionIcon');
  const list = document.getElementById('storefrontCartSessionDetails');
  const checkoutLink = document.getElementById('storefrontCartCheckoutLink');
  const ready = state === 'ready';

  panel?.classList.toggle('isReady', ready);
  panel?.classList.toggle('isError', state === 'error');
  if (icon) {
    icon.className = `bi ${
      ready ? 'bi-check-circle' : state === 'error' ? 'bi-exclamation-octagon' : 'bi-hourglass-split'
    }`;
  }
  _setStorefrontCartText('storefrontCartSessionTitle', title);
  _setStorefrontCartText('storefrontCartSessionMessage', message);

  if (list) {
    const messages = details.map((detail) => detail?.reason || detail?.message).filter(Boolean);
    list.replaceChildren(
      ...messages.map((detail) => {
        const item = document.createElement('li');
        item.textContent = detail;
        return item;
      })
    );
    list.hidden = messages.length === 0;
  }

  if (checkoutLink) {
    checkoutLink.setAttribute('aria-disabled', String(!ready));
    checkoutLink.innerHTML = ready
      ? '<i class="bi bi-arrow-right-circle" aria-hidden="true"></i> 前往填寫結帳資料'
      : '<i class="bi bi-hourglass-split" aria-hidden="true"></i> 正在確認庫存';
  }
}

function _findStorefrontCartItem(productId, variantId) {
  return (window.AppState?.cart || []).find(
    (item) => item.id === productId && (item.variantId || '') === (variantId || '')
  );
}

function _isStorefrontCartAuthError(error) {
  const code = String(error?.code || '').toUpperCase();
  return code === 'UNAUTHORIZED' || code === 'AUTH_TOKEN_UNAVAILABLE';
}

function _setStorefrontCartText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function _escapeStorefrontCartHtml(value) {
  return String(value == null ? '' : value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char]
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.initStorefrontCartPage);
} else {
  window.initStorefrontCartPage();
}
