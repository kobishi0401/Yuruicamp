// Shared modal and personalization runtime.
(function () {
  'use strict';

  var surveyAnswers = { styles: [], equipment: [] };
  var personalizationCompleted = false;
  var surveyMinOneMessage = '至少選擇 1 個選項';
  var surveyMinTwoMessage = '至少選擇 2 個選項';

  function getLoginProvider(button) {
    if (button.classList.contains('btnLineLogin')) return 'LINE';
    if (button.classList.contains('btnFacebookLogin')) return 'Facebook';
    return 'Google';
  }

  function hasOpenModal() {
    return Boolean(document.querySelector('.modal.isOpen'));
  }

  function hasSavedPreferences() {
    try {
      var preferences = JSON.parse(localStorage.getItem('preferences') || '{}');
      return Boolean(
        preferences &&
          Array.isArray(preferences.styles) &&
          preferences.styles.length > 0 &&
          Array.isArray(preferences.equipment) &&
          preferences.equipment.length > 0
      );
    } catch {
      return false;
    }
  }

  function isCheckoutPage() {
    return /(?:^|\/)(checkout|booking-checkout)\.html$/.test(window.location.pathname);
  }

  /**
   * 條件式開啟偏好設定：預設不自動打擾登入流程，僅由首頁或會員中心明確呼叫。
   * 套用元件：#personalizationModal。
   */
  window.maybeOpenPersonalizationModal = function (options) {
    options = options || {};
    if (options.openSurvey !== true && options.source !== 'manual') return false;
    if (isCheckoutPage() || hasOpenModal() || hasSavedPreferences()) return false;
    if (typeof window.openPersonalizationModal !== 'function') return false;
    window.openPersonalizationModal();
    return true;
  };

  /**
   * 開啟指定 Modal 並避免聚焦時捲動頁面。
   * 套用元件：#loginModal、#personalizationModal、#partnerModal。
   */
  window.openModal = function (modalId) {
    var modal = document.getElementById(modalId);
    var focusTarget;
    if (!modal) return;
    modal.classList.add('isOpen');
    document.body.classList.add('isModalOpen');
    focusTarget = modal.querySelector('button, a, input, [tabindex]:not([tabindex="-1"])');
    if (focusTarget) focusTarget.focus({ preventScroll: true });
  };

  function openSurveyCloseConfirmModal() {
    var confirmModal = document.getElementById('surveyCloseConfirmModal');
    if (!confirmModal) return false;
    window.openModal('surveyCloseConfirmModal');
    return true;
  }

  function requestPersonalizationClose() {
    if (personalizationCompleted) {
      window.closeModal('personalizationModal', { force: true });
      return;
    }
    if (!openSurveyCloseConfirmModal()) {
      window.showToast && window.showToast('尚未完成偏好設定', 'warning');
    }
  }

  window.closeModal = function (modalId, options) {
    var modal = document.getElementById(modalId);
    var force = options && options.force;
    if (!modal) return;
    if (modalId === 'personalizationModal' && !force && !personalizationCompleted) {
      requestPersonalizationClose();
      return;
    }
    modal.classList.remove('isOpen');
    document.body.classList.toggle('isModalOpen', hasOpenModal());
  };

  function syncProfilePreferenceStorage(preferences) {
    var profile = {};
    try {
      profile = JSON.parse(localStorage.getItem('yurui_profile') || '{}');
    } catch {
      profile = {};
    }
    profile.preferences = preferences;
    localStorage.setItem('yurui_profile', JSON.stringify(profile));
    localStorage.setItem('preferences', JSON.stringify(preferences));
    window.syncMemberPreferenceTags && window.syncMemberPreferenceTags(preferences);
    window.dispatchEvent(new CustomEvent('yurui:preferences-updated', { detail: preferences }));
  }

  function handleLoginSuccess(provider) {
    if (window.YuruiAuth && typeof window.YuruiAuth.loginWithProvider === 'function') {
      window.YuruiAuth.loginWithProvider(provider, {
        close: function () {
          window.closeModal('loginModal');
        },
      });
      window.updateNavbarLoginState?.();
      return;
    }

    var user = {
      id: 'user-001',
      name: provider + ' 使用者',
      email: 'user@' + provider.toLowerCase() + '.example',
      avatar: provider.charAt(0),
      provider: provider.toLowerCase(),
    };
    if (window.AppState) {
      window.AppState.isLoggedIn = true;
      window.AppState.currentUser = user;
    }
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('currentUser', JSON.stringify(user));
    window.saveAppState?.();
    window.dispatchEvent(new CustomEvent('yurui:auth-changed', { detail: { type: 'login', user: user } }));
    window.updateNavbarLoginState?.();
    window.closeModal('loginModal');
    window.showToast && window.showToast('已使用 ' + provider + ' 登入', 'success');
    window.maybeOpenPersonalizationModal({ source: 'fallback-login', openSurvey: false });
  }

  function validateSurveySelection(count, minimum) {
    if (count >= minimum) return true;
    window.showToast && window.showToast(count === 0 ? surveyMinOneMessage : surveyMinTwoMessage, 'warning');
    return false;
  }

  function goToSurveyStep(step) {
    var modal = document.getElementById('personalizationModal');
    if (!modal) return;
    modal.querySelectorAll('.surveyStep').forEach(function (panel) {
      panel.classList.toggle('isOpen', parseInt(panel.dataset.step, 10) === step);
    });
    modal.querySelectorAll('.stepperDot').forEach(function (dot, index) {
      dot.classList.toggle('isSelected', index + 1 <= step);
    });
    var stepIndicator = modal.querySelector('.stepperText');
    if (stepIndicator) stepIndicator.textContent = step + ' / 2';
  }

  window.openPersonalizationModal = function () {
    surveyAnswers = { styles: [], equipment: [] };
    personalizationCompleted = false;
    document.querySelectorAll('#personalizationModal .surveyTag.isSelected').forEach(function (tag) {
      tag.classList.remove('isSelected');
    });
    goToSurveyStep(1);
    window.openModal('personalizationModal');
  };

  window.initPersonalizationModal = function () {
    var modal = document.getElementById('personalizationModal');
    if (!modal || modal.dataset.personalizationBound === 'true') return;
    modal.dataset.personalizationBound = 'true';

    modal.addEventListener('click', function (event) {
      var tag = event.target.closest('.surveyTag');
      if (tag) {
        tag.classList.toggle('isSelected');
        return;
      }
      if (event.target.id === 'surveyNextBtn') {
        var stepOneTags = modal.querySelectorAll('[data-step="1"] .surveyTag.isSelected');
        if (!validateSurveySelection(stepOneTags.length, 2)) return;
        surveyAnswers.styles = Array.from(stepOneTags).map(function (selectedTag) {
          return selectedTag.dataset.value;
        });
        goToSurveyStep(2);
      }
      if (event.target.id === 'surveyFinishBtn') {
        var styleTags = modal.querySelectorAll('[data-step="1"] .surveyTag.isSelected');
        var equipmentTags = modal.querySelectorAll('[data-step="2"] .surveyTag.isSelected');
        if (!validateSurveySelection(styleTags.length, 2)) {
          goToSurveyStep(1);
          return;
        }
        if (!validateSurveySelection(equipmentTags.length, 2)) return;
        surveyAnswers.styles = Array.from(styleTags).map(function (selectedTag) {
          return selectedTag.dataset.value;
        });
        surveyAnswers.equipment = Array.from(equipmentTags).map(function (selectedTag) {
          return selectedTag.dataset.value;
        });
        if (window.AppState) window.AppState.preferences = surveyAnswers;
        window.saveAppState?.();
        syncProfilePreferenceStorage(surveyAnswers);
        personalizationCompleted = true;
        window.closeModal('personalizationModal', { force: true });
        window.showToast && window.showToast('偏好設定已儲存', 'success');
      }
    });
  };

  function initLoginModal() {
    var loginModal = document.getElementById('loginModal');
    if (!loginModal || loginModal.dataset.loginBound === 'true') return;
    loginModal.dataset.loginBound = 'true';
    loginModal.querySelectorAll('.btnGoogleLogin, .btnFacebookLogin, .btnLineLogin').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault();
        handleLoginSuccess(getLoginProvider(button));
      });
    });
  }

  function initSurveyCloseConfirmModal() {
    var confirmModal = document.getElementById('surveyCloseConfirmModal');
    if (!confirmModal || confirmModal.dataset.confirmBound === 'true') return;
    confirmModal.dataset.confirmBound = 'true';
    confirmModal.querySelector('[data-survey-close-cancel]')?.addEventListener('click', function () {
      window.closeModal('surveyCloseConfirmModal', { force: true });
    });
    confirmModal.querySelector('[data-survey-close-confirm]')?.addEventListener('click', function () {
      window.closeModal('surveyCloseConfirmModal', { force: true });
      window.closeModal('personalizationModal', { force: true });
    });
  }

  window.initModalListeners = function () {
    initLoginModal();
    initPersonalizationModal();
    initSurveyCloseConfirmModal();

    document.querySelectorAll('.modalClose').forEach(function (button) {
      if (button.dataset.modalCloseBound === 'true') return;
      button.dataset.modalCloseBound = 'true';
      button.addEventListener('click', function () {
        var modal = button.closest('.modal');
        if (modal) window.closeModal(modal.id);
      });
    });

    if (!document.body.dataset.modalBackdropBound) {
      document.body.dataset.modalBackdropBound = 'true';
      document.addEventListener('click', function (event) {
        if (!event.target.classList.contains('modal')) return;
        if (event.target.id === 'personalizationModal') return;
        window.closeModal(event.target.id);
      });
    }

    if (!document.body.dataset.modalEscBound) {
      document.body.dataset.modalEscBound = 'true';
      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        var openModal = document.querySelector('.modal.isOpen');
        if (!openModal || openModal.id === 'personalizationModal') return;
        window.closeModal(openModal.id);
      });
    }
  };
}());
