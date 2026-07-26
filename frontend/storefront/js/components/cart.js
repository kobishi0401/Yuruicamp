// Shared cart drawer runtime.
(function () {
  'use strict';

  var lastCartFocus = null;
  var cartDrawerScrollPosition = { x: 0, y: 0 };

  function readCartScrollPosition() {
    return { x: window.scrollX, y: window.scrollY };
  }

  /**
   * 還原購物車 Drawer 開關前的頁面位置，避免按鈕聚焦或 drawer 關閉時跳回頁首。
   * 套用元件：button.siteCartButton、button.siteCartDrawerClose。
   */
  function restoreCartDrawerPosition(focusTarget) {
    window.requestAnimationFrame(function () {
      window.scrollTo(cartDrawerScrollPosition.x, cartDrawerScrollPosition.y);
      if (focusTarget && document.contains(focusTarget)) focusTarget.focus({ preventScroll: true });
    });
  }

  function escapeCartHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[char];
    });
  }

  function getCartDrawerElements() {
    return {
      drawer: document.getElementById('siteCartDrawer'),
      body: document.getElementById('siteCartDrawerBody'),
      footer: document.getElementById('siteCartDrawerFooter'),
      backdrop: document.getElementById('siteCartBackdrop'),
    };
  }

  /** 主站頁一律用根絕對路徑 / Always root-absolute storefront page URL */
  function getMainPageUrl(pageName) {
    return '/storefront/pages/' + pageName;
  }

  function renderEmptyCart() {
    return [
      '<div class="siteCartEmptyState">',
      '  <div class="siteCartEmptyIcon" aria-hidden="true"><i class="bi bi-bag-x"></i></div>',
      '  <h3 class="siteCartEmptyTitle">購物車目前是空的</h3>',
      '  <p class="siteCartEmptyText">先挑選需要的露營裝備，再一起結帳。</p>',
      '</div>',
    ].join('');
  }

  /**
   * 渲染購物車單一商品列，包含數量控制與垃圾桶移除按鈕。
   * 套用元件：#siteCartDrawerBody 內的 .siteCartItem。
   */
  function findCartItem(productId, variantId) {
    return window.AppState.cart.find(function (item) {
      return item.id === productId && (item.variantId || '') === (variantId || '');
    });
  }

  /** 購物車商品圖：API 已回可顯示 URL（/assets 或 https） */
  function resolveCartImageSrc(src) {
    return src || 'https://picsum.photos/seed/default/80/80';
  }

  function renderCartItem(item) {
    var itemTotal = Number(item.price || 0) * Number(item.quantity || 0);
    var detailUrl = getMainPageUrl('product-detail.html') + '?id=' + encodeURIComponent(item.id);
    var specHtml = window.renderSpecLabelHtml
      ? window.renderSpecLabelHtml(item.specLabel, 'siteCartItemSpec')
      : '';
    var variantId = item.variantId || '';
    var imageSrc = resolveCartImageSrc(item.image);

    return [
      '<article class="siteCartItem" data-product-id="' +
        escapeCartHtml(item.id) +
        '" data-variant-id="' +
        escapeCartHtml(variantId) +
        '">',
      '  <a class="siteCartItemImageLink" href="' + detailUrl + '">',
      '    <img class="siteCartItemImage" src="' +
        escapeCartHtml(imageSrc) +
        '" alt="' +
        escapeCartHtml(item.name) +
        '">',
      '  </a>',
      '  <div class="siteCartItemContent">',
      '    <div class="siteCartItemBrand">' + escapeCartHtml(item.brand || '') + '</div>',
      '    <a class="siteCartItemName" href="' + detailUrl + '">' + escapeCartHtml(item.name) + '</a>',
      specHtml,
      '    <div class="siteCartItemPrice">' + window.formatCurrency(Number(item.price || 0)) + '</div>',
      '    <div class="siteCartItemActions">',
      '      <button class="siteCartQuantityDecrease" data-product-id="' +
        escapeCartHtml(item.id) +
        '" data-variant-id="' +
        escapeCartHtml(variantId) +
        '" type="button" aria-label="減少數量">−</button>',
      '      <span class="siteCartItemQuantity">' + Number(item.quantity || 0) + '</span>',
      '      <button class="siteCartQuantityIncrease" data-product-id="' +
        escapeCartHtml(item.id) +
        '" data-variant-id="' +
        escapeCartHtml(variantId) +
        '" type="button" aria-label="增加數量">+</button>',
      '      <strong class="siteCartItemSubtotal">' + window.formatCurrency(itemTotal) + '</strong>',
      '      <button class="siteCartRemoveButton" data-product-id="' +
        escapeCartHtml(item.id) +
        '" data-variant-id="' +
        escapeCartHtml(variantId) +
        '" type="button" aria-label="移除商品">',
      '        <svg class="siteCartRemoveIcon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">',
      '          <path fill="currentColor" d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/>',
      '          <path fill="currentColor" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1 0-2H5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1h2.5a1 1 0 0 1 1 1M4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/>',
      '        </svg>',
      '        <span class="siteCartRemoveText">移除</span>',
      '      </button>',
      '    </div>',
      '  </div>',
      '</article>',
    ].join('');
  }

  function updateCartDrawerSummary() {
    var elements = getCartDrawerElements();
    var subtotal = window.calculateCartTotal(window.AppState.cart);
    var shipping = window.calculateShippingFee(subtotal);
    var total = subtotal + shipping;
    var subtotalEl = document.getElementById('summarySubtotal');
    var totalEl = document.getElementById('summaryTotal');

    if (subtotalEl) subtotalEl.textContent = window.formatCurrency(subtotal);
    if (totalEl) totalEl.textContent = window.formatCurrency(total);
    if (elements.footer) elements.footer.hidden = window.AppState.cart.length === 0;
  }

  /**
   * 廣播購物車內容已變更，讓商品詳情頁免運進度條等跨元件 UI 可同步刷新。
   * detail 會帶上目前小計與商品數量，避免各頁面重複推導基礎狀態。
   */
  function notifyCartChanged(action) {
    var cart = window.AppState && Array.isArray(window.AppState.cart) ? window.AppState.cart : [];
    var subtotal = window.calculateCartTotal ? window.calculateCartTotal(cart) : 0;
    var itemCount = cart.reduce(function (sum, item) {
      return sum + Number(item.quantity || 0);
    }, 0);

    document.dispatchEvent(
      new CustomEvent('yurui:cart-changed', {
        detail: {
          action: action,
          subtotal: subtotal,
          itemCount: itemCount,
        },
      })
    );
  }

  window.renderCartDrawer = function () {
    var elements = getCartDrawerElements();
    if (!elements.body || !window.AppState) return;

    var cart = window.AppState.cart || [];
    elements.body.innerHTML = cart.length === 0 ? renderEmptyCart() : cart.map(renderCartItem).join('');
    updateCartDrawerSummary();
  };

  window.openCartDrawer = function () {
    var elements = getCartDrawerElements();
    var cartButton = document.querySelector('.siteCartButton');
    if (!elements.drawer) return;

    cartDrawerScrollPosition = readCartScrollPosition();
    lastCartFocus = document.activeElement;
    window.closeMainHeaderDialogs?.();
    window.renderCartDrawer();
    elements.drawer.classList.add('isOpen');
    elements.drawer.setAttribute('aria-hidden', 'false');
    if (elements.backdrop) {
      elements.backdrop.hidden = false;
      elements.backdrop.classList.add('isVisible');
    }
    if (cartButton) cartButton.setAttribute('aria-expanded', 'true');
    document.body.classList.add('isHeaderLayerOpen');
    elements.drawer.querySelector('.siteCartDrawerClose')?.focus({ preventScroll: true });
    restoreCartDrawerPosition();
  };

  window.closeCartDrawer = function () {
    var elements = getCartDrawerElements();
    var cartButton = document.querySelector('.siteCartButton');
    var wasOpen = elements.drawer && elements.drawer.classList.contains('isOpen');
    if (wasOpen) cartDrawerScrollPosition = readCartScrollPosition();
    if (elements.drawer) {
      elements.drawer.classList.remove('isOpen');
      elements.drawer.setAttribute('aria-hidden', 'true');
    }
    if (elements.backdrop) {
      elements.backdrop.classList.remove('isVisible');
      elements.backdrop.hidden = true;
    }
    if (cartButton) cartButton.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('isHeaderLayerOpen');
    if (wasOpen) restoreCartDrawerPosition(lastCartFocus);
  };

  window.addToCart = function (product, quantity) {
    var amount = quantity || 1;
    var variantId = product.variantId || '';
    var existingItem = findCartItem(product.id, variantId);

    // Soft 庫存：超量時 clamp 並提示 / Clamp quantity when exceeding available stock
    var available = Number(product.availableQuantity);
    var inStock = product.inStock !== false && (!Number.isFinite(available) || available > 0);
    if (!inStock) {
      window.showToast && window.showToast('此商品目前無法購買', 'warning');
      return;
    }

    var currentQty = existingItem ? Number(existingItem.quantity) || 0 : 0;
    var requestedTotal = currentQty + amount;
    if (Number.isFinite(available) && requestedTotal > available) {
      amount = Math.max(0, available - currentQty);
      if (amount <= 0) {
        window.showToast && window.showToast('僅剩 ' + available + ' 件', 'warning');
        return;
      }
      window.showToast && window.showToast('僅剩 ' + available + ' 件', 'warning');
    }

    if (existingItem) {
      existingItem.quantity += amount;
      if (Number.isFinite(available)) existingItem.availableQuantity = available;
      existingItem.inStock = inStock;
    } else {
      window.AppState.cart.push(Object.assign({}, product, { quantity: amount, inStock: inStock }));
    }

    window.saveAppState();
    window.updateCartBadge();
    window.renderCartDrawer();
    notifyCartChanged('add');
    window.showToast && window.showToast('已加入購物車', 'success');
  };

  window.removeFromCart = function (productId, variantId) {
    window.AppState.cart = window.AppState.cart.filter(function (item) {
      return !(item.id === productId && (item.variantId || '') === (variantId || ''));
    });
    window.saveAppState();
    window.updateCartBadge();
    window.renderCartDrawer();
    notifyCartChanged('remove');
    window.showToast && window.showToast('已從購物車移除', 'info');
  };

  window.updateCartQuantity = function (productId, quantity, variantId) {
    var item = findCartItem(productId, variantId);
    if (!item) return;

    if (quantity <= 0) {
      window.removeFromCart(productId, variantId);
      return;
    }
    if (quantity <= window.AppConfig.CART.MAX_QUANTITY) {
      var available = Number(item.availableQuantity);
      if (Number.isFinite(available) && quantity > available) {
        quantity = available;
        window.showToast && window.showToast('僅剩 ' + available + ' 件', 'warning');
      }
      item.quantity = quantity;
      window.saveAppState();
      window.updateCartBadge();
      window.renderCartDrawer();
      notifyCartChanged('quantity');
    }
  };

  window.clearCart = function () {
    window.AppState.cart = [];
    window.saveAppState();
    window.updateCartBadge();
    window.renderCartDrawer();
    notifyCartChanged('clear');
  };

  function handleDrawerCheckout(event) {
    if (event) event.preventDefault();
    if (!window.AppState.cart || window.AppState.cart.length === 0) {
      window.showToast && window.showToast('購物車沒有商品', 'warning');
      return;
    }
    window.location.href = getMainPageUrl('cart.html');
  }

  function initCartDrawer() {
    var elements = getCartDrawerElements();
    var closeButton = elements.drawer ? elements.drawer.querySelector('.siteCartDrawerClose') : null;
    var cartButton = document.querySelector('.siteCartButton');
    var checkoutButton = document.getElementById('checkoutBtn');

    if (cartButton && cartButton.dataset.cartDrawerBound !== 'true') {
      cartButton.dataset.cartDrawerBound = 'true';
      cartButton.addEventListener('click', function (event) {
        event.preventDefault();
        window.openCartDrawer();
      });
    }
    if (closeButton && closeButton.dataset.cartDrawerBound !== 'true') {
      closeButton.dataset.cartDrawerBound = 'true';
      closeButton.addEventListener('click', window.closeCartDrawer);
    }
    if (elements.backdrop && elements.backdrop.dataset.cartDrawerBound !== 'true') {
      elements.backdrop.dataset.cartDrawerBound = 'true';
      elements.backdrop.addEventListener('click', window.closeCartDrawer);
    }
    if (checkoutButton && checkoutButton.dataset.cartDrawerBound !== 'true') {
      checkoutButton.dataset.cartDrawerBound = 'true';
      checkoutButton.addEventListener('click', handleDrawerCheckout);
    }
  }

  window.initCartListeners = function () {
    initCartDrawer();
    window.renderCartDrawer();

    if (document.body.dataset.cartActionsBound === 'true') return;
    document.body.dataset.cartActionsBound = 'true';
    document.addEventListener('click', function (event) {
      var increaseButton = event.target.closest('.siteCartQuantityIncrease');
      var decreaseButton = event.target.closest('.siteCartQuantityDecrease');
      var removeButton = event.target.closest('.siteCartRemoveButton');
      var item;

      if (increaseButton) {
        item = findCartItem(increaseButton.dataset.productId, increaseButton.dataset.variantId);
        if (item) window.updateCartQuantity(item.id, item.quantity + 1, item.variantId);
      }
      if (decreaseButton) {
        item = findCartItem(decreaseButton.dataset.productId, decreaseButton.dataset.variantId);
        if (item) window.updateCartQuantity(item.id, item.quantity - 1, item.variantId);
      }
      if (removeButton) {
        window.removeFromCart(removeButton.dataset.productId, removeButton.dataset.variantId);
      }
    });
  };
})();
