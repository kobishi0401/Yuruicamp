// Checkout page state and behavior.
let checkoutDiscount = 0;
let checkoutCouponCatalogPromise = null;
let checkoutCouponCatalog = [];
let checkoutCouponClaimsPromise = null;
let checkoutCouponClaims = [];
let selectedCheckoutCouponClaim = null;
let appliedCheckoutCouponCodes = [];
let selectedShippingMethod = 'delivery';
let checkoutCountdownTimer = null;
let checkoutBranches = [];
let checkoutSessionQueue = Promise.resolve();
let checkoutSessionRevision = 0;
let checkoutSessionNeedsAuthRetry = false;

const CHECKOUT_LAST_SESSION_STORAGE_KEY = 'lastCheckoutSession';
const CHECKOUT_IDEMPOTENCY_KEY = 'checkoutIdempotencyKey';
const CHECKOUT_CART_FINGERPRINT_KEY = 'checkoutCartFingerprint';
const CHECKOUT_COMPLETED_ORDER_ID_KEY = 'checkoutCompletedOrderId';
const CHECKOUT_FORM_DRAFT_STORAGE_KEY = 'checkoutFormDraft';

// Load shared shipping address modal partial.
async function _loadShippingAddressModal() {
  const mount = document.getElementById('shippingAddressModalMount');
  if (!mount || mount.dataset.loaded === 'true') return;
  try {
    const response = await fetch('/components/shipping-address-modal.partial', { cache: 'no-store' });
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

  window.YuruiShippingAddressUI.init({
    displayEl: document.getElementById('checkoutShippingAddressDisplay'),
    editBtn: document.getElementById('checkoutShippingAddressEditBtn'),
    initialAddress: initial,
    persist: Boolean(window.AppState?.isLoggedIn && user?.id),
    getAddress: () => window.YuruiShippingAddressUI.getAddress(),
    onSave: (addr) => {
      if (window.AppState?.currentUser) {
        window.AppState.currentUser.shippingAddress = addr;
      }
      _saveCheckoutFormDraft();
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
    window.setTimeout(() => {
      window.location.href = 'products.html';
    }, 1500);
    return;
  }

  _syncCheckoutIdempotencyWithCart(window.AppState.cart);
  _initCheckoutIdempotencyListener();
  await _loadShippingAddressModal();
  _initCheckoutShippingAddress();
  await _loadCheckoutBranches();

  _renderCheckoutItems();
  _updateCheckoutSummary();
  _restoreCheckoutFormDraft();
  await _prefillCheckoutContactFields();
  await _initCheckoutSessionOnEntry();
  _initAccordionPanels();
  _initShippingMethodChange();
  _initPaymentMethodChange();
  _initCheckoutInputValidation();
  _initCheckoutFormDraftPersistence();
  _initFillProfileBtn();
  _initConfirmOrderBtn();
  _initCheckoutSessionActions();
  _initCheckoutCvsMap();
  _initCheckoutCoupon();
  await _handleCvsMapReturnFromEcpay();
  _initSharedComponents();
};

// Initialize shared header, modal, cart, and personalization components.
function _initSharedComponents() {
  window.initNavbar?.();
  window.initModalListeners?.();
  window.initCartListeners?.();
  window.initPersonalizationModal?.();
  window._appComponentsInitialized = true;
}

// Map selected payment radio to order payment code.
function _getSelectedPaymentCode() {
  const selectedPayment = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'credit';
  // UI radio → schema payment_method（線上付統一 ecpay-credit；移除 line-pay）
  return { credit: 'ecpay-credit', linepay: 'ecpay-credit', cod: 'cod' }[selectedPayment] || selectedPayment;
}

// 判斷目前是否直接連接 Spring Boot。
function _isBackendCheckoutMode() {
  return window.AppConfig?.USE_MOCK_API === false;
}

/**
 * 取得目前登入會員（優先 YuruiAuth，其次 AppState）。
 * Resolve logged-in member; never invent a demo id like U001.
 * @returns {object|null}
 */
function _resolveCheckoutUser() {
  if (window.YuruiAuth && typeof window.YuruiAuth.getUser === 'function') {
    const authUser = window.YuruiAuth.getUser();
    if (authUser && authUser.id) return authUser;
  }
  const currentUser = window.AppState?.currentUser;
  if (currentUser && currentUser.id) return currentUser;
  return null;
}

/**
 * 真實 customerId；未登入回傳 null（不再 fallback U001）
 * @returns {string|null}
 */
function _getCheckoutUserId() {
  const user = _resolveCheckoutUser();
  return user && user.id ? String(user.id) : null;
}

// Load shared coupon catalog for checkout.
async function _loadCheckoutCouponCatalog() {
  if (!checkoutCouponCatalogPromise) {
    checkoutCouponCatalogPromise = window.YuruiCoupons.loadCoupons()
      .then((coupons) => {
        checkoutCouponCatalog = coupons;
        // Mock 模式沿用完整券目錄；正式模式要等會員 claims 一起載入後再過濾。
        if (!_isBackendCheckoutMode()) {
          window.YuruiCoupons.renderCouponOptions('checkoutCouponCodeOptions', coupons);
        }
        return coupons;
      })
      .catch((error) => {
        console.error('Failed to load checkout coupon catalog', error);
        return [];
      });
  }
  return checkoutCouponCatalogPromise;
}

// Recalculate applied coupons and sync localStorage.
function _syncCheckoutAppliedCoupons() {
  if (_isBackendCheckoutMode()) {
    _renderBackendSelectedCoupon();
    return;
  }

  const subtotal = window.calculateCartTotal(window.AppState.cart);
  const applied = window.YuruiCoupons.calculateAppliedCoupons(
    checkoutCouponCatalog,
    appliedCheckoutCouponCodes,
    subtotal
  );
  checkoutDiscount = applied.totalDiscount;
  appliedCheckoutCouponCodes = applied.items.map((item) => item.code);
  _renderAppliedCoupons(applied.items);

  if (appliedCheckoutCouponCodes.length > 0)
    window.YuruiCoupons.saveAppliedCouponCodes(appliedCheckoutCouponCodes);
  else window.YuruiCoupons.clearAppliedCouponCode();
}

// Render checkout item rows.
function _renderCheckoutItems() {
  const listEl = document.getElementById('checkoutItemsList');
  if (!listEl) return;
  listEl.innerHTML = window.AppState.cart.map((item) => _buildCheckoutItem(item)).join('');
}

// Build one checkout summary item.
function _buildCheckoutItem(item) {
  const specHtml = window.renderSpecLabelHtml
    ? window.renderSpecLabelHtml(item.specLabel, 'checkoutSummaryItemSpec')
    : '';
  const imageSrc = item.image || 'https://picsum.photos/seed/default/60/60';
  return `
    <article class="checkoutSummaryItem">
      <div class="checkoutSummaryItemImageWrap">
        <img src="${imageSrc}" alt="${item.name}" class="checkoutSummaryItemImage">
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
  const completedOrderId = sessionStorage.getItem(CHECKOUT_COMPLETED_ORDER_ID_KEY);
  const completedSession = completedOrderId ? _readCompletedCheckoutSession(completedOrderId) : null;
  if (completedSession?.pricing) {
    _applyCheckoutSessionPricing(completedSession.pricing);
    return;
  }

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
  document.querySelectorAll('[data-panel-trigger]').forEach((trigger) => {
    trigger.addEventListener('click', () =>
      _setPanelOpen(trigger, trigger.getAttribute('aria-expanded') !== 'true')
    );
    trigger.addEventListener('keydown', (event) => _handlePanelKeydown(event, trigger));
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

// Support Enter and Space on accordion triggers.
function _handlePanelKeydown(event, trigger) {
  if (!['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  _setPanelOpen(trigger, trigger.getAttribute('aria-expanded') !== 'true');
}

// Initialize shipping method radios.
function _initShippingMethodChange() {
  const radios = document.querySelectorAll('input[name="shippingMethod"]');
  radios.forEach((radio) => {
    radio.addEventListener('change', () => {
      selectedShippingMethod = radio.value;
      _updateCheckoutSummary();
      _syncRadioGroupState('shippingMethod');
      _syncDeliveryAddressState();
      _saveCheckoutFormDraft();
    });
  });
  _syncRadioGroupState('shippingMethod');
  _syncDeliveryAddressState();
}

// Initialize payment method radios.
function _initPaymentMethodChange() {
  const radios = document.querySelectorAll('input[name="paymentMethod"]');
  radios.forEach((radio) => {
    radio.addEventListener('change', () => {
      _syncRadioGroupState('paymentMethod');
      _syncPaymentNoticeState();
      _syncConfirmButtonLabel(_getStoredCheckoutSession());
      _saveCheckoutFormDraft();
    });
  });
  _syncRadioGroupState('paymentMethod');
  _syncPaymentNoticeState();
}

// Update selected state for radio option labels.
function _syncRadioGroupState(name) {
  document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.closest('.checkoutChoice')?.classList.toggle('isSelected', input.checked);
  });
}

// Toggle delivery address field by shipping method.
function _syncDeliveryAddressState() {
  const section = document.getElementById('deliveryAddressSection');
  if (section) section.hidden = selectedShippingMethod !== 'delivery';
  const pickupSection = document.getElementById('pickupBranchSection');
  if (pickupSection) pickupSection.hidden = selectedShippingMethod !== 'pickup';
  const cvsSection = document.getElementById('cvsStoreSection');
  if (cvsSection) cvsSection.hidden = selectedShippingMethod !== 'cvs';
}

// 從共用 API facade 載入可選門市，不在頁面直接發送後端請求。
async function _loadCheckoutBranches() {
  const select = document.getElementById('checkoutPickupBranch');
  const pickupRadio = document.getElementById('shippingStore');
  const hint = document.getElementById('checkoutPickupBranchHint');
  if (!select) return;
  try {
    checkoutBranches = await window.API.branches.getAll();
    select.replaceChildren(new Option('選擇取貨門市', ''));
    checkoutBranches.forEach((branch) =>
      select.add(new Option(`${branch.name}｜${branch.address}`, branch.id))
    );
    select.disabled = checkoutBranches.length === 0;
    if (pickupRadio) pickupRadio.disabled = checkoutBranches.length === 0;
    if (hint && checkoutBranches.length === 0) hint.textContent = '目前沒有可選門市，門市取貨暫停使用。';
  } catch {
    checkoutBranches = [];
    select.replaceChildren(new Option('門市載入失敗', ''));
    select.disabled = true;
    if (pickupRadio) pickupRadio.disabled = true;
    if (hint) hint.textContent = '門市資料載入失敗，改用宅配後再結帳。';
  }
}

// 依付款方式顯示 ECPay 或貨到付款說明，不在本站收集卡片資料。
function _syncPaymentNoticeState() {
  const ecpayNotice = document.getElementById('ecpayPaymentNotice');
  const codNotice = document.getElementById('codPaymentNotice');
  const selected = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'credit';
  if (ecpayNotice) ecpayNotice.hidden = selected !== 'credit';
  if (codNotice) codNotice.hidden = selected !== 'cod';
}

// 進 checkout 頁自動帶入姓名／Email／電話（N3）；保留手動「帶入會員資料」
async function _prefillCheckoutContactFields() {
  const user = _resolveCheckoutUser();
  if (!user) return;
  // 草稿或使用者已輸入時不覆寫 / Skip when draft or manual input exists
  if (document.getElementById('buyerName')?.value.trim()) return;

  let shippingAddr = null;
  try {
    shippingAddr = await window.API?.shippingAddresses?.getDefault?.();
  } catch (error) {
    console.warn('[checkout] 無法讀取預設配送地址', error);
  }

  const profile = _readLocalProfile();
  const resolvedName =
    (shippingAddr &&
      `${shippingAddr.lastName || ''}${shippingAddr.firstName || ''}`.trim()) ||
    user.name ||
    profile.name ||
    '';
  const resolvedPhone = shippingAddr?.phone || user.phone || profile.phone || '';
  const resolvedEmail = shippingAddr?.email || user.email || profile.email || '';

  if (resolvedName) _setCheckoutDraftFieldValue('buyerName', resolvedName);
  if (resolvedPhone) _setCheckoutDraftFieldValue('buyerPhone', resolvedPhone);
  if (resolvedEmail) _setCheckoutDraftFieldValue('buyerEmail', resolvedEmail);

  if (window.YuruiShippingAddressUI && shippingAddr) {
    window.YuruiShippingAddressUI.setAddress(shippingAddr);
  }
}

// 結帳頁進入後（登入後）建立 Draft Checkout Session 並開始 15 分鐘保留
async function _initCheckoutSessionOnEntry() {
  const confirmBtn = document.getElementById('confirmOrderBtn');
  _setCheckoutSessionPanel({
    state: 'isDraft',
    icon: 'bi-hourglass-split',
    badge: 'Locking stock',
    title: '正在保留商品庫存',
    message: '請稍候，我們正在建立 Checkout Session。',
  });

  const revision = ++checkoutSessionRevision;
  checkoutSessionQueue = checkoutSessionQueue
    .catch(() => {})
    .then(async () => {
      await _waitForCheckoutAuthReady();
      if (!_getCheckoutUserId()) {
        throw Object.assign(new Error('請先登入'), { code: 'UNAUTHORIZED' });
      }

      const storedSession = _getStoredCheckoutSession();
      const fingerprint = _buildCheckoutCartFingerprint(window.AppState.cart);
      const storedFingerprint = sessionStorage.getItem(CHECKOUT_CART_FINGERPRINT_KEY);
      const canReuse =
        storedSession?.orderId &&
        storedFingerprint === fingerprint &&
        ['draft', 'ready_to_pay'].includes(storedSession.checkoutStep) &&
        storedSession.status !== 'cancelled' &&
        !_isCheckoutSessionExpired(storedSession);

      if (canReuse) {
        return { checkoutSession: storedSession, fingerprint, reused: true };
      }

      if (storedSession?.orderId) {
        await _cancelCheckoutSession(storedSession);
      }
      _clearCheckoutIdempotencyState();
      sessionStorage.setItem(CHECKOUT_CART_FINGERPRINT_KEY, fingerprint);

      const request = {
        items: _buildCheckoutRequestItems(window.AppState.cart),
        idempotencyKey: _getCheckoutIdempotencyKey(window.AppState.cart),
      };
      const checkoutSession = await window.API.checkout.createSession(request);
      return { checkoutSession, fingerprint, reused: false };
    })
    .then((result) => {
      if (revision !== checkoutSessionRevision) return;

      _saveCheckoutSession(result.checkoutSession, result.fingerprint);
      checkoutSessionNeedsAuthRetry = false;
      _renderCheckoutSessionState(result.checkoutSession, confirmBtn);
    })
    .catch((error) => {
      if (revision !== checkoutSessionRevision) return;
      checkoutSessionNeedsAuthRetry = _isCheckoutAuthError(error);
      _handleCheckoutError(error, confirmBtn);
    });

  return checkoutSessionQueue;
}

async function _waitForCheckoutAuthReady() {
  if (window.AppAuth?.whenReady) await window.AppAuth.whenReady();
  if (window.YuruiFirebase?.waitForAuthState) await window.YuruiFirebase.waitForAuthState();
  if (window.YuruiFirebase?.isReady?.() && window.AppAuth?.configure) {
    try {
      window.AppAuth.configure({ auth: window.YuruiFirebase.getAuth() });
    } catch (error) {
      console.warn('[checkout] AppAuth.configure 略過:', error);
    }
  }
}

function _isCheckoutAuthError(error) {
  const code = String(error?.code || '').toUpperCase();
  return code === 'UNAUTHORIZED' || code === 'AUTH_TOKEN_UNAVAILABLE';
}

function _isCheckoutSessionExpired(checkoutSession) {
  const expiresAt = checkoutSession?.checkoutExpiresAt;
  return Boolean(expiresAt && Date.parse(expiresAt) <= Date.now());
}

async function _cancelCheckoutSession(checkoutSession) {
  if (!checkoutSession?.orderId || !window.API?.checkout?.cancelSession) return;
  try {
    await window.API.checkout.cancelSession(checkoutSession.orderId);
  } catch (error) {
    console.warn('[checkout] 無法釋放舊 Checkout Session：', error);
  }
}

function _getCheckoutIdempotencyKey(cart) {
  const fingerprint = _buildCheckoutCartFingerprint(cart);
  const previousFingerprint = sessionStorage.getItem(CHECKOUT_CART_FINGERPRINT_KEY);
  let key = sessionStorage.getItem(CHECKOUT_IDEMPOTENCY_KEY);

  if (!key || previousFingerprint !== fingerprint) {
    if (!window.crypto?.randomUUID) throw new Error('瀏覽器無法建立安全的 Checkout 識別碼。');
    key = window.crypto.randomUUID();
    sessionStorage.setItem(CHECKOUT_IDEMPOTENCY_KEY, key);
    sessionStorage.setItem(CHECKOUT_CART_FINGERPRINT_KEY, fingerprint);
  }

  return key;
}

function _getConfirmButtonLabel(checkoutSession) {
  const paymentMethod =
    checkoutSession?.paymentMethod || _getSelectedPaymentCode();
  return paymentMethod === 'cod' ? '確認結帳' : '結帳並前往付款';
}

function _syncConfirmButtonLabel(checkoutSession) {
  const confirmBtn = document.getElementById('confirmOrderBtn');
  if (!confirmBtn || confirmBtn.disabled || confirmBtn.classList.contains('isLoading')) return;
  confirmBtn.textContent = _getConfirmButtonLabel(checkoutSession);
}

/** 綁定「帶入會員資料」按鈕 / Bind fill-profile button */
function _initFillProfileBtn() {
  const button = document.getElementById('fillProfileBtn');
  if (!button) return;
  button.addEventListener('click', () => {
    if (!window.AppState.isLoggedIn || !window.AppState.currentUser) {
      window.showToast('請先登入後再帶入會員資料', 'info');
      window.openModal('loginModal');
      return;
    }
    _fillBuyerFields(window.AppState.currentUser);
    _saveCheckoutFormDraft();
    window.showToast('已帶入會員資料', 'success');
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

  applyBtn.addEventListener('click', () => _applyCheckoutCouponCode());
  couponInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    applyBtn.click();
  });
  document.getElementById('checkoutAppliedCouponTexts')?.addEventListener('click', (event) => {
    if (!event.target.closest('[data-remove-checkout-coupon]')) return;
    _removeBackendCheckoutCoupon();
  });

  if (_isBackendCheckoutMode()) {
    couponInput.placeholder = '輸入或選擇一組折扣碼';
    _initBackendCheckoutCoupon();
    return;
  }

  _loadCheckoutCouponCatalog().then(() => {
    const carriedCodes = window.YuruiCoupons.getAppliedCouponCodes();
    if (carriedCodes.length === 0) return;
    appliedCheckoutCouponCodes = carriedCodes;
    _syncCheckoutAppliedCoupons();
    _updateCheckoutSummary();
  });
}

// Validate and apply one coupon code.
async function _applyCheckoutCouponCode({ showToast = true } = {}) {
  const couponInput = document.getElementById('checkoutCouponInput');
  if (!couponInput) return;

  if (_isBackendCheckoutMode()) {
    await _applyBackendCheckoutCouponCode(couponInput, showToast);
    return;
  }

  const customerId = _getCheckoutUserId();
  if (!customerId) {
    _showCouponMessage('請先登入後再使用優惠券', 'error');
    window.showToast?.('請先登入後再使用優惠券', 'info');
    window.openModal?.('loginModal');
    return;
  }

  const code = couponInput.value.trim().toUpperCase();
  const coupons = await _loadCheckoutCouponCatalog();
  const subtotal = window.calculateCartTotal(window.AppState.cart);
  const result = await window.YuruiCoupons.validateCoupon(coupons, code, subtotal, customerId);

  if (!result.valid) {
    _showCouponMessage('\u6298\u6263\u78bc\u7121\u6cd5\u4f7f\u7528', 'error');
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

// 正式模式預載公開券與會員 claims，讓重新整理後可還原已套用券碼。
async function _initBackendCheckoutCoupon() {
  try {
    const tasks = [_loadCheckoutCouponCatalog()];
    if (_getCheckoutUserId()) tasks.push(_loadCheckoutCouponClaims());
    await Promise.all(tasks);
    _restoreBackendCheckoutCouponSelection();
  } catch (error) {
    _showBackendCouponError(error);
  }
}

// 正式模式讀取會員自己的領券紀錄；需要處理競態時可強制刷新。
async function _loadCheckoutCouponClaims({ refresh = false } = {}) {
  if (refresh) {
    checkoutCouponClaimsPromise = null;
  }
  if (!checkoutCouponClaimsPromise) {
    checkoutCouponClaimsPromise = window.API.coupons
      .getMine()
      .then((claims) => {
        checkoutCouponClaims = Array.isArray(claims) ? claims : [];
        return checkoutCouponClaims;
      })
      .catch((error) => {
        checkoutCouponClaimsPromise = null;
        throw error;
      });
  }

  return checkoutCouponClaimsPromise;
}

// 依券碼尋找會員 claim，正式 Checkout 只允許一張券。
function _findCheckoutCouponClaimByCode(code) {
  return (
    checkoutCouponClaims.find((claim) => String(claim?.coupon?.code || '').toUpperCase() === code) || null
  );
}

// 正式模式只顯示尚未領取或仍為 claimed 的券，並排除本次已套用券碼。
function _getSelectableBackendCheckoutCoupons() {
  const selectedCode = String(selectedCheckoutCouponClaim?.coupon?.code || '').toUpperCase();
  const claimsByCode = new Map(
    checkoutCouponClaims.map((claim) => [
      String(claim?.coupon?.code || '').toUpperCase(),
      String(claim?.status || '').toLowerCase(),
    ])
  );

  return checkoutCouponCatalog.filter((coupon) => {
    const code = String(coupon?.code || '').toUpperCase();
    if (!code || code === selectedCode) return false;

    const claimStatus = claimsByCode.get(code);
    return !claimStatus || claimStatus === 'claimed';
  });
}

// 依最新的公開券、會員 claims 與本次套用狀態重繪輸入提示選項。
function _renderBackendCheckoutCouponOptions() {
  window.YuruiCoupons.renderCouponOptions(
    'checkoutCouponCodeOptions',
    _getSelectableBackendCheckoutCoupons()
  );
}

// 重新整理頁面時以 CheckoutSession.couponClaimId 還原後端套券狀態。
function _restoreBackendCheckoutCouponSelection() {
  const checkoutSession = _getStoredCheckoutSession();
  if (!checkoutSession?.couponClaimId) {
    selectedCheckoutCouponClaim = null;
    _renderBackendSelectedCoupon();
    return;
  }

  selectedCheckoutCouponClaim = checkoutCouponClaims.find(
    (claim) => Number(claim.id) === Number(checkoutSession.couponClaimId)
  ) || {
    id: checkoutSession.couponClaimId,
    status: 'claimed',
    coupon: { code: `優惠券 #${checkoutSession.couponClaimId}` },
  };
  _renderBackendSelectedCoupon();
}

// 正式模式將折扣碼轉成 couponClaimId，再 PATCH 既有 Checkout Session。
async function _applyBackendCheckoutCouponCode(couponInput, showToast) {
  const code = couponInput.value.trim().toUpperCase();
  const checkoutSession = _getStoredCheckoutSession();

  if (!_getCheckoutUserId()) {
    _showCouponMessage('請先登入後再使用優惠券', 'error');
    window.openModal?.('loginModal');
    return;
  }
  if (!code) {
    _showCouponMessage('請輸入折扣碼', 'error');
    couponInput.focus();
    return;
  }
  if (!_isEditableCheckoutSession(checkoutSession)) {
    _showCouponMessage('請先返回確認背包，建立可編輯的 Checkout 後再套用優惠券', 'error');
    return;
  }

  _setCheckoutCouponBusy(true);
  try {
    await Promise.all([_loadCheckoutCouponCatalog(), _loadCheckoutCouponClaims()]);
    let claim = _findCheckoutCouponClaimByCode(code);

    if (claim && claim.status !== 'claimed') {
      _showCouponMessage('此優惠券已使用或目前無法使用', 'error');
      return;
    }
    if (!claim) {
      const coupon = window.YuruiCoupons.findCouponByCode(checkoutCouponCatalog, code);
      if (!coupon) {
        _showCouponMessage('折扣碼無效，請確認後再試', 'error');
        return;
      }
      claim = await _claimCheckoutCoupon(coupon.id, code);
    }

    const updatedSession = await window.API.checkout.updateSession(checkoutSession.orderId, {
      couponClaimId: claim.id,
    });
    selectedCheckoutCouponClaim = claim;
    _saveCheckoutSession(updatedSession);
    _renderCheckoutSessionState(updatedSession, document.getElementById('confirmOrderBtn'));
    _renderBackendSelectedCoupon();
    couponInput.value = '';

    const discount = Number(updatedSession.pricing?.discount || 0);
    _showCouponMessage(`折扣碼「${code}」已套用，折抵 ${window.formatCurrency(discount)}`, 'success');
    if (showToast) {
      window.showToast?.(`優惠券已套用，折抵 ${window.formatCurrency(discount)}`, 'success');
    }
  } catch (error) {
    _showBackendCouponError(error);
  } finally {
    _setCheckoutCouponBusy(false);
  }
}

// 領券發生重複請求時刷新會員 claims，使用後端既有紀錄繼續套用。
async function _claimCheckoutCoupon(couponId, code) {
  try {
    const claim = await window.API.coupons.claim(couponId);
    checkoutCouponClaims = [claim, ...checkoutCouponClaims];
    return claim;
  } catch (error) {
    if (error?.code !== 'COUPON_ALREADY_CLAIMED') throw error;

    await _loadCheckoutCouponClaims({ refresh: true });
    const existingClaim = _findCheckoutCouponClaimByCode(code);
    if (!existingClaim || existingClaim.status !== 'claimed') throw error;

    return existingClaim;
  }
}

// 已建立 Session 時送空 PATCH 清除套券；claim 仍保留在會員帳戶。
async function _removeBackendCheckoutCoupon() {
  if (!_isBackendCheckoutMode()) return;
  const checkoutSession = _getStoredCheckoutSession();
  if (!_isEditableCheckoutSession(checkoutSession)) {
    _showCouponMessage('目前的 Checkout 無法移除優惠券', 'error');
    return;
  }

  _setCheckoutCouponBusy(true);
  try {
    const updatedSession = await window.API.checkout.updateSession(checkoutSession.orderId, {});
    selectedCheckoutCouponClaim = null;
    _saveCheckoutSession(updatedSession);
    _renderCheckoutSessionState(updatedSession, document.getElementById('confirmOrderBtn'));
    _renderBackendSelectedCoupon();
    _showCouponMessage('已移除本次訂單的優惠券，領券紀錄仍保留在會員帳戶', 'info');
  } catch (error) {
    _showBackendCouponError(error);
  } finally {
    _setCheckoutCouponBusy(false);
  }
}

// 只有未付款且仍在 Checkout 流程中的 Session 可以切換優惠券。
function _isEditableCheckoutSession(checkoutSession) {
  return Boolean(
    checkoutSession?.orderId &&
    ['draft', 'ready_to_pay'].includes(checkoutSession.checkoutStep) &&
    checkoutSession.status !== 'cancelled'
  );
}

// 呈現正式模式的單張優惠券與移除操作。
function _renderBackendSelectedCoupon() {
  if (!_isBackendCheckoutMode()) return;
  _renderBackendCheckoutCouponOptions();

  const container = document.getElementById('checkoutAppliedCouponTexts');
  if (!container) return;

  if (!selectedCheckoutCouponClaim) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }

  const code = _escapeCheckoutText(selectedCheckoutCouponClaim.coupon?.code || '已套用優惠券');
  container.hidden = false;
  container.innerHTML = `
    <div class="couponAppliedItem">
      <span><i class="bi bi-ticket-perforated" aria-hidden="true"></i> 已套用：${code}</span>
      <button
        type="button"
        class="couponRemoveBtn"
        data-remove-checkout-coupon
        aria-label="移除優惠券 ${code}"
      >移除</button>
    </div>
  `;
}

// 優惠券操作期間鎖定控制，避免重複領券或重複 PATCH。
function _setCheckoutCouponBusy(isBusy) {
  const panel = document.getElementById('checkoutCouponPanel');
  const input = document.getElementById('checkoutCouponInput');
  const button = document.getElementById('checkoutApplyCouponBtn');
  panel?.setAttribute('aria-busy', String(isBusy));
  if (input) input.disabled = isBusy;
  if (button) {
    button.disabled = isBusy;
    button.textContent = isBusy ? '套用中…' : '套用';
  }
}

// 將後端優惠券錯誤轉成買家可理解的訊息。
function _showBackendCouponError(error) {
  const messages = {
    COUPON_SOLD_OUT: '此優惠券已領完',
    COUPON_NOT_ELIGIBLE: '目前不符合此優惠券的使用資格',
    COUPON_NOT_APPLICABLE: '此優惠券不適用於目前訂單',
    COUPON_ALREADY_USED: '此優惠券已套用於其他訂單',
    CHECKOUT_EXPIRED: 'Checkout 已逾時，請返回確認背包重新建立',
    UNAUTHORIZED: '請重新登入後使用優惠券',
  };
  const message = messages[error?.code] || '優惠券套用失敗，請稍後再試';
  _showCouponMessage(message, 'error');

  if (error?.code === 'UNAUTHORIZED') {
    window.openModal?.('loginModal');
  }
  if (error?.code === 'CHECKOUT_EXPIRED') {
    _handleCheckoutExpired();
  }
}

// 優惠券代碼進入 HTML 前先跳脫，避免把後端文字當成標籤執行。
function _escapeCheckoutText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Complete successful coupon apply flow.
function _completeCouponApply(result, couponInput, showToast) {
  appliedCheckoutCouponCodes.push(result.code);
  _syncCheckoutAppliedCoupons();
  _showCouponMessage(`\u5df2\u6298\u62b5 NT$${result.discount.toLocaleString('zh-TW')}`, 'success');
  couponInput.value = '';
  _updateCheckoutSummary();
  if (showToast && window.showToast) {
    window.showToast(
      `\u6298\u6263\u78bc\u5df2\u5957\u7528\uff0c\u6298\u62b5 NT$${result.discount.toLocaleString('zh-TW')}`,
      'success'
    );
  }
}

// Render applied coupon summary without inline styles.
function _renderAppliedCoupons(items) {
  const container = document.getElementById('checkoutAppliedCouponTexts');
  if (!container) return;
  container.hidden = !items || items.length === 0;
  container.innerHTML = (items || [])
    .map(
      (item) =>
        `<div class="couponAppliedItem">${item.code}: -NT$ ${Number(item.discount || 0).toLocaleString('zh-TW')}</div>`
    )
    .join('');
}

// Render coupon message state.
function _showCouponMessage(message, type) {
  const messageEl = document.getElementById('checkoutCouponMsg');
  if (!messageEl) return;
  messageEl.textContent = message;
  messageEl.hidden = false;
  messageEl.classList.toggle('isSuccess', type === 'success');
  messageEl.classList.toggle('isError', type === 'error');
  messageEl.classList.toggle('isInfo', type === 'info');
  if (type === 'error') messageEl.focus?.();
}

// Initialize confirm order button.
function _initConfirmOrderBtn() {
  const confirmBtn = document.getElementById('confirmOrderBtn');
  if (!confirmBtn) return;
  confirmBtn.addEventListener('click', () => _handleConfirmOrder(confirmBtn));
}

// 驗證表單後只更新確認背包頁已建立的 Session，不在此頁重新建單。
async function _handleConfirmOrder(confirmBtn) {
  // 後端 Checkout 依 Bearer 辨識會員；未登入不要送出
  if (!_getCheckoutUserId()) {
    window.showToast?.('請先登入後再結帳', 'info');
    window.openModal?.('loginModal');
    return;
  }

  const formData = _readCheckoutFormData();
  if (!_validateCheckoutForm(formData)) return;
  _setConfirmButtonLoading(confirmBtn, true);

  try {
    const currentSession = _getStoredCheckoutSession();
    if (currentSession?.checkoutStep === 'ready_to_pay') {
      await _continueReadyCheckout(currentSession, confirmBtn);
      return;
    }
    if (currentSession?.checkoutStep !== 'draft' || !currentSession.orderId) {
      _showCheckoutSessionMissing(confirmBtn);
      return;
    }
    const checkoutSession = await window.API.checkout.updateSession(
      currentSession.orderId,
      _buildCheckoutUpdateRequest(formData)
    );

    _saveCheckoutSession(checkoutSession);

    // ECPay / COD：PATCH 為 ready_to_pay 後同一按鈕接續（M2）
    if (checkoutSession.checkoutStep === 'ready_to_pay') {
      await _continueReadyCheckout(checkoutSession, confirmBtn);
      return;
    }

    _renderCheckoutSessionState(checkoutSession, confirmBtn);
  } catch (error) {
    _handleCheckoutError(error, confirmBtn);
  }
}

// 接續處理 Ready Session：COD 成立或 ECPay 導轉。
async function _continueReadyCheckout(checkoutSession, confirmBtn) {
  if (checkoutSession.paymentMethod === 'cod') {
    const confirmed = await window.API.checkout.confirmCod(checkoutSession.orderId);
    _finishCheckoutAndRedirect(confirmed);
    return;
  }
  const launch = await window.API.checkout.createEcpayForm(checkoutSession.orderId);
  _submitEcpayForm(launch);
  _resetCheckoutConfirmButton(confirmBtn);
}

// 後端確認訂單成立後，清空購物車與舊 Checkout 暫存，再以訂單 ID 開啟狀態頁。
function _finishCheckoutAndRedirect(checkoutSession) {
  const orderId = checkoutSession?.orderId;
  if (!orderId) {
    throw new Error('CHECKOUT_ORDER_ID_MISSING');
  }

  if (typeof window.clearCart === 'function') {
    window.clearCart();
  } else {
    window.AppState.cart = [];
    window.saveAppState?.();
  }
  _clearCheckoutIdempotencyState();

  window.location.assign(`/storefront/pages/checkout-success.html?orderId=${encodeURIComponent(orderId)}`);
}

// 只提交後端簽好的 ECPay 欄位；前端不產生簽章，也不判定付款成功。
function _submitEcpayForm(launch) {
  if (!launch?.actionUrl || !launch?.fields || typeof launch.fields !== 'object') {
    throw new Error('ECPAY_LAUNCH_INVALID');
  }
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = launch.actionUrl;
  form.hidden = true;
  Object.entries(launch.fields).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

// 綁定返回確認背包操作。
function _initCheckoutSessionActions() {
  document.getElementById('returnToCartBtn')?.addEventListener('click', () => {
    window.location.href = '/storefront/pages/cart.html';
  });
  window.addEventListener?.('beforeunload', _stopCheckoutCountdown);
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
    pickupBranchId: document.getElementById('checkoutPickupBranch')?.value || '',
    paymentMethod: document.querySelector('input[name="paymentMethod"]:checked')?.value || '',
  };
}

// 將目前表單草稿保存在同一分頁，不把個資長期寫入 localStorage。
function _saveCheckoutFormDraft() {
  const cartFingerprint = sessionStorage.getItem(CHECKOUT_CART_FINGERPRINT_KEY);
  const orderId = sessionStorage.getItem(CHECKOUT_COMPLETED_ORDER_ID_KEY);
  const customerId = _getCheckoutUserId();
  if (!cartFingerprint || !orderId || !customerId) return;

  const formData = _readCheckoutFormData();
  const draft = {
    version: 1,
    cartFingerprint,
    orderId,
    customerId,
    buyerName: formData.buyerName,
    buyerPhone: formData.buyerPhone,
    buyerEmail: formData.buyerEmail,
    userNote: formData.userNote,
    shippingMethod: selectedShippingMethod,
    pickupBranchId: formData.pickupBranchId,
    paymentMethod: formData.paymentMethod,
    shippingAddress: formData.shippingAddress,
  };

  try {
    sessionStorage.setItem(CHECKOUT_FORM_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // 儲存空間不可用時維持原本結帳流程，不阻擋送出。
  }
}

// 只還原同會員、同購物車與同一筆 Checkout Session 的草稿。
function _restoreCheckoutFormDraft() {
  let draft;
  try {
    draft = JSON.parse(sessionStorage.getItem(CHECKOUT_FORM_DRAFT_STORAGE_KEY) || 'null');
  } catch {
    _clearCheckoutFormDraft();
    return false;
  }

  const matchesCurrentCheckout =
    draft?.version === 1 &&
    draft.customerId === _getCheckoutUserId() &&
    draft.cartFingerprint === sessionStorage.getItem(CHECKOUT_CART_FINGERPRINT_KEY) &&
    draft.orderId === sessionStorage.getItem(CHECKOUT_COMPLETED_ORDER_ID_KEY);
  if (!matchesCurrentCheckout) {
    _clearCheckoutFormDraft();
    return false;
  }

  _setCheckoutDraftFieldValue('buyerName', draft.buyerName);
  _setCheckoutDraftFieldValue('buyerPhone', draft.buyerPhone);
  _setCheckoutDraftFieldValue('buyerEmail', draft.buyerEmail);
  _setCheckoutDraftFieldValue('buyerNote', draft.userNote);

  const shippingRadio = _findCheckoutRadio('shippingMethod', draft.shippingMethod);
  if (shippingRadio && !shippingRadio.disabled) {
    shippingRadio.checked = true;
    selectedShippingMethod = shippingRadio.value;
  }

  const paymentRadio = _findCheckoutRadio('paymentMethod', draft.paymentMethod);
  if (paymentRadio && !paymentRadio.disabled) paymentRadio.checked = true;

  const pickupSelect = document.getElementById('checkoutPickupBranch');
  const hasPickupBranch = Array.from(pickupSelect?.options || []).some(
    (option) => option.value === draft.pickupBranchId
  );
  if (pickupSelect && hasPickupBranch) pickupSelect.value = draft.pickupBranchId;

  if (draft.shippingAddress && typeof draft.shippingAddress === 'object') {
    window.YuruiShippingAddressUI?.setAddress?.(draft.shippingAddress);
  }
  return true;
}

// 以純文字 value 還原欄位，避免將暫存內容插入 HTML。
function _setCheckoutDraftFieldValue(id, value) {
  const field = document.getElementById(id);
  if (field && typeof value === 'string') field.value = value;
}

// 尋找既有 radio 選項，不把暫存值拼進 CSS selector。
function _findCheckoutRadio(name, value) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]`)).find(
    (input) => input.value === value
  );
}

// 監聽所有會影響結帳內容的文字欄位與門市選擇。
function _initCheckoutFormDraftPersistence() {
  ['buyerName', 'buyerPhone', 'buyerEmail', 'buyerNote'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', _saveCheckoutFormDraft);
  });
  document.getElementById('checkoutPickupBranch')?.addEventListener('change', _saveCheckoutFormDraft);
}

// 清除本分頁內的結帳表單個資草稿。
function _clearCheckoutFormDraft() {
  sessionStorage.removeItem(CHECKOUT_FORM_DRAFT_STORAGE_KEY);
}

function _initCheckoutInputValidation() {
  document.querySelectorAll('input.checkoutInput').forEach((input) => {
    input.addEventListener('input', () => {
      input.classList.remove('isInvalid');
      input.removeAttribute('aria-invalid');
    });
  });
  document.getElementById('checkoutShippingAddressEditBtn')?.addEventListener('click', () => {
    const display = document.getElementById('checkoutShippingAddressDisplay');
    display?.classList.remove('isInvalid');
    display?.removeAttribute('aria-invalid');
  });
  document.getElementById('checkoutPickupBranch')?.addEventListener('change', (event) => {
    event.currentTarget.classList.remove('isInvalid');
    event.currentTarget.removeAttribute('aria-invalid');
  });
  document.querySelectorAll('input[name="paymentMethod"]').forEach((input) => {
    input.addEventListener('change', () => {
      document.getElementById('panelPayment')?.classList.remove('isInvalid');
    });
  });
}

// Validate checkout form and focus the first invalid field.
function _validateCheckoutForm(data) {
  document.querySelectorAll('input.checkoutInput.isInvalid').forEach((input) => {
    input.classList.remove('isInvalid');
    input.removeAttribute('aria-invalid');
  });
  const shippingAddressDisplay = document.getElementById('checkoutShippingAddressDisplay');
  shippingAddressDisplay?.classList.remove('isInvalid');
  shippingAddressDisplay?.removeAttribute('aria-invalid');
  const pickupBranch = document.getElementById('checkoutPickupBranch');
  pickupBranch?.classList.remove('isInvalid');
  pickupBranch?.removeAttribute('aria-invalid');
  document.getElementById('panelPayment')?.classList.remove('isInvalid');

  const buyerRules = [
    { valid: data.buyerName, field: 'buyerName', message: '請輸入姓名' },
    { valid: data.buyerPhone, field: 'buyerPhone', message: '請輸入手機' },
    {
      valid: window.isValidMobile
        ? window.isValidMobile(data.buyerPhone)
        : window.isValidPhone(data.buyerPhone),
      field: 'buyerPhone',
      message: '手機須為 09 開頭的 10 碼數字（例：0988744144）',
    },
    { valid: data.buyerEmail, field: 'buyerEmail', message: '請輸入 Email' },
    { valid: window.isValidEmail(data.buyerEmail), field: 'buyerEmail', message: 'Email 格式不正確' },
  ];

  const failedBuyerRules = buyerRules.filter((rule) => !rule.valid);
  failedBuyerRules.forEach((rule) => {
    const input = document.getElementById(rule.field);
    input?.classList.add('isInvalid');
    input?.setAttribute('aria-invalid', 'true');
  });

  if (failedBuyerRules.length > 0) {
    _openCheckoutPanel('panelBuyer');
    window.showToast('請完成紅色標記的必填資料', 'error');
    document.getElementById(failedBuyerRules[0].field)?.focus();
    return false;
  }

  if (selectedShippingMethod === 'delivery') {
    const addrResult = window.YuruiShippingAddress?.validate(data.shippingAddress);
    if (!addrResult?.ok) {
      shippingAddressDisplay?.classList.add('isInvalid');
      shippingAddressDisplay?.setAttribute('aria-invalid', 'true');
      _openCheckoutPanel('panelShipping');
      window.showToast('請完成紅色標記的必填資料', 'error');
      document.getElementById('checkoutShippingAddressEditBtn')?.focus();
      return false;
    }
  }
  if (selectedShippingMethod === 'pickup' && !data.pickupBranchId) {
    pickupBranch?.classList.add('isInvalid');
    pickupBranch?.setAttribute('aria-invalid', 'true');
    _openCheckoutPanel('panelShipping');
    window.showToast('請完成紅色標記的必填資料', 'error');
    pickupBranch?.focus();
    return false;
  }
  if (selectedShippingMethod === 'cvs') {
    const session = _getStoredCheckoutSession();
    const hasCvsStore = Boolean(session?.shipping?.cvsStoreId);
    if (!hasCvsStore) {
      document.getElementById('checkoutCvsStoreDisplay')?.classList.add('isInvalid');
      _openCheckoutPanel('panelShipping');
      window.showToast('請先選擇超商取貨門市', 'error');
      document.getElementById('checkoutCvsMapBtn')?.focus();
      return false;
    }
  }
  if (!data.paymentMethod) {
    document.getElementById('panelPayment')?.classList.add('isInvalid');
    _openCheckoutPanel('panelPayment');
    window.showToast('請完成紅色標記的必填資料', 'error');
    document.querySelector('input[name="paymentMethod"]')?.focus();
    return false;
  }

  return true;
}

function _openCheckoutPanel(panelId) {
  const panel = document.getElementById(panelId);
  const trigger = panel?.querySelector('[data-panel-trigger]');
  if (trigger) _setPanelOpen(trigger, true);
}

// Toggle confirm button loading state.
function _setConfirmButtonLoading(button, isLoading) {
  button.disabled = isLoading;
  button.classList.toggle('isLoading', isLoading);
  button.textContent = isLoading
    ? 'Checkout 處理中...'
    : _getConfirmButtonLabel(_getStoredCheckoutSession());
}

// 超商尚未選店時，後端 ck_orders_shipping_target 不允許 shipping.method=cvs；維持 Session 既有方式。
function _resolveCheckoutShippingMethodForPatch() {
  const session = _getStoredCheckoutSession();
  const hasCvsStore = Boolean(session?.shipping?.cvsStoreId);
  if (selectedShippingMethod === 'cvs' && !hasCvsStore) {
    return session?.shipping?.method || 'delivery';
  }
  return selectedShippingMethod;
}

// 草稿 PATCH 只送後端允許修改的收件資料與付款方式。
function _buildCheckoutUpdateRequest(formData) {
  const session = _getStoredCheckoutSession();
  const hasCvsStore = Boolean(session?.shipping?.cvsStoreId);
  const shippingMethod = _resolveCheckoutShippingMethodForPatch();
  const request = {
    shipping: {
      method: shippingMethod,
      recipientName: formData.buyerName,
      phone: formData.buyerPhone,
      address: shippingMethod === 'delivery' ? formData.deliveryAddress : null,
      pickupBranchId: shippingMethod === 'pickup' ? formData.pickupBranchId : null,
      cvsStoreId: selectedShippingMethod === 'cvs' && hasCvsStore
        ? session.shipping.cvsStoreId
        : null,
      cvsStoreName: selectedShippingMethod === 'cvs' && hasCvsStore
        ? session.shipping.cvsStoreName
        : null,
      cvsSubType: selectedShippingMethod === 'cvs' && hasCvsStore ? 'FAMI' : null,
    },
    paymentMethod: _getSelectedPaymentCode(),
  };

  const checkoutSession = _getStoredCheckoutSession();
  const selectedClaimId = selectedCheckoutCouponClaim?.id;
  const couponAlreadyApplied =
    selectedClaimId && Number(checkoutSession?.couponClaimId) === Number(selectedClaimId);

  // 套券時已單獨 PATCH；確認結帳不重送 Session 目前已有的 claim。
  if (_isBackendCheckoutMode() && selectedClaimId && !couponAlreadyApplied) {
    request.couponClaimId = selectedCheckoutCouponClaim.id;
  }

  return request;
}

// 使用 CheckoutSession.pricing 覆蓋前端預估金額。
function _applyCheckoutSessionPricing(pricing) {
  const values = ['subtotal', 'shippingFee', 'discount', 'total'].reduce(
    (result, field) => ({ ...result, [field]: Number(pricing?.[field]) }),
    {}
  );
  if (Object.values(values).some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('CHECKOUT_PRICING_INVALID');
  }

  checkoutDiscount = values.discount;
  _setText('checkoutSubtotal', window.formatCurrency(values.subtotal));
  _renderShippingFee(values.shippingFee);
  _renderDiscountRow();
  _setText('checkoutTotal', window.formatCurrency(values.total));
}

// 相容既有測試入口，實際狀態統一交給 Session renderer。
function _showCheckoutSessionReady(checkoutSession, confirmBtn) {
  _renderCheckoutSessionState(checkoutSession, confirmBtn);
}

// 重新整理頁面時還原已建立 Session 的後端金額與狀態（B3：Session 在 checkout 進頁建立）。
function _restoreCheckoutSession() {
  const checkoutSession = _getStoredCheckoutSession();
  if (!checkoutSession?.orderId) return;
  const confirmBtn = document.getElementById('confirmOrderBtn');
  if (confirmBtn) _renderCheckoutSessionState(checkoutSession, confirmBtn);
}

// 保存完整 Session，讓重新整理後能還原狀態與後端金額。
function _saveCheckoutSession(checkoutSession, fingerprint) {
  sessionStorage.setItem(CHECKOUT_LAST_SESSION_STORAGE_KEY, JSON.stringify(checkoutSession));
  sessionStorage.setItem(CHECKOUT_COMPLETED_ORDER_ID_KEY, checkoutSession.orderId);
  if (fingerprint) {
    sessionStorage.setItem(CHECKOUT_CART_FINGERPRINT_KEY, fingerprint);
  }
}

// 安全讀取目前分頁的完整 CheckoutSession。
function _getStoredCheckoutSession() {
  try {
    return JSON.parse(sessionStorage.getItem(CHECKOUT_LAST_SESSION_STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

// 依後端 checkoutStep 呈現 Draft 或 Ready to pay。
function _renderCheckoutSessionState(checkoutSession, confirmBtn) {
  _applyCheckoutSessionPricing(checkoutSession.pricing);
  _applyCheckoutShippingFromSession(checkoutSession.shipping);
  _toggleCheckoutSessionButtons({ cart: false });

  if (checkoutSession.checkoutStep === 'draft') {
    _stopCheckoutCountdown();
    _hideCheckoutSessionPanel();
    _setCheckoutTimerVisible(false);
    confirmBtn.disabled = false;
    confirmBtn.classList.remove('isLoading');
    confirmBtn.textContent = _getConfirmButtonLabel(checkoutSession);
    return;
  }

  if (checkoutSession.checkoutStep === 'ready_to_pay') {
    const isEcpay = checkoutSession.paymentMethod !== 'cod';
    if (isEcpay) {
      // ECPay 不顯示 Ready 大面板，只保留倒數（M2）
      _hideCheckoutSessionPanel();
    } else {
      _setCheckoutSessionPanel({
        state: 'isReady',
        icon: 'bi-check-circle',
        badge: 'Ready to pay',
        title: '訂單已建立，等待確認',
        message: '金額與庫存已由後端確認，請在保留時間內確認貨到付款。',
        details: [
          `訂單編號：${
            window.formatOrderDisplayId
              ? window.formatOrderDisplayId(checkoutSession)
              : checkoutSession.orderId
          }`,
        ],
      });
    }
    _startCheckoutCountdown(checkoutSession.checkoutExpiresAt);
    confirmBtn.disabled = false;
    confirmBtn.classList.remove('isLoading');
    confirmBtn.textContent = _getConfirmButtonLabel(checkoutSession);
    return;
  }

  if (checkoutSession.checkoutStep === 'completed') {
    _finishCheckoutAndRedirect(checkoutSession);
    return;
  }

  _showCheckoutErrorPanel('Checkout 狀態無法辨識', '請重新建立 Checkout。');
  _clearCheckoutIdempotencyState();
  _showCheckoutSessionMissing(confirmBtn);
}

// 統一切換狀態面板文字、圖示與色彩狀態。
function _setCheckoutSessionPanel({ state, icon, badge, title, message, details = [] }) {
  const panel = document.getElementById('checkoutSessionPanel');
  if (!panel) return;

  panel.hidden = false;
  panel.classList.remove('isDraft', 'isReady', 'isExpired', 'isCancelled', 'isError');
  if (state) panel.classList.add(state);
  panel.dataset.state = state || '';
  _setText('checkoutSessionBadge', badge);
  _setText('checkoutSessionTitle', title);
  _setText('checkoutSessionMessage', message);

  const iconEl = document.getElementById('checkoutSessionIcon');
  if (iconEl) iconEl.className = `bi ${icon} checkoutSessionIcon`;
  _renderCheckoutErrorDetails(details);
}

// 正常填表期間隱藏 Session 面板，真正的庫存、逾時或系統錯誤才顯示。
function _hideCheckoutSessionPanel() {
  const panel = document.getElementById('checkoutSessionPanel');
  if (!panel) return;

  panel.hidden = true;
  panel.classList.remove('isDraft', 'isReady', 'isExpired', 'isCancelled', 'isError');
  panel.dataset.state = '';
  _renderCheckoutErrorDetails([]);
}

// 錯誤明細只用 textContent 寫入，避免後端文字成為 HTML。
function _renderCheckoutErrorDetails(details) {
  const list = document.getElementById('checkoutSessionDetails');
  if (!list) return;

  list.replaceChildren();
  const messages = (Array.isArray(details) ? details : [])
    .map((detail) => detail?.reason || detail?.message || detail?.field)
    .filter(Boolean);
  messages.forEach((message) => {
    const item = document.createElement('li');
    item.textContent = message;
    list.appendChild(item);
  });
  list.hidden = messages.length === 0;
}

// Ready 狀態每秒更新倒數，到期後切換為 Expired。
function _startCheckoutCountdown(checkoutExpiresAt) {
  _stopCheckoutCountdown();
  _setCheckoutTimerVisible(true);
  if (!_updateCheckoutCountdown(checkoutExpiresAt)) return;

  checkoutCountdownTimer = window.setInterval(() => {
    if (!_updateCheckoutCountdown(checkoutExpiresAt)) {
      _stopCheckoutCountdown();
    }
  }, 1000);
}

// 計算並渲染 mm:ss；回傳 false 代表已到期或時間無效。
function _updateCheckoutCountdown(checkoutExpiresAt) {
  const expiresAt = Date.parse(checkoutExpiresAt);
  const remaining = expiresAt - Date.now();
  if (!Number.isFinite(expiresAt) || remaining <= 0) {
    _handleCheckoutExpired();
    return false;
  }

  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  _setText('checkoutCountdown', `${minutes}:${seconds}`);
  return true;
}

// 停止目前倒數，避免重複計時器或離頁後繼續執行。
function _stopCheckoutCountdown() {
  if (checkoutCountdownTimer !== null) {
    window.clearInterval(checkoutCountdownTimer);
    checkoutCountdownTimer = null;
  }
}

function _setCheckoutTimerVisible(visible) {
  const timer = document.getElementById('checkoutSessionTimer');
  if (timer) timer.hidden = !visible;
}

// 到期會清除冪等狀態，但保留購物車讓使用者重新 Checkout。
function _handleCheckoutExpired() {
  const panel = document.getElementById('checkoutSessionPanel');
  if (panel?.dataset.state === 'isExpired') return;

  _clearCheckoutIdempotencyState();
  _setCheckoutTimerVisible(false);
  _setCheckoutSessionPanel({
    state: 'isExpired',
    icon: 'bi-clock-history',
    badge: 'Expired',
    title: 'Checkout 已逾時',
    message: '保留庫存已釋放，購物車仍保留，請返回確認背包重新鎖庫。',
  });
  _toggleCheckoutSessionButtons({ cart: true });
  _disableCheckoutConfirmButton(document.getElementById('confirmOrderBtn'));
}

function _toggleCheckoutSessionButtons({ cart }) {
  const cartBtn = document.getElementById('returnToCartBtn');
  if (cartBtn) cartBtn.hidden = !cart;
  if (cartBtn) cartBtn.textContent = '返回確認背包';
}

// 將後端錯誤碼轉成可操作的 Checkout UI。
function _handleCheckoutError(error, confirmBtn) {
  const code = _normalizeCheckoutErrorCode(error);
  const details = Array.isArray(error?.details) ? error.details : [];
  _stopCheckoutCountdown();

  if (code === 'UNAUTHORIZED' || code === 'AUTH_TOKEN_UNAVAILABLE') {
    _showCheckoutErrorPanel('請先登入', '登入後即可繼續建立 Checkout。');
    _resetCheckoutConfirmButton(confirmBtn);
    window.openModal?.('loginModal');
    return;
  }

  if (code === 'STOCK_INSUFFICIENT') {
    const stockDetails = details.length > 0 ? details : [{ reason: error?.message || '商品庫存不足' }];
    _showCheckoutErrorPanel('部分商品庫存不足', '請調整購物車數量後再試。', stockDetails);
    _toggleCheckoutSessionButtons({ cart: true });
    _disableCheckoutConfirmButton(confirmBtn, '商品剩餘數量不足請重新調整數量');
    return;
  }

  if (code === 'VALIDATION_ERROR') {
    _markCheckoutValidationFields(details);
    _hideCheckoutSessionPanel();
    window.showToast?.('請完成紅色標記的必填資料', 'error');
    _resetCheckoutConfirmButton(confirmBtn);
    return;
  }

  if (code === 'IDEMPOTENCY_CONFLICT') {
    _clearCheckoutIdempotencyState();
    _showCheckoutErrorPanel('Checkout 請求已衝突', '請返回確認背包重新建立 Checkout。');
    _toggleCheckoutSessionButtons({ cart: true });
    _disableCheckoutConfirmButton(confirmBtn);
    return;
  }

  if (code === 'CHECKOUT_EXPIRED') {
    _handleCheckoutExpired();
    return;
  }

  const message =
    code === 'INTERNAL_ERROR' ? '系統暫時無法處理，請稍後再試。' : '無法完成 Checkout，請稍後再試。';
  _showCheckoutErrorPanel('無法完成 Checkout', message);
  _resetCheckoutConfirmButton(confirmBtn);
}

function _showCheckoutSessionMissing(confirmBtn) {
  _showCheckoutErrorPanel('尚未建立結帳保留', '請重新整理此頁，或返回確認背包後再進入結帳。');
  _toggleCheckoutSessionButtons({ cart: true });
  _disableCheckoutConfirmButton(confirmBtn);
}

function _disableCheckoutConfirmButton(confirmBtn, label = '請先返回確認背包') {
  if (!confirmBtn) return;
  confirmBtn.disabled = true;
  confirmBtn.classList.remove('isLoading');
  confirmBtn.textContent = label;
}

// Checkout 後端目前可能以 CONFLICT 回傳冪等衝突，前端兼容兩種代碼。
function _normalizeCheckoutErrorCode(error) {
  if (error?.code === 'CONFLICT' && /idempotency/i.test(error?.message || '')) {
    return 'IDEMPOTENCY_CONFLICT';
  }
  return error?.code || 'API_REQUEST_FAILED';
}

function _showCheckoutErrorPanel(title, message, details = []) {
  _setCheckoutSessionPanel({
    state: 'isError',
    icon: 'bi-exclamation-octagon',
    badge: 'Error',
    title,
    message,
    details,
  });
  _setCheckoutTimerVisible(false);
}

// 依 details.field 標記買家、地址或付款欄位。
function _markCheckoutValidationFields(details) {
  const fieldMap = {
    recipientName: 'buyerName',
    'shipping.recipientName': 'buyerName',
    phone: 'buyerPhone',
    'shipping.phone': 'buyerPhone',
  };

  details.forEach((detail) => {
    const inputId = fieldMap[detail?.field];
    if (inputId) {
      const input = document.getElementById(inputId);
      input?.classList.add('isInvalid');
      input?.setAttribute('aria-invalid', 'true');
    }

    if (['address', 'shipping.address'].includes(detail?.field)) {
      document.getElementById('checkoutShippingAddressDisplay')?.classList.add('isInvalid');
      document.getElementById('checkoutShippingAddressEditBtn')?.setAttribute('aria-invalid', 'true');
    }

    if (detail?.field === 'paymentMethod') {
      document.getElementById('panelPayment')?.classList.add('isInvalid');
    }
  });
}

function _resetCheckoutConfirmButton(confirmBtn, label) {
  if (!confirmBtn) return;

  confirmBtn.disabled = false;
  confirmBtn.classList.remove('isLoading');
  confirmBtn.textContent = label || _getConfirmButtonLabel(_getStoredCheckoutSession());
}

// 購物車只轉成規格 ID 與數量，商品快照由後端從資料庫建立。
function _buildCheckoutRequestItems(cart) {
  return cart.map((item) => {
    const variantId = String(item.variantId || '').trim();
    const quantity = Number(item.quantity);
    if (!variantId || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error('VALIDATION_ERROR: 購物車商品缺少有效的 variantId 或 quantity');
    }

    return { variantId, quantity };
  });
}

// 將購物車規格與數量排序後建立穩定指紋。
function _buildCheckoutCartFingerprint(cart) {
  const items = _buildCheckoutRequestItems(cart)
    .slice()
    .sort((a, b) => a.variantId.localeCompare(b.variantId));
  return JSON.stringify(items);
}

// 發現購物車變更時，清除舊 key 與舊 orderId。
function _syncCheckoutIdempotencyWithCart(cart) {
  const fingerprint = _buildCheckoutCartFingerprint(cart);
  const storedFingerprint = sessionStorage.getItem(CHECKOUT_CART_FINGERPRINT_KEY);
  if (storedFingerprint !== fingerprint) {
    _clearCheckoutIdempotencyState();
    sessionStorage.setItem(CHECKOUT_CART_FINGERPRINT_KEY, fingerprint);
  }

  return fingerprint;
}

// 購物車在 Checkout 頁被修改時，立即清除上一份購物車的 key。
function _initCheckoutIdempotencyListener() {
  document.addEventListener('yurui:cart-changed', () => {
    const previousFingerprint = sessionStorage.getItem(CHECKOUT_CART_FINGERPRINT_KEY);
    _syncCheckoutIdempotencyWithCart(window.AppState.cart || []);
    const nextFingerprint = sessionStorage.getItem(CHECKOUT_CART_FINGERPRINT_KEY);
    if (previousFingerprint === nextFingerprint) return;

    _renderCheckoutItems();
    _updateCheckoutSummary();
    _showCheckoutEstimateState();
  });
}

// Checkout 頁不可改商品；購物車變更後要求返回確認背包重新鎖庫。
function _showCheckoutEstimateState() {
  _stopCheckoutCountdown();
  const panel = document.getElementById('checkoutSessionPanel');
  if (panel) panel.hidden = true;
  _setCheckoutTimerVisible(false);

  const confirmBtn = document.getElementById('confirmOrderBtn');
  _showCheckoutSessionMissing(confirmBtn);
}

// 優先回傳已保存的完整 Session；缺少時由建立流程用同一 key 安全回放。
function _readCompletedCheckoutSession(orderId) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(CHECKOUT_LAST_SESSION_STORAGE_KEY) || 'null');
    if (stored?.orderId === orderId) return stored;
  } catch {
    // 舊資料無法解析時仍可使用已保存的 orderId。
  }

  return { orderId };
}

// 取消、逾時或購物車變更時清除整組冪等狀態。
function _clearCheckoutIdempotencyState() {
  _stopCheckoutCountdown();
  sessionStorage.removeItem(CHECKOUT_IDEMPOTENCY_KEY);
  sessionStorage.removeItem(CHECKOUT_CART_FINGERPRINT_KEY);
  sessionStorage.removeItem(CHECKOUT_COMPLETED_ORDER_ID_KEY);
  sessionStorage.removeItem(CHECKOUT_LAST_SESSION_STORAGE_KEY);
  _clearCheckoutFormDraft();
}

// 從 Session 還原配送方式與 CVS 門市顯示。
function _applyCheckoutShippingFromSession(shipping) {
  if (!shipping?.method) return;
  selectedShippingMethod = shipping.method;
  const radio = document.querySelector(`input[name="shippingMethod"][value="${shipping.method}"]`);
  if (radio) radio.checked = true;
  _syncRadioGroupState('shippingMethod');
  _syncDeliveryAddressState();
  if (shipping.method === 'cvs') {
    _renderCvsStoreDisplay(shipping.cvsStoreName, shipping.address);
  }
}

function _renderCvsStoreDisplay(storeName, address) {
  const display = document.getElementById('checkoutCvsStoreDisplay');
  if (!display) return;
  display.classList.remove('isInvalid');
  display.removeAttribute('aria-invalid');
  if (!storeName && !address) {
    display.innerHTML = '<span class="shippingAddressEmpty">尚未選擇門市</span>';
    return;
  }
  const lines = [storeName, address].filter(Boolean);
  display.textContent = lines.join('｜');
}

// 綠界選店回來後刷新 Session（URL: ?cvsMap=ok&orderId=...）。
async function _handleCvsMapReturnFromEcpay() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('cvsMap') !== 'ok') return;
  const orderId = params.get('orderId');
  if (!orderId) return;

  try {
    await _waitForCheckoutAuthReady();
    const checkoutSession = await window.API.checkout.getSession(orderId);
    _saveCheckoutSession(checkoutSession);
    _renderCheckoutSessionState(checkoutSession, document.getElementById('confirmOrderBtn'));
    window.showToast('超商門市已更新', 'success');
  } catch (error) {
    console.error('Failed to refresh checkout after CVS map', error);
    window.showToast('門市已選取，但同步 Checkout 失敗，請重新整理', 'warning');
  }

  params.delete('cvsMap');
  params.delete('orderId');
  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
  window.history.replaceState({}, '', nextUrl);
}

function _initCheckoutCvsMap() {
  document.getElementById('checkoutCvsMapBtn')?.addEventListener('click', async () => {
    const session = _getStoredCheckoutSession();
    if (!session?.orderId) {
      window.showToast('Checkout 尚未建立，請稍候', 'warning');
      return;
    }
    const formData = _readCheckoutFormData();
    if (!formData.buyerName || !formData.buyerPhone) {
      window.showToast('請先填寫收件人姓名與電話', 'warning');
      _openCheckoutPanel('panelBuyer');
      return;
    }

    selectedShippingMethod = 'cvs';
    _syncRadioGroupState('shippingMethod');
    _syncDeliveryAddressState();

    try {
      // 選店前先只 PATCH 收件人／電話；shipping.method=cvs 需等 map callback 寫入門市後才能存。
      await window.API.checkout.updateSession(session.orderId, {
        shipping: {
          recipientName: formData.buyerName,
          phone: formData.buyerPhone,
        },
        paymentMethod: _getSelectedPaymentCode(),
      });
      const launch = await window.API.checkout.createCvsMapForm(session.orderId);
      if (launch?.mockCvsApplied && launch.checkoutSession) {
        _saveCheckoutSession(launch.checkoutSession);
        _renderCheckoutSessionState(launch.checkoutSession, document.getElementById('confirmOrderBtn'));
        window.showToast('超商門市已選擇（Mock）', 'success');
        return;
      }
      _submitEcpayForm(launch);
    } catch (error) {
      _handleCheckoutError(error, document.getElementById('confirmOrderBtn'));
    }
  });
}

// 提供 facade 在取消成功或收到逾時錯誤時清除 Checkout 狀態。
window.CheckoutIdempotency = {
  clear: _clearCheckoutIdempotencyState,
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.initCheckoutPage);
} else {
  window.initCheckoutPage();
}
