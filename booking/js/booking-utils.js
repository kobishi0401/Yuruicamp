/**
 * booking-utils.js
 * 預約系統共用工具函式
 * showToast(message, type) — 取代原生 alert，顯示右上角訊息提示框
 *   type: 'info' | 'warning' | 'error' | 'success'（預設 'info'）
 */
(function () {
  'use strict';

  var ICONS = {
    info: 'bi bi-info-circle-fill',
    warning: 'bi bi-exclamation-triangle-fill',
    error: 'bi bi-x-octagon-fill',
    success: 'bi bi-check-circle-fill',
  };

  function getContainer() {
    var el = document.getElementById('bookingToastContainer');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bookingToastContainer';
      el.className = 'bookingToastContainer';
      document.body.appendChild(el);
    } else {
      el.classList.add('bookingToastContainer');
    }
    return el;
  }

  // Toast 離場：使用 bookingToastHiding 與 isHiding 標記離場動畫狀態。
  function dismiss(toast) {
    toast.classList.add('bookingToastHiding', 'isHiding');
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }

  function showToast(message, type) {
    type = type && ICONS[type] ? type : 'info';
    var container = getContainer();

    var toast = document.createElement('div');
    // Toast class：以 bookingToast + 語意狀態命名，讓通知元件維持單一正式 API。
    toast.className = 'bookingToast bookingToast' + type.charAt(0).toUpperCase() + type.slice(1);

    var icon = document.createElement('i');
    icon.className = ICONS[type];
    icon.setAttribute('aria-hidden', 'true');

    var text = document.createElement('span');
    text.className = 'bookingToastText';
    text.textContent = message;

    var closeBtn = document.createElement('button');
    closeBtn.className = 'bookingToastClose';
    closeBtn.setAttribute('aria-label', '關閉');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', function () {
      dismiss(toast);
    });

    toast.appendChild(icon);
    toast.appendChild(text);
    toast.appendChild(closeBtn);
    container.appendChild(toast);

    var timer = setTimeout(function () {
      dismiss(toast);
    }, 3500);
    toast.addEventListener('mouseenter', function () {
      clearTimeout(timer);
    });
    toast.addEventListener('mouseleave', function () {
      timer = setTimeout(function () {
        dismiss(toast);
      }, 2000);
    });
  }

  window.showToast = showToast;
})();
