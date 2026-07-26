(function initCheckoutStatusPage(global) {
  'use strict';

  const LAST_SESSION_KEY = 'lastCheckoutSession';
  const COMPLETED_ORDER_ID_KEY = 'checkoutCompletedOrderId';
  let countdownTimer = null;

  function resolveViewState(session, now = Date.now()) {
    const expiresAt = Date.parse(session?.checkoutExpiresAt || '');
    const expired = Number.isFinite(expiresAt) && expiresAt <= now;

    if (session?.status === 'cancelled' && expired) {
      return {
        key: 'expired',
        badge: 'Expired',
        title: '結帳保留已逾時',
        icon: 'bi-clock-history',
        description: '此訂單仍未付款，保留庫存已釋放。',
      };
    }
    if (session?.status === 'cancelled') {
      return {
        key: 'cancelled',
        badge: 'Cancelled',
        title: '此訂單已取消',
        icon: 'bi-x-lg',
        description: '此訂單已取消，不會進入付款或備貨流程。',
      };
    }
    if (session?.paymentStatus === 'paid') {
      return {
        key: 'paid',
        badge: 'Paid',
        title: '付款狀態已由後端確認',
        icon: 'bi-check-lg',
        description: '此狀態來自後端付款紀錄。',
      };
    }
    if (session?.paymentMethod === 'cod' && session?.checkoutStep === 'completed') {
      return {
        key: 'paid',
        badge: 'COD confirmed',
        title: '貨到付款訂單已成立',
        icon: 'bi-check-lg',
        description:
          '訂單已進入備貨流程，收到商品時再以現金付款。取消訂單可以前往會員中心的訂單紀錄取消訂單。',
      };
    }
    if (expired) {
      return {
        key: 'expired',
        badge: 'Expired',
        title: '結帳保留已逾時',
        icon: 'bi-clock-history',
        description: '付款期限已過，請回到購物車重新建立 Checkout。',
      };
    }
    return {
      key: 'pending',
      badge: 'Unpaid',
      title: '訂單已建立，等待付款',
      icon: 'bi-hourglass-split',
      description: '目前尚未付款，也尚未進入備貨流程。',
    };
  }

  function readStoredSession() {
    try {
      return JSON.parse(global.sessionStorage.getItem(LAST_SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function readOrderId() {
    const params = new URLSearchParams(global.location.search);
    const queryId = params.get('orderId') || params.get('orderNum');
    if (queryId) return String(queryId).replace(/^#/, '');
    const completedId = global.sessionStorage.getItem(COMPLETED_ORDER_ID_KEY);
    if (completedId) return completedId;
    return readStoredSession()?.orderId || '';
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  /** 顯示 displayNo，不加 # 前綴 / Show displayNo without hash prefix */
  function formatOrderIdForDisplay(orderId, session) {
    const entity = session?.displayNo ? session : { id: orderId, displayNo: session?.displayNo };
    const value = global.formatOrderDisplayId
      ? global.formatOrderDisplayId(entity, session?.displayNo)
      : String(orderId || '');
    const normalized = String(value || '').replace(/^#/, '').trim();
    return normalized || '—';
  }

  function formatRemaining(expiresAt) {
    const remaining = Date.parse(expiresAt || '') - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return '已到期';
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function renderSession(session) {
    const panel = document.getElementById('checkoutStatusPanel');
    const details = document.getElementById('checkoutStatusDetails');
    const icon = document.getElementById('checkoutStatusIcon');
    const state = resolveViewState(session);

    panel?.classList.remove('isLoading', 'isPending', 'isPaid', 'isCancelled', 'isExpired', 'isError');
    panel?.classList.add(`is${state.key[0].toUpperCase()}${state.key.slice(1)}`);
    panel?.setAttribute('aria-busy', 'false');
    if (icon) icon.className = `bi ${state.icon} successIcon`;
    setText('checkoutStatusBadge', state.badge);
    setText('successTitle', state.title);
    setText('checkoutStatusDescription', state.description);
    setText('orderNumberDisplay', formatOrderIdForDisplay(session.orderId, session));
    setText('paymentStatusDisplay', session.paymentStatus === 'paid' ? '已付款' : '未付款');
    setText(
      'orderTotalDisplay',
      global.formatCurrency
        ? global.formatCurrency(session.pricing?.total || 0)
        : session.pricing?.total || '--'
    );
    if (details) details.hidden = false;

    global.clearInterval(countdownTimer);
    const updateExpiry = () => {
      setText(
        'checkoutExpiryDisplay',
        session.checkoutExpiresAt ? formatRemaining(session.checkoutExpiresAt) : '不適用'
      );
      if (Date.parse(session.checkoutExpiresAt || '') <= Date.now()) global.clearInterval(countdownTimer);
    };
    updateExpiry();
    if (state.key === 'pending' && session.checkoutExpiresAt) {
      countdownTimer = global.setInterval(updateExpiry, 1000);
    }
  }

  function renderError(message) {
    const panel = document.getElementById('checkoutStatusPanel');
    panel?.classList.remove('isLoading');
    panel?.classList.add('isError');
    panel?.setAttribute('aria-busy', 'false');
    setText('checkoutStatusBadge', 'Unavailable');
    setText('successTitle', '無法確認訂單狀態');
    setText('checkoutStatusDescription', message);
    setText('orderNumberDisplay', '—');
  }

  async function init() {
    const orderId = readOrderId();
    const storedSession = readStoredSession();
    if (!orderId) {
      renderError('找不到訂單編號，請由會員中心查看訂單。');
      return;
    }
    setText('orderNumberDisplay', formatOrderIdForDisplay(orderId, storedSession));
    try {
      const session = await global.API.checkout.getSession(orderId);
      renderSession(session);
    } catch (error) {
      renderError(
        error?.status === 404 ? '找不到這筆訂單，或此訂單不屬於目前會員。' : '後端狀態讀取失敗，請稍後重試。'
      );
    }
  }

  global.CheckoutSuccessPage = { init, readOrderId, resolveViewState, formatRemaining };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
