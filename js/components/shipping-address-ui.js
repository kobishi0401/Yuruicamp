// ========================================
// Shipping Address UI — 顯示區 + 編輯 Modal 控制器
// 會員中心、商城結帳共用
// ========================================
(function () {
  'use strict';

  var MODAL_ID = 'shippingAddressModal';
  var FIELD_IDS = {
    lastName: 'shipLastName',
    firstName: 'shipFirstName',
    postalCode: 'shipPostalCode',
    city: 'shipCity',
    district: 'shipDistrict',
    township: 'shipTownship',
    addressLine1: 'shipAddressLine1',
    addressLine2: 'shipAddressLine2',
    email: 'shipEmail',
    phone: 'shipPhone',
  };

  var instances = [];
  var currentAddress = null;
  var modalEventsBound = false;

  function $(id) {
    return document.getElementById(id);
  }

  function clearFieldErrors(formRoot) {
    formRoot = formRoot || $('shippingAddressForm');
    if (!formRoot) return;
    formRoot.querySelectorAll('.shippingAddressFieldError').forEach(function (el) {
      el.hidden = true;
      el.textContent = '';
    });
    formRoot.querySelectorAll('.isInvalid').forEach(function (el) {
      el.classList.remove('isInvalid');
      el.removeAttribute('aria-invalid');
      el.removeAttribute('aria-describedby');
    });
  }

  function getOrCreateFieldErrorEl(input) {
    if (!input || !input.parentElement) return null;
    var errEl = input.parentElement.querySelector('.shippingAddressFieldError');
    if (!errEl) {
      errEl = document.createElement('p');
      errEl.className = 'shippingAddressFieldError';
      errEl.setAttribute('role', 'alert');
      input.insertAdjacentElement('afterend', errEl);
    }
    var errId = input.id + 'Error';
    errEl.id = errId;
    return errEl;
  }

  function clearSingleFieldError(input) {
    if (!input) return;
    input.classList.remove('isInvalid');
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    var errEl = input.parentElement && input.parentElement.querySelector('.shippingAddressFieldError');
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }
  }

  function showFieldErrors(fieldErrors) {
    var form = $('shippingAddressForm');
    if (!form) return;
    clearFieldErrors(form);

    var firstInvalid = null;
    Object.keys(fieldErrors || {}).forEach(function (fieldId) {
      var input = $(fieldId);
      var msg = fieldErrors[fieldId];
      if (!input || !msg) return;

      input.classList.add('isInvalid');
      input.setAttribute('aria-invalid', 'true');

      var errEl = getOrCreateFieldErrorEl(input);
      if (errEl) {
        errEl.textContent = msg;
        errEl.hidden = false;
        input.setAttribute('aria-describedby', errEl.id);
      }

      if (!firstInvalid) firstInvalid = input;
    });

    if (firstInvalid) firstInvalid.focus({ preventScroll: true });
  }

  function clearFormErrors() {
    clearFieldErrors($('shippingAddressForm'));
  }

  function sa() {
    return window.YuruiShippingAddress;
  }

  function fillCitySelect(selectedCity) {
    var select = $(FIELD_IDS.city);
    if (!select || !sa()) return;
    var cities = sa().getCityNames();
    var normalized = sa().normalizeCity(selectedCity);
    select.innerHTML =
      '<option value="">請選擇縣/市</option>' +
      cities
        .map(function (name) {
          var selected = name === normalized ? ' selected' : '';
          return '<option value="' + name + '"' + selected + '>' + name + '</option>';
        })
        .join('');
  }

  function fillDistrictSelect(city, selectedDistrict) {
    var select = $(FIELD_IDS.district);
    if (!select || !sa()) return;
    city = sa().normalizeCity(city);
    selectedDistrict = String(selectedDistrict || '').trim();
    var list = sa().getDistricts(city);

    if (!city) {
      select.innerHTML = '<option value="">請先選擇縣/市</option>';
      select.disabled = true;
      return;
    }

    select.disabled = false;
    select.innerHTML =
      '<option value="">請選擇區</option>' +
      list
        .map(function (name) {
          var selected = name === selectedDistrict ? ' selected' : '';
          return '<option value="' + name + '"' + selected + '>' + name + '</option>';
        })
        .join('');

    if (selectedDistrict && list.indexOf(selectedDistrict) === -1) {
      var opt = document.createElement('option');
      opt.value = selectedDistrict;
      opt.textContent = selectedDistrict + '（舊資料）';
      opt.selected = true;
      select.appendChild(opt);
    }
  }

  function readForm() {
    if (!sa()) return sa().empty();
    return sa().clone({
      lastName: $(FIELD_IDS.lastName) && $(FIELD_IDS.lastName).value,
      firstName: $(FIELD_IDS.firstName) && $(FIELD_IDS.firstName).value,
      postalCode: $(FIELD_IDS.postalCode) && $(FIELD_IDS.postalCode).value,
      city: $(FIELD_IDS.city) && $(FIELD_IDS.city).value,
      district: $(FIELD_IDS.district) && $(FIELD_IDS.district).value,
      township: $(FIELD_IDS.township) && $(FIELD_IDS.township).value,
      addressLine1: $(FIELD_IDS.addressLine1) && $(FIELD_IDS.addressLine1).value,
      addressLine2: $(FIELD_IDS.addressLine2) && $(FIELD_IDS.addressLine2).value,
      email: $(FIELD_IDS.email) && $(FIELD_IDS.email).value,
      phone: $(FIELD_IDS.phone) && $(FIELD_IDS.phone).value,
    });
  }

  function fillForm(addr) {
    if (!sa()) return;
    addr = sa().clone(addr);
    if ($(FIELD_IDS.lastName)) $(FIELD_IDS.lastName).value = addr.lastName;
    if ($(FIELD_IDS.firstName)) $(FIELD_IDS.firstName).value = addr.firstName;
    if ($(FIELD_IDS.postalCode)) $(FIELD_IDS.postalCode).value = addr.postalCode;
    if ($(FIELD_IDS.township)) $(FIELD_IDS.township).value = addr.township;
    if ($(FIELD_IDS.addressLine1)) $(FIELD_IDS.addressLine1).value = addr.addressLine1;
    if ($(FIELD_IDS.addressLine2)) $(FIELD_IDS.addressLine2).value = addr.addressLine2;
    if ($(FIELD_IDS.email)) $(FIELD_IDS.email).value = addr.email;
    if ($(FIELD_IDS.phone)) {
      $(FIELD_IDS.phone).value = addr.phone ? sa().formatPhoneDisplay(addr.phone) : '';
    }
    fillCitySelect(addr.city);
    fillDistrictSelect(addr.city, addr.district);
  }

  function renderAllDisplays() {
    instances.forEach(function (inst) {
      if (!inst.displayEl) return;
      var addr = typeof inst.getAddress === 'function' ? inst.getAddress() : currentAddress;
      inst.displayEl.innerHTML = sa() ? sa().formatDisplay(addr) : '尚未設定';
    });
  }

  function openModal(addr) {
    var modal = $(MODAL_ID);
    if (!modal) return;
    bindModalEvents();
    clearFormErrors();
    fillForm(addr || currentAddress || sa().empty());
    modal.classList.add('isOpen');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('shippingAddressModalOpen');
    var focusTarget = modal.querySelector('input, select, button');
    if (focusTarget) focusTarget.focus({ preventScroll: true });
  }

  function closeModal() {
    var modal = $(MODAL_ID);
    if (!modal) return;
    clearFormErrors();
    modal.classList.remove('isOpen');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.shippingAddressModal.isOpen')) {
      document.body.classList.remove('shippingAddressModalOpen');
    }
  }

  async function persistAddress(addr, inst) {
    if (!inst.persist) return addr;

    var user = (window.AppState && window.AppState.currentUser) ||
      (window.YuruiStorage && window.YuruiStorage.readAuthUser && window.YuruiStorage.readAuthUser());
    if (!user || !user.id) return addr;

    if (window.API && window.API.customers && window.API.customers.update) {
      if (window.AppState && !window.AppState.currentUser) {
        window.AppState.currentUser = user;
        window.AppState.isLoggedIn = true;
      }
      await window.API.customers.update(user.id, { shippingAddress: addr });
      var refreshed = await window.API.customers.getById(user.id);
      if (refreshed) {
        window.AppState.currentUser = Object.assign({}, window.AppState.currentUser, refreshed);
        window.saveAppState && window.saveAppState();
      }
    } else {
      window.AppState.currentUser = Object.assign({}, user, { shippingAddress: addr });
      window.saveAppState && window.saveAppState();
    }

    var profile = {};
    try {
      profile = JSON.parse(localStorage.getItem('yurui_profile') || '{}');
    } catch (e) {
      profile = {};
    }
    profile.shippingAddress = addr;
    delete profile.address;
    localStorage.setItem('yurui_profile', JSON.stringify(profile));

    window.dispatchEvent(
      new CustomEvent('yurui:shipping-address-updated', { detail: { address: addr, userId: user.id } })
    );

    return addr;
  }

  async function handleSave() {
    if (!sa()) return;
    if (!bindModalEvents()) return;

    var addr = readForm();
    var result = sa().validate(addr);
    if (!result.ok) {
      showFieldErrors(result.fieldErrors);
      return;
    }

    clearFormErrors();
    currentAddress = addr;
    var inst = instances.find(function (i) { return i.persist; }) || instances[0];
    try {
      await persistAddress(addr, inst || { persist: false });
      instances.forEach(function (item) {
        if (typeof item.onSave === 'function') item.onSave(addr);
      });
      renderAllDisplays();
      closeModal();
      window.showToast && window.showToast('配送地址已儲存', 'success');
    } catch (err) {
      console.error('Save shipping address failed', err);
      showFieldErrors({ shipAddressLine1: '配送地址儲存失敗，請稍後再試' });
      window.showToast && window.showToast('配送地址儲存失敗，請稍後再試', 'error');
    }
  }

  /** 綁定 Modal 事件；僅在 modal 存在於 DOM 時才標記完成 */
  function bindModalEvents() {
    var modal = $(MODAL_ID);
    if (!modal) return false;
    if (modalEventsBound) return true;

    var saveBtn = $('saveShippingAddressBtn');
    var cancelBtn = $('cancelShippingAddressBtn');
    var closeBtn = $('shippingAddressModalClose');

    if (saveBtn) saveBtn.addEventListener('click', handleSave);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });

    var citySelect = $(FIELD_IDS.city);
    if (citySelect) {
      citySelect.addEventListener('change', function () {
        fillDistrictSelect(citySelect.value, '');
      });
    }

    var form = $('shippingAddressForm');
    if (form && !form.dataset.fieldErrorsBound) {
      form.dataset.fieldErrorsBound = 'true';
      form.addEventListener('input', function (e) {
        if (e.target && e.target.classList.contains('isInvalid')) {
          clearSingleFieldError(e.target);
        }
      });
      form.addEventListener('change', function (e) {
        if (e.target && e.target.classList.contains('isInvalid')) {
          clearSingleFieldError(e.target);
        }
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('isOpen')) closeModal();
    });

    modalEventsBound = true;
    return true;
  }

  function bindModalOnce() {
    bindModalEvents();
  }

  function init(options) {
    if (!sa()) {
      console.warn('YuruiShippingAddress 尚未載入');
      return null;
    }

    options = options || {};
    var inst = {
      displayEl: options.displayEl || $('shippingAddressDisplay'),
      editBtn: options.editBtn || $('shippingAddressEditBtn'),
      getAddress: options.getAddress,
      onSave: options.onSave,
      persist: Boolean(options.persist),
    };

    if (options.initialAddress) {
      currentAddress = sa().clone(options.initialAddress);
    }

    if (inst.editBtn && !inst.editBtn.dataset.bound) {
      inst.editBtn.dataset.bound = 'true';
      inst.editBtn.addEventListener('click', function () {
        var addr = typeof inst.getAddress === 'function' ? inst.getAddress() : currentAddress;
        openModal(addr);
      });
    }

    instances.push(inst);
    bindModalOnce();
    renderAllDisplays();
    return inst;
  }

  function setAddress(addr) {
    currentAddress = sa() ? sa().clone(addr) : addr;
    renderAllDisplays();
  }

  function getAddress() {
    return sa() ? sa().clone(currentAddress) : currentAddress;
  }

  window.YuruiShippingAddressUI = {
    init: init,
    setAddress: setAddress,
    getAddress: getAddress,
    render: renderAllDisplays,
    open: openModal,
    close: closeModal,
    fillForm: fillForm,
    readForm: readForm,
    bindModal: bindModalEvents,
  };

  window.addEventListener('yurui:shipping-address-updated', function (e) {
    if (e.detail && e.detail.address) {
      currentAddress = sa() ? sa().clone(e.detail.address) : e.detail.address;
      renderAllDisplays();
    }
  });

  window.addEventListener('yurui:auth-changed', function () {
    instances.forEach(function (inst) {
      if (inst.persist && window.AppState?.isLoggedIn) {
        inst.persist = true;
      }
    });
  });
})();
