// Shared cart drawer runtime.
(function () {
  'use strict';

  var lastCartFocus = null;

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

  function getMainPageUrl(pageName) {
    return window.location.pathname.includes('/pages/') ? pageName : 'pages/' + pageName;
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
  function renderCartItem(item) {
    var itemTotal = Number(item.price || 0) * Number(item.quantity || 0);
    var detailUrl = getMainPageUrl('product-detail.html') + '?id=' + encodeURIComponent(item.id);

    return [
      '<article class="siteCartItem" data-product-id="' + escapeCartHtml(item.id) + '">',
      '  <a class="siteCartItemImageLink" href="' + detailUrl + '">',
      '    <img class="siteCartItemImage" src="' + escapeCartHtml(item.image || 'https://picsum.photos/seed/default/80/80') + '" alt="' + escapeCartHtml(item.name) + '">',
      '  </a>',
      '  <div class="siteCartItemContent">',
      '    <div class="siteCartItemBrand">' + escapeCartHtml(item.brand || '') + '</div>',
      '    <a class="siteCartItemName" href="' + detailUrl + '">' + escapeCartHtml(item.name) + '</a>',
      '    <div class="siteCartItemPrice">' + window.formatCurrency(Number(item.price || 0)) + '</div>',
      '    <div class="siteCartItemActions">',
      '      <button class="siteCartQuantityDecrease" data-product-id="' + escapeCartHtml(item.id) + '" type="button" aria-label="減少數量">−</button>',
      '      <span class="siteCartItemQuantity">' + Number(item.quantity || 0) + '</span>',
      '      <button class="siteCartQuantityIncrease" data-product-id="' + escapeCartHtml(item.id) + '" type="button" aria-label="增加數量">+</button>',
      '      <strong class="siteCartItemSubtotal">' + window.formatCurrency(itemTotal) + '</strong>',
      '      <button class="siteCartRemoveButton" data-product-id="' + escapeCartHtml(item.id) + '" type="button" aria-label="移除商品">',
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
    var shippingEl = document.getElementById('summaryShipping');
    var totalEl = document.getElementById('summaryTotal');

    if (subtotalEl) subtotalEl.textContent = window.formatCurrency(subtotal);
    if (shippingEl) shippingEl.textContent = shipping === 0 ? '免運' : window.formatCurrency(shipping);
    if (totalEl) totalEl.textContent = window.formatCurrency(total);
    if (elements.footer) elements.footer.hidden = window.AppState.cart.length === 0;
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
    elements.drawer.querySelector('.siteCartDrawerClose')?.focus();
  };

  window.closeCartDrawer = function () {
    var elements = getCartDrawerElements();
    var cartButton = document.querySelector('.siteCartButton');
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
    if (lastCartFocus) lastCartFocus.focus();
  };

  window.addToCart = function (product, quantity) {
    var amount = quantity || 1;
    var existingItem = window.AppState.cart.find(function (item) {
      return item.id === product.id;
    });

    if (existingItem) existingItem.quantity += amount;
    else window.AppState.cart.push(Object.assign({}, product, { quantity: amount }));

    window.saveAppState();
    window.updateCartBadge();
    window.renderCartDrawer();
    window.showToast && window.showToast('已加入購物車', 'success');
  };

  window.removeFromCart = function (productId) {
    window.AppState.cart = window.AppState.cart.filter(function (item) {
      return item.id !== productId;
    });
    window.saveAppState();
    window.updateCartBadge();
    window.renderCartDrawer();
    window.showToast && window.showToast('已從購物車移除', 'info');
  };

  window.updateCartQuantity = function (productId, quantity) {
    var item = window.AppState.cart.find(function (cartItem) {
      return cartItem.id === productId;
    });
    if (!item) return;

    if (quantity <= 0) {
      window.removeFromCart(productId);
      return;
    }
    if (quantity <= window.AppConfig.CART.MAX_QUANTITY) {
      item.quantity = quantity;
      window.saveAppState();
      window.updateCartBadge();
      window.renderCartDrawer();
    }
  };

  window.clearCart = function () {
    window.AppState.cart = [];
    window.saveAppState();
    window.updateCartBadge();
    window.renderCartDrawer();
  };

  function handleDrawerCheckout(event) {
    if (event) event.preventDefault();
    if (!window.AppState.cart || window.AppState.cart.length === 0) {
      window.showToast && window.showToast('購物車沒有商品', 'warning');
      return;
    }
    window.location.href = getMainPageUrl('checkout.html');
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
        item = window.AppState.cart.find(function (cartItem) {
          return cartItem.id === increaseButton.dataset.productId;
        });
        if (item) window.updateCartQuantity(item.id, item.quantity + 1);
      }
      if (decreaseButton) {
        item = window.AppState.cart.find(function (cartItem) {
          return cartItem.id === decreaseButton.dataset.productId;
        });
        if (item) window.updateCartQuantity(item.id, item.quantity - 1);
      }
      if (removeButton) window.removeFromCart(removeButton.dataset.productId);
    });
  };
}());
