// Checkout page state and behavior.
let checkoutDiscount = 0;
let checkoutCouponCatalogPromise = null;
let checkoutCouponCatalog = [];
let appliedCheckoutCouponCodes = [];
let selectedShippingMethod = 'delivery';
let checkoutShippingUi = null;

const DEFAULT_CHECKOUT_USER_ID = 'U001';
const STORE_PICKUP_ADDRESS = '台北門市';
const CHECKOUT_MOCK_ORDERS_STORAGE_KEY = 'mockOrders';
const CHECKOUT_LAST_ORDER_STORAGE_KEY = 'lastCheckoutOrder';

// Load shared shipping address modal partial.
async function _loadShippingAddressModal() {
  const mount = document.getElementById('shippingAddressModalMount');
  if (!mount || mount.dataset.loaded === 'true') return;
  try {
    const response = await fetch('../components/shipping-address-modal.partial', { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    mount.innerHTML = await response.text();
    mount.dataset.loaded = 'true';
    window.YuruiShippingAddressUI?.bindModal?.();
  } catch (error) {
    console.error('Failed to load shipping address modal', error);
  }
}

// Initialize checkout shipping address display + modal.
function _initCheckoutShippingAddress() {
  if (!window.YuruiShippingAddressUI || !window.YuruiShippingAddress) return;

  const user = window.AppState?.currentUser;
  let initial = window.YuruiShippingAddress.empty();
  if (user) {
    initial = window.YuruiShippingAddress.resolve(user, _readLocalProfile());
  }

  checkoutShippingUi = window.YuruiShippingAddressUI.init({
    displayEl: document.getElementById('checkoutShippingAddressDisplay'),
    editBtn: document.getElementById('checkoutShippingAddressEditBtn'),
    initialAddress: initial,
    persist: Boolean(window.AppState?.isLoggedIn && user?.id),
    getAddress: () => window.YuruiShippingAddressUI.getAddress(),
    onSave: (addr) => {
      if (window.AppState?.currentUser) {
        window.AppState.currentUser.shippingAddress = addr;
      }
    },
  });
}

function _readLocalProfile() {
  try {
    return JSON.parse(localStorage.getItem('yurui_profile') || '{}');
  } catch {
    return {};
  }
}

function _getCheckoutShippingAddress() {
  if (window.YuruiShippingAddressUI) {
    return window.YuruiShippingAddressUI.getAddress();
  }
  return window.YuruiShippingAddress?.empty() || null;
}

// Initialize checkout page.
window.initCheckoutPage = async () => {
  if (!window.AppState.cart || window.AppState.cart.length === 0) {
    window.showToast('購物車是空的，請先選購商品', 'warning');
    window.setTimeout(() => { window.location.href = 'products.html'; }, 1500);
    return;
  }

  await _loadShippingAddressModal();
  _initCheckoutShippingAddress();

  _renderCheckoutItems();
  _updateCheckoutSummary();
  _initAccordionPanels();
  _initShippingMethodChange();
  _initPaymentMethodChange();
  _initFillProfileBtn();
  _initConfirmOrderBtn();
  _initCheckoutCoupon();
  _initSharedComponents();

  if (window.AppState?.isLoggedIn && window.AppState?.currentUser) {
    _fillBuyerFields(window.AppState.currentUser);
  }
};

// Initialize shared header, modal, cart, and personalization components.
function _initSharedComponents() {
  window.initNavbar?.();
  window.initModalListeners?.();
  window.initCartListeners?.();
  window.initPersonalizationModal?.();
  window._appComponentsInitialized = true;
}

// Read money text from a summary field.
function _readCheckoutMoney(elementId, fallback = 0) {
  const text = document.getElementById(elementId)?.textContent || '';
  if (text.includes('\u514d\u904b')) return 0;
  const value = Number(text.replace(/[^\d.-]/g, ''));
  return Number.isFinite(value) ? Math.abs(value) : fallback;
}

// Calculate checkout points from current subtotal.
function _calculateCheckoutPointsFromSummary() {
  const subtotal = _readCheckoutMoney('checkoutSubtotal', window.calculateCartTotal(window.AppState.cart));
  return Math.ceil(subtotal * 0.1);
}

// Map selected payment radio to order payment code.
function _getSelectedPaymentCode() {
  const selectedPayment = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'credit';
  return { credit: 'credit-card', linepay: 'line-pay', cod: 'cod' }[selectedPayment] || selectedPayment;
}

// Return payment status for the selected payment method.
function _getCheckoutPaymentStatus() {
  return _getSelectedPaymentCode() === 'cod' ? 'cod' : 'paid';
}

// Build coupon snapshots for the order payload.
function _buildCheckoutCouponSnapshots(subtotal) {
  if (!window.YuruiCoupons || checkoutCouponCatalog.length === 0) return [];
  const applied = window.YuruiCoupons.calculateAppliedCoupons(
    checkoutCouponCatalog,
    appliedCheckoutCouponCodes,
    subtotal,
    _getCheckoutCouponValidationOptions()
  );
  return applied.items.map(item => ({
    code: item.code,
    type: item.coupon.type,
    discount: item.coupon.discount,
    amount: item.discount,
  }));
}

// Return local datetime as YYYY-MM-DD HH:mm:ss for mock order storage.
// 重點：createdAt 使用完整日期時間，方便之後後端 LocalDateTime 直接對接。
function _getCheckoutDateTimeString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

// Return today's local date in yyyy-mm-dd format.
function _getCheckoutTodayString() {
  return _getCheckoutDateTimeString().slice(0, 10);
}

// Get the current checkout user id.
function _getCheckoutUserId() {
  const currentUser = window.AppState?.currentUser || {};
  return currentUser.id || DEFAULT_CHECKOUT_USER_ID;
}

// Load shared coupon catalog for checkout.
async function _loadCheckoutCouponCatalog() {
  if (!checkoutCouponCatalogPromise) {
    checkoutCouponCatalogPromise = window.YuruiCoupons.loadCoupons()
      .then(coupons => {
        checkoutCouponCatalog = coupons;
        window.YuruiCoupons.renderCouponOptions('checkoutCouponCodeOptions', coupons);
        return coupons;
      })
      .catch(error => {
        console.error('Failed to load checkout coupon catalog', error);
        return [];
      });
  }
  return checkoutCouponCatalogPromise;
}

// Recalculate applied coupons and sync localStorage.
function _syncCheckoutAppliedCoupons() {
  const subtotal = window.calculateCartTotal(window.AppState.cart);
  const previousCodes = [...appliedCheckoutCouponCodes];
  const applied = window.YuruiCoupons.calculateAppliedCoupons(
    checkoutCouponCatalog,
    appliedCheckoutCouponCodes,
    subtotal,
    _getCheckoutCouponValidationOptions()
  );
  checkoutDiscount = applied.totalDiscount;
  appliedCheckoutCouponCodes = applied.items.map(item => item.code);
  _renderAppliedCoupons(applied.items);

  if (appliedCheckoutCouponCodes.length > 0) window.YuruiCoupons.saveAppliedCouponCodes(appliedCheckoutCouponCodes);
  else window.YuruiCoupons.clearAppliedCouponCode();
  if (previousCodes.length > appliedCheckoutCouponCodes.length) {
    _showCouponMessage('部分折扣碼已不符合使用條件，已重新計算折扣', 'error');
  }
  return { removed: previousCodes.length > appliedCheckoutCouponCodes.length, items: applied.items };
}

// Render checkout item rows.
function _renderCheckoutItems() {
  const listEl = document.getElementById('checkoutItemsList');
  if (!listEl) return;
  listEl.innerHTML = window.AppState.cart.map(item => _buildCheckoutItem(item)).join('');
}

// Build one checkout summary item.
function _buildCheckoutItem(item) {
  const specHtml = window.renderSpecLabelHtml
    ? window.renderSpecLabelHtml(item.specLabel, 'checkoutSummaryItemSpec')
    : '';
  return `
    <article class="checkoutSummaryItem">
      <div class="checkoutSummaryItemImageWrap">
        <img src="${item.image || 'https://picsum.photos/seed/default/60/60'}" alt="${item.name}" class="checkoutSummaryItemImage">
        <span class="checkoutSummaryItemQuantity">${item.quantity}</span>
      </div>
      <div class="checkoutSummaryItemDetails">
        <h3 class="checkoutSummaryItemName" title="${item.name}">${item.name}</h3>
        ${specHtml}
        ${item.brand ? `<p class="checkoutSummaryItemBrand">${item.brand}</p>` : ''}
      </div>
      <p class="checkoutSummaryItemSubtotal">${window.formatCurrency(item.price * item.quantity)}</p>
    </article>
  `;
}

// Update price summary values and state classes.
function _updateCheckoutSummary() {
  const subtotal = window.calculateCartTotal(window.AppState.cart);
  const shipping = window.calculateShippingFee(subtotal, selectedShippingMethod);
  if (checkoutCouponCatalog.length > 0) _syncCheckoutAppliedCoupons();
  const total = Math.max(subtotal - checkoutDiscount + shipping, 0);

  _setText('checkoutSubtotal', window.formatCurrency(subtotal));
  _renderShippingFee(shipping);
  _renderDiscountRow();
  _setText('checkoutTotal', window.formatCurrency(total));
}

// Render shipping fee and free-shipping state.
function _renderShippingFee(shipping) {
  const shippingEl = document.getElementById('checkoutShipping');
  if (!shippingEl) return;
  shippingEl.textContent = shipping === 0 ? '\u514d\u904b' : window.formatCurrency(shipping);
  shippingEl.classList.toggle('isFreeShipping', shipping === 0);
}

// Render discount row visibility and amount.
function _renderDiscountRow() {
  const discountRow = document.getElementById('checkoutDiscountRow');
  const discountEl = document.getElementById('checkoutDiscount');
  if (!discountRow || !discountEl) return;
  discountRow.hidden = checkoutDiscount <= 0;
  discountEl.textContent = `-${window.formatCurrency(checkoutDiscount)}`;
}

// Set textContent by id.
function _setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

// Initialize accordion panel toggles.
function _initAccordionPanels() {
  document.querySelectorAll('[data-panel-trigger]').forEach(trigger => {
    trigger.addEventListener('click', () => _setPanelOpen(trigger, trigger.getAttribute('aria-expanded') !== 'true'));
    trigger.addEventListener('keydown', event => _handlePanelKeydown(event, trigger));
  });
}

// Toggle an accordion panel.
function _setPanelOpen(trigger, isOpen) {
  const panel = trigger.closest('.checkoutPanel');
  const body = document.getElementById(trigger.getAttribute('aria-controls'));
  panel?.classList.toggle('isOpen', isOpen);
  trigger.setAttribute('aria-expanded', String(isOpen));
  if (body) body.hidden = !isOpen;
}

function _openCheckoutPanelByField(fieldId) {
  const panelMap = {
    buyerName: 'panelBuyerBody',
    buyerPhone: 'panelBuyerBody',
    buyerEmail: 'panelBuyerBody',
    deliveryAddress: 'panelShippingBody',
    cardNumber: 'panelPaymentBody',
    cardExpiry: 'panelPaymentBody',
    cardCvv: 'panelPaymentBody',
  };
  const bodyId = panelMap[fieldId];
  if (!bodyId) return;

  const trigger = document.querySelector(`[aria-controls="${bodyId}"]`);
  // 表單錯誤可能藏在收合面板內，先展開再 focus，避免使用者不知道哪裡需要修正。
  if (trigger && trigger.getAttribute('aria-expanded') !== 'true') _setPanelOpen(trigger, true);
}

// Support Enter and Space on accordion triggers.
function _handlePanelKeydown(event, trigger) {
  if (!['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  _setPanelOpen(trigger, trigger.getAttribute('aria-expanded') !== 'true');
}

// Initialize shipping method radios.
function _initShippingMethodChange() {
  const radios = document.querySelectorAll('input[name="shippingMethod"]');
  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      selectedShippingMethod = radio.value;
      _updateCheckoutSummary();
      _syncRadioGroupState('shippingMethod');
      _syncDeliveryAddressState();
    });
  });
  _syncRadioGroupState('shippingMethod');
  _syncDeliveryAddressState();
}

// Initialize payment method radios.
function _initPaymentMethodChange() {
  const radios = document.querySelectorAll('input[name="paymentMethod"]');
  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      _syncRadioGroupState('paymentMethod');
      _syncCreditCardState();
      if (radio.value === 'credit') _initCardNumberFormat();
    });
  });
  _syncRadioGroupState('paymentMethod');
  _syncCreditCardState();
  _initCardNumberFormat();
}

// Update selected state for radio option labels.
function _syncRadioGroupState(name) {
  document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
    input.closest('.checkoutChoice')?.classList.toggle('isSelected', input.checked);
  });
}

// Toggle delivery address field by shipping method.
function _syncDeliveryAddressState() {
  const section = document.getElementById('deliveryAddressSection');
  if (section) section.hidden = selectedShippingMethod !== 'delivery';
}

// Toggle credit-card form by payment method.
function _syncCreditCardState() {
  const section = document.getElementById('creditCardSection');
  const selected = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'credit';
  if (section) section.hidden = selected !== 'credit';
}

// Initialize credit-card input formatting.
function _initCardNumberFormat() {
  const cardInput = document.getElementById('cardNumber');
  if (cardInput && !cardInput.dataset.formatted) {
    cardInput.dataset.formatted = 'true';
    cardInput.addEventListener('input', event => {
      const value = event.target.value.replace(/\D/g, '').substring(0, 16);
      event.target.value = value.replace(/(.{4})/g, '$1 ').trim();
    });
  }
  _initExpiryFormat();
}

// Initialize credit-card expiry input formatting.
function _initExpiryFormat() {
  const expiryInput = document.getElementById('cardExpiry');
  if (!expiryInput || expiryInput.dataset.formatted) return;
  expiryInput.dataset.formatted = 'true';
  expiryInput.addEventListener('input', event => {
    let value = event.target.value.replace(/\D/g, '').substring(0, 4);
    if (value.length > 2) value = `${value.substring(0, 2)} / ${value.substring(2)}`;
    event.target.value = value;
  });
}

// Initialize fill-profile action.
function _initFillProfileBtn() {
  const button = document.getElementById('fillProfileBtn');
  if (!button) return;
  button.addEventListener('click', () => {
    if (!window.AppState.isLoggedIn || !window.AppState.currentUser) {
      window.showToast('\u8acb\u5148\u767b\u5165\u5f8c\u518d\u5e36\u5165\u6703\u54e1\u8cc7\u6599', 'info');
      window.openModal('loginModal');
      return;
    }
    _fillBuyerFields(window.AppState.currentUser);
    window.showToast('\u5df2\u5e36\u5165\u6703\u54e1\u8cc7\u6599', 'success');
  });
}

// Fill buyer fields from the current user profile.
function _fillBuyerFields(user) {
  if (user.name) document.getElementById('buyerName').value = user.name;
  if (user.phone) document.getElementById('buyerPhone').value = user.phone;
  if (user.email) document.getElementById('buyerEmail').value = user.email;

  if (window.YuruiShippingAddressUI && window.YuruiShippingAddress) {
    const addr = window.YuruiShippingAddress.resolve(user, _readLocalProfile());
    window.YuruiShippingAddressUI.setAddress(addr);
  }
}

// Initialize coupon controls.
function _initCheckoutCoupon() {
  const applyBtn = document.getElementById('checkoutApplyCouponBtn');
  const couponInput = document.getElementById('checkoutCouponInput');
  if (!applyBtn || !couponInput) return;

  _loadCheckoutCouponCatalog().then(() => {
    const carriedCodes = window.YuruiCoupons.getAppliedCouponCodes();
    if (carriedCodes.length === 0) return;
    appliedCheckoutCouponCodes = carriedCodes;
    _syncCheckoutAppliedCoupons();
    _updateCheckoutSummary();
  });

  applyBtn.addEventListener('click', () => _applyCheckoutCouponCode());
  couponInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    applyBtn.click();
  });
}

// Validate and apply one coupon code.
async function _applyCheckoutCouponCode({ showToast = true } = {}) {
  const couponInput = document.getElementById('checkoutCouponInput');
  if (!couponInput) return;

  const code = couponInput.value.trim().toUpperCase();
  const coupons = await _loadCheckoutCouponCatalog();
  const subtotal = window.calculateCartTotal(window.AppState.cart);
  const customerId = _getCheckoutUserId();
  const result = await window.YuruiCoupons.validateCoupon(coupons, code, subtotal, customerId);

  if (!result.valid) {
    _showCouponMessage(result.message || '\u6298\u6263\u78bc\u7121\u6cd5\u4f7f\u7528', 'error');
    _updateCheckoutSummary();
    return;
  }
  if (appliedCheckoutCouponCodes.includes(result.code)) {
    _showCouponMessage(`${result.code} \u5df2\u7d93\u5957\u7528`, 'error');
    couponInput.value = '';
    return;
  }
  _completeCouponApply(result, couponInput, showToast);
}

// Complete successful coupon apply flow.
function _completeCouponApply(result, couponInput, showToast) {
  appliedCheckoutCouponCodes.push(result.code);
  _syncCheckoutAppliedCoupons();
  _showCouponMessage(`\u5df2\u6298\u62b5 NT$${result.discount.toLocaleString('zh-TW')}`, 'success');
  couponInput.value = '';
  _updateCheckoutSummary();
  if (showToast && window.showToast) {
    window.showToast(`\u6298\u6263\u78bc\u5df2\u5957\u7528\uff0c\u6298\u62b5 NT$${result.discount.toLocaleString('zh-TW')}`, 'success');
  }
}

// Render applied coupon summary without inline styles.
function _renderAppliedCoupons(items) {
  const container = document.getElementById('checkoutAppliedCouponTexts');
  if (!container) return;
  container.hidden = !items || items.length === 0;
  container.innerHTML = (items || []).map(item => (
    `<div class="couponAppliedItem">${item.code}: -NT$ ${Number(item.discount || 0).toLocaleString('zh-TW')}</div>`
  )).join('');
}

// Render coupon message state.
function _showCouponMessage(message, type) {
  const messageEl = document.getElementById('checkoutCouponMsg');
  if (!messageEl) return;
  messageEl.textContent = message;
  messageEl.hidden = false;
  messageEl.classList.toggle('isSuccess', type === 'success');
  messageEl.classList.toggle('isError', type === 'error');
}

// Initialize confirm order button.
function _initConfirmOrderBtn() {
  const confirmBtn = document.getElementById('confirmOrderBtn');
  if (!confirmBtn) return;
  confirmBtn.addEventListener('click', () => _handleConfirmOrder(confirmBtn));
}

// Validate form, submit order, and route to success page.
async function _handleConfirmOrder(confirmBtn) {
  if (!_getCheckoutCurrentUser()) {
    window.showToast('請先登入後再完成結帳', 'info');
    window.openModal?.('loginModal');
    return;
  }

  const formData = _readCheckoutFormData();
  if (!_validateCheckoutForm(formData)) return;

  let pricingSnapshot;
  try {
    pricingSnapshot = await _verifyCheckoutPricingBeforeSubmit();
    if (!pricingSnapshot) return;
  } catch (error) {
    window.showToast(error.message || '購物車資料異常，請重新確認後再結帳', 'warning');
    return;
  }

  _setConfirmButtonLoading(confirmBtn, true);

  try {
    const orderData = await _buildOrderData(formData, pricingSnapshot);
    const newOrder = await window.API.orders.create(orderData);
    if (appliedCheckoutCouponCodes.includes('YRUIFIRST')) {
      await window.API.customers.markFirstPurchaseUsed(_getCheckoutUserId());
    }
    localStorage.setItem(CHECKOUT_LAST_ORDER_STORAGE_KEY, JSON.stringify(newOrder));
    _completeOrder(newOrder);
  } catch (error) {
    console.error('Checkout order failed', error);
    window.showToast('\u8a02\u55ae\u5efa\u7acb\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66', 'error');
    _setConfirmButtonLoading(confirmBtn, false);
  }
}

// Read checkout form field values.
function _readCheckoutFormData() {
  const shippingAddress = _getCheckoutShippingAddress();
  return {
    buyerName: document.getElementById('buyerName')?.value.trim() || '',
    buyerPhone: document.getElementById('buyerPhone')?.value.trim() || '',
    buyerEmail: document.getElementById('buyerEmail')?.value.trim() || '',
    shippingAddress,
    deliveryAddress: window.formatShippingAddressLine
      ? window.formatShippingAddressLine(shippingAddress)
      : '',
    userNote: document.getElementById('buyerNote')?.value.trim() || '',
  };
}

// Validate checkout form and focus the first invalid field.
function _validateCheckoutForm(data) {
  const rules = [
    { valid: data.buyerName, field: 'buyerName', message: '請輸入姓名' },
    { valid: data.buyerPhone, field: 'buyerPhone', message: '請輸入手機' },
    {
      valid: window.isValidMobile ? window.isValidMobile(data.buyerPhone) : window.isValidPhone(data.buyerPhone),
      field: 'buyerPhone',
      message: '手機須為 09 開頭的 10 碼數字（例：0988744144）',
    },
    { valid: data.buyerEmail, field: 'buyerEmail', message: '請輸入 Email' },
    { valid: window.isValidEmail(data.buyerEmail), field: 'buyerEmail', message: 'Email 格式不正確' },
  ];

  if (selectedShippingMethod === 'delivery') {
    const addrResult = window.YuruiShippingAddress?.validate(data.shippingAddress);
    if (!addrResult?.ok) {
      window.showToast(addrResult?.errors?.[0] || '請設定送達地址', 'warning');
      document.getElementById('checkoutShippingAddressEditBtn')?.focus();
      return false;
    }
  }

  const failed = rules.find(rule => !rule.valid);
  if (!failed) return true;
  window.showToast(failed.message, 'warning');
  _openCheckoutPanelByField(failed.field);
  window.setTimeout(() => document.getElementById(failed.field)?.focus(), 50);
  return false;
}

// 送出前重新用正式商品資料計價，避免 localStorage 被手動改價後直接建單。
async function _verifyCheckoutPricingBeforeSubmit() {
  const verifiedCart = await _buildVerifiedCheckoutCart();
  const changed = _hasCheckoutCartChanged(window.AppState.cart, verifiedCart);

  if (changed) {
    window.AppState.cart = verifiedCart;
    window.saveAppState();
    window.updateCartBadge?.();
    _renderCheckoutItems();
    _updateCheckoutSummary();
    window.showToast('商品價格或資料已更新，請確認金額後再送出', 'warning');
    return null;
  }

  const pricingSnapshot = _buildCheckoutPricingSnapshot(verifiedCart);
  if (pricingSnapshot.couponChanged) {
    _renderDiscountRow();
    _setText('checkoutTotal', window.formatCurrency(pricingSnapshot.total));
    window.showToast('折扣碼狀態已更新，請確認金額後再送出', 'warning');
    return null;
  }
  return pricingSnapshot;
}

// 從 products.json / API 重建購物車項目，只信任 productId 與 quantity。
async function _buildVerifiedCheckoutCart() {
  const products = await window.API.products.getAll();
  const productMap = new Map(products.map(product => [product.id, product]));

  return (window.AppState.cart || []).map(item => {
    const productId = item.productId || item.id;
    const product = productMap.get(productId);
    if (!product) throw new Error('部分商品已無法購買，請返回購物車確認');

    const quantity = Math.floor(Number(item.quantity || 0));
    if (quantity < 1) throw new Error('購物車商品數量異常，請重新確認');
    if (Number(product.stock) > 0 && quantity > Number(product.stock)) {
      throw new Error(`${product.name} 庫存不足，最多可購買 ${product.stock} 件`);
    }

    return {
      id: product.id,
      productId: product.id,
      name: product.name,
      brand: product.brand,
      price: Number(product.price || 0),
      image: product.image,
      quantity,
      stock: Number(product.stock || 0),
    };
  });
}

// 比對目前購物車與正式商品資料重建後的購物車，判斷是否需要讓使用者重新確認。
function _hasCheckoutCartChanged(currentCart, verifiedCart) {
  const current = currentCart || [];
  if (current.length !== verifiedCart.length) return true;
  return verifiedCart.some((verified, index) => {
    const currentItem = current[index] || {};
    return (
      (currentItem.productId || currentItem.id) !== verified.productId ||
      Number(currentItem.quantity || 0) !== verified.quantity ||
      Number(currentItem.price || 0) !== verified.price ||
      currentItem.name !== verified.name ||
      currentItem.brand !== verified.brand ||
      currentItem.image !== verified.image
    );
  });
}

// 產生訂單使用的正式金額快照，所有訂單欄位都從這份資料建立。
function _buildCheckoutPricingSnapshot(cart) {
  const subtotal = window.calculateCartTotal(cart);
  const shipping = window.calculateShippingFee(subtotal, selectedShippingMethod);
  // 送出前 coupon 也要重新驗證，避免 localStorage 暫存的折扣碼失效後仍被帶入訂單。
  const couponSyncResult = checkoutCouponCatalog.length > 0 ? _syncCheckoutAppliedCoupons() : { removed: false };
  const discount = checkoutDiscount;
  const total = Math.max(subtotal - discount + shipping, 0);
  return { cart, subtotal, shipping, discount, total, couponChanged: couponSyncResult.removed };
}

// Toggle confirm button loading state.
function _setConfirmButtonLoading(button, isLoading) {
  button.disabled = isLoading;
  button.classList.toggle('isLoading', isLoading);
  button.textContent = isLoading ? '訂單建立中...' : '確認結帳';
}

// Build order payload from current checkout state.
async function _buildOrderData(formData) {
  const cart = window.AppState.cart;
  const subtotal = _readCheckoutMoney('checkoutSubtotal', window.calculateCartTotal(cart));
  const shipping = _readCheckoutMoney('checkoutShipping', window.calculateShippingFee(subtotal, selectedShippingMethod));
  const discount = _readCheckoutMoney('checkoutDiscount', checkoutDiscount);
  const total = _readCheckoutMoney('checkoutTotal', Math.max(subtotal - discount + shipping, 0));

  return {
    customerId: _getCheckoutUserId(),
    buyerName: formData.buyerName,
    buyerPhone: formData.buyerPhone,
    buyerEmail: formData.buyerEmail,
    userNote: formData.userNote,
    buyerNote: formData.userNote,
    shippingMethod: selectedShippingMethod,
    address: selectedShippingMethod === 'delivery' ? formData.deliveryAddress : STORE_PICKUP_ADDRESS,
    payment: _getSelectedPaymentCode(),
    paymentStatus: _getCheckoutPaymentStatus(),
    paymentLabel: _getSelectedPaymentCode() === 'cod' ? '貨到付款' : '',
    items: _buildOrderItems(cart),
    subtotal,
    points: _calculateCheckoutPointsFromSummary(),
    shippingFee: shipping,
    coupons: _buildCheckoutCouponSnapshots(subtotal),
    discount,
    total,
    status: 'unshipped',
    createdAt: _getCheckoutDateTimeString(),
    reviewed: false,
  };
}

// Build order item snapshots from cart items.
function _buildOrderItems(cart) {
  return cart.map(item => ({
    productId: item.id || item.productId,
    variantId: item.variantId,
    sku: item.sku || item.variantId,
    name: item.name,
    color: item.color || '',
    size: item.size || '',
    specLabel: item.specLabel || '',
    brand: item.brand,
    price: item.price,
    quantity: item.quantity,
    image: item.image,
    subtotal: item.price * item.quantity,
  }));
}

// Clear cart and route to checkout success page.
function _completeOrder(order) {
  window.clearCart();
  appliedCheckoutCouponCodes = [];
  window.YuruiCoupons.clearAppliedCouponCode();
  const orderNum = window.formatOrderDisplayId(order.id);
  window.location.href = `checkout-success.html?orderNum=${encodeURIComponent(orderNum)}`;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.initCheckoutPage);
} else {
  window.initCheckoutPage();
}
