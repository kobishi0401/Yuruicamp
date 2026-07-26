// Storefront 確認背包頁：僅 soft 驗量；hard lock 改在 checkout 進頁建立 Session。
let storefrontCartCatalogPromise = null;

window.initStorefrontCartPage = () => {
  if (document.body.dataset.storefrontCartInitialized === 'true') return;
  document.body.dataset.storefrontCartInitialized = 'true';

  _renderStorefrontCartPage();
  _bindStorefrontCartActions();

  if (!window.AppState?.cart?.length) return;
  _runStorefrontCartSoftValidation();
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
    window.clearCart();
    _renderStorefrontCartPage();
    _setStorefrontCartSessionStatus({
      state: 'idle',
      title: '背包已清空',
      message: '返回商品列表繼續選購。',
    });
  });

  // K2：前往結帳前再驗一次 soft 庫存 / Re-validate stock before checkout navigation
  document.getElementById('storefrontCartCheckoutLink')?.addEventListener('click', async (event) => {
    if (event.currentTarget.getAttribute('aria-disabled') === 'true') {
      event.preventDefault();
      window.showToast?.('請依提示調整商品數量後再結帳。', 'info');
      return;
    }

    event.preventDefault();
    const result = await _runStorefrontCartSoftValidation({ blockCheckout: true });
    if (!result.ok) return;

    window.location.href = event.currentTarget.getAttribute('href') || './checkout.html';
  });

  document.addEventListener('yurui:cart-changed', () => {
    storefrontCartCatalogPromise = null;
    _renderStorefrontCartPage();
    if (window.AppState?.cart?.length) {
      _runStorefrontCartSoftValidation();
    } else {
      _setStorefrontCartSessionStatus({
        state: 'idle',
        title: '背包已清空',
        message: '',
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
  const stockHint =
    Number.isFinite(Number(item.availableQuantity)) && item.inStock !== false
      ? `<p class="storefrontCartItemStock">剩餘 ${Number(item.availableQuantity)} 件</p>`
      : '';

  return `
    <article class="storefrontCartItem">
      <a href="./product-detail.html?id=${encodeURIComponent(item.id)}">
        <img class="storefrontCartItemImage" src="${image}" alt="${name}">
      </a>
      <div>
        ${brand ? `<p class="storefrontCartItemBrand">${brand}</p>` : ''}
        <h3 class="storefrontCartItemName">${name}</h3>
        ${spec ? `<p class="storefrontCartItemSpec">${spec}</p>` : ''}
        ${stockHint}
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

/** 從 catalog 補齊 variant 可售量（若 API 有提供）/ Enrich cart lines with catalog stock when available */
async function _hydrateStorefrontCartStockFromCatalog(cart) {
  const productIds = [...new Set((cart || []).map((item) => item.id).filter(Boolean))];
  if (!productIds.length || !window.API?.products?.getById) return cart;

  if (!storefrontCartCatalogPromise) {
    storefrontCartCatalogPromise = Promise.all(
      productIds.map((productId) =>
        window.API.products.getById(productId).catch(() => null)
      )
    );
  }

  const products = await storefrontCartCatalogPromise;
  const variantMap = new Map();
  products.filter(Boolean).forEach((product) => {
    (product.variants || []).forEach((variant) => {
      variantMap.set(`${product.id}:${variant.id}`, variant);
    });
  });

  return (cart || []).map((item) => {
    const variant = variantMap.get(`${item.id}:${item.variantId || ''}`);
    if (!variant) return item;
    const availableQuantity = Number(variant.availableQuantity);
    return Object.assign({}, item, {
      availableQuantity: Number.isFinite(availableQuantity) ? availableQuantity : item.availableQuantity,
      inStock:
        variant.inStock !== false &&
        (Number.isFinite(availableQuantity) ? availableQuantity > 0 : item.inStock !== false),
    });
  });
}

/** Soft 驗量：不建立 Checkout Session，只檢查 client 端可售量 */
async function _runStorefrontCartSoftValidation({ blockCheckout = false } = {}) {
  const cart = window.AppState?.cart || [];
  if (!cart.length) {
    _setStorefrontCartSessionStatus({ state: 'idle', title: '背包已清空', message: '' });
    return { ok: false };
  }

  _setStorefrontCartSessionStatus({
    state: 'loading',
    title: '正在確認可售數量',
    message: '此步驟不會鎖定庫存，進入結帳頁才開始 15 分鐘保留。',
  });

  let hydratedCart;
  try {
    hydratedCart = await _hydrateStorefrontCartStockFromCatalog(cart);
    window.AppState.cart = hydratedCart;
    window.saveAppState?.();
    _renderStorefrontCartPage();
  } catch {
    hydratedCart = cart;
  }

  const issues = [];
  hydratedCart.forEach((item) => {
    if (item.inStock === false) {
      issues.push(`${item.name || '商品'}目前無法購買，請移除後再結帳。`);
      return;
    }
    const available = Number(item.availableQuantity);
    if (Number.isFinite(available) && Number(item.quantity) > available) {
      issues.push(`${item.name || '商品'}僅剩 ${available} 件，請調整數量。`);
    }
  });

  if (issues.length > 0) {
    _setStorefrontCartSessionStatus({
      state: 'error',
      title: blockCheckout ? '無法前往結帳' : '部分商品數量需調整',
      message: '請依提示調整購物背包後再繼續。',
      details: issues.map((reason) => ({ reason })),
    });
    if (blockCheckout) window.showToast?.(issues[0], 'warning');
    return { ok: false, issues };
  }

  _setStorefrontCartSessionStatus({
    state: 'ready',
    title: '商品數量已確認',
    message: '進入結帳頁後才會開始 15 分鐘庫存保留與倒數。',
  });
  return { ok: true };
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
  const messageElement = document.getElementById('storefrontCartSessionMessage');
  if (messageElement) messageElement.hidden = !String(message || '').trim();

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
      : state === 'error'
        ? '<i class="bi bi-exclamation-octagon" aria-hidden="true"></i> 請調整數量'
        : '<i class="bi bi-hourglass-split" aria-hidden="true"></i> 正在確認可售量';
  }
}

function _findStorefrontCartItem(productId, variantId) {
  return (window.AppState?.cart || []).find(
    (item) => item.id === productId && (item.variantId || '') === (variantId || '')
  );
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
