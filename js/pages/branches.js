const PARTNER_IMAGE_FALLBACK = 'https://picsum.photos/seed/partner-fallback/500/281';
const PARTNER_MODAL_ID = 'partnerModal';

let partnerModalScrollPosition = { x: 0, y: 0 };
let partnerModalTrigger = null;

/** 動態載入後的合作露營地列表（給卡片與 Modal 共用） / Loaded partners for cards + modal */
let partnerList = [];

function createElement(tagName, className, textContent = '') {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (textContent) element.textContent = textContent;
  return element;
}

function getReducedMotionBehavior() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function getBranchMapQuery(branch) {
  return branch.mapQuery || branch.address || branch.name || '';
}

function updateMap(mapQuery, address) {
  const iframe = document.getElementById('branchMapIframe');
  const directionsBtn = document.getElementById('directionsBtn');
  const safeMapQuery = encodeURIComponent(mapQuery || '');
  const safeAddress = encodeURIComponent(address || mapQuery || '');

  if (iframe) {
    iframe.src = `https://maps.google.com/maps?q=${safeMapQuery}&output=embed&hl=zh-TW`;
  }

  if (directionsBtn) {
    directionsBtn.href = `https://www.google.com/maps/search/?api=1&query=${safeAddress}`;
  }
}

function createBranchInfo(label, value) {
  const item = createElement('li', 'branchCardInfo');
  const labelElement = createElement('span', 'branchCardInfoIcon', label);
  const valueElement = createElement('span', 'branchCardInfoText', value || '未提供');

  item.append(labelElement, valueElement);
  return item;
}

function createBranchCard(branch, isSelected) {
  const button = createElement('button', `branchCard${isSelected ? ' isSelected' : ''}`);
  button.type = 'button';
  button.role = 'option';
  button.setAttribute('aria-selected', String(isSelected));
  button.dataset.branchId = branch.id || '';
  button.dataset.mapQuery = getBranchMapQuery(branch);
  button.dataset.address = branch.address || '';

  const title = createElement('span', 'branchCardTitle', branch.name || 'Yuruicamp 門市');
  const content = createElement('span', 'branchCardContent');
  const infoList = createElement('ul', 'branchCardInfoList');
  infoList.append(
    createBranchInfo('地址', branch.address),
    createBranchInfo('電話', branch.phone),
    createBranchInfo('營業', branch.hours)
  );

  const features = createElement('span', 'branchCardFeatures');
  (branch.features || []).forEach((feature) => {
    features.append(createElement('span', 'branchFeatureTag', feature));
  });

  content.append(infoList, features);
  button.append(title, content);
  return button;
}

function setBranchesState(container, stateClass) {
  container.classList.remove('isLoading', 'isError', 'isEmpty');
  if (stateClass) container.classList.add(stateClass);
}

function renderBranchError(container) {
  setBranchesState(container, 'isError');
  container.replaceChildren();

  const error = createElement('div', 'branchesErrorState');
  error.setAttribute('role', 'alert');
  error.append(
    createElement('span', 'branchesErrorIcon', 'i'),
    createElement('span', 'branchesErrorText', '載入分店資料失敗，請稍後再試。')
  );
  container.append(error);
}

function renderBranchEmpty(container) {
  setBranchesState(container, 'isEmpty');
  container.replaceChildren();

  const empty = createElement('div', 'branchesErrorState');
  empty.setAttribute('role', 'status');
  empty.append(
    createElement('span', 'branchesErrorIcon', 'i'),
    createElement('span', 'branchesErrorText', '目前沒有可顯示的門市。')
  );
  container.append(empty);
}

function selectBranchCard(container, selectedCard) {
  container.querySelectorAll('.branchCard').forEach((branchCard) => {
    const isSelected = branchCard === selectedCard;
    branchCard.classList.toggle('isSelected', isSelected);
    branchCard.setAttribute('aria-selected', String(isSelected));
  });

  updateMap(selectedCard.dataset.mapQuery, selectedCard.dataset.address);

  const mapWrap = document.getElementById('mapWrap');
  if (mapWrap && window.innerWidth < 992) {
    mapWrap.scrollIntoView({ behavior: getReducedMotionBehavior(), block: 'start' });
  }
}

async function fetchBranches() {
  if (window.API?.branches?.getAll) {
    return window.API.branches.getAll();
  }

  const path = (window.DataPaths && window.DataPaths.branches) || '/data/marketing/branches.json';
  const response = await fetch(path, { cache: 'no-store' });
  return response.json();
}

async function loadBranches() {
  const container = document.getElementById('branchList');
  if (!container) return;

  setBranchesState(container, 'isLoading');

  try {
    const branches = await fetchBranches();
    if (!Array.isArray(branches) || branches.length === 0) {
      renderBranchEmpty(container);
      return;
    }

    setBranchesState(container);
    const cards = branches.map((branch, index) => createBranchCard(branch, index === 0));
    container.replaceChildren(...cards);

    updateMap(getBranchMapQuery(branches[0]), branches[0].address);
  } catch (error) {
    console.error('Failed to load branches:', error);
    renderBranchError(container);
  }
}

function createTag(tagName) {
  return createElement('span', 'partnerTag', tagName);
}

/**
 * 取得預約／租借用的營地資料（與 camp-search 同源）
 * Fetch campgrounds used by booking/rental
 */
async function fetchCampgrounds() {
  if (window.BookingAPI?.getCampgrounds) {
    return window.BookingAPI.getCampgrounds();
  }

  const path =
    (window.DataPaths && window.DataPaths.campgrounds) || '/data/catalog/campgrounds.json';
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to fetch campgrounds');
  return response.json();
}

/**
 * 把營地 JSON 轉成卡片／Modal 需要的形狀
 * Map campground record → partner card shape
 */
function mapCampgroundToPartner(camp) {
  const tags = [...(camp.environmentTags || []), ...(camp.facilityTags || [])].slice(0, 4);
  const region = camp.region || '';

  return {
    id: camp.campgroundId,
    name: camp.name || '合作露營地',
    image: `https://picsum.photos/seed/${camp.campgroundId}/400/300`,
    tags,
    region,
    // 卡片預覽：顯示地區（不再顯示假優惠碼）/ Preview region instead of fake coupon
    discount: region ? `地區：${region}` : '',
    desc: camp.description || '',
  };
}

function createPartnerCard(partner, index) {
  const article = createElement('article', 'partnerCard');
  const trigger = createElement('button', 'partnerCardTrigger');
  trigger.type = 'button';
  trigger.dataset.partnerIndex = String(index);

  const imageWrap = createElement('span', 'partnerCardImageWrap');
  const image = createElement('img', 'partnerCardImage');
  image.src = partner.image;
  image.alt = partner.name;
  image.loading = 'lazy';
  image.addEventListener(
    'error',
    () => {
      image.src = PARTNER_IMAGE_FALLBACK;
    },
    { once: true }
  );
  imageWrap.append(image);

  const content = createElement('span', 'partnerCardContent');
  const title = createElement('span', 'partnerCardTitle', partner.name);
  const tags = createElement('span', 'partnerTags');
  (partner.tags || []).forEach((tag) => tags.append(createTag(tag)));
  const discount = createElement('span', 'partnerDiscountPreview', partner.discount);

  content.append(title, tags, discount);
  trigger.append(imageWrap, content);
  article.append(trigger);
  return article;
}

/**
 * 非同步載入並渲染合作露營地（套路同 loadBranches）
 * Async load + render partners (same pattern as loadBranches)
 */
async function loadPartners() {
  const container = document.getElementById('partnersGrid');
  if (!container) return;

  container.replaceChildren(createElement('div', 'branchesLoadingState', '載入合作露營地中...'));

  try {
    const camps = await fetchCampgrounds();
    if (!Array.isArray(camps) || camps.length === 0) {
      partnerList = [];
      container.replaceChildren(
        createElement('div', 'branchesErrorState', '目前沒有可顯示的合作露營地。')
      );
      return;
    }

    partnerList = camps.map(mapCampgroundToPartner);
    container.replaceChildren(
      ...partnerList.map((partner, index) => createPartnerCard(partner, index))
    );
  } catch (error) {
    console.error('Failed to load campgrounds for partners:', error);
    partnerList = [];
    container.replaceChildren(
      createElement('div', 'branchesErrorState', '載入合作露營地失敗，請稍後再試。')
    );
  }
}

function setPartnerModalImage(imageElement, partner) {
  imageElement.src = partner.image;
  imageElement.alt = partner.name;
  imageElement.addEventListener(
    'error',
    () => {
      imageElement.src = PARTNER_IMAGE_FALLBACK;
    },
    { once: true }
  );
}

function getPartnerBookingHref(campgroundId) {
  if (!campgroundId) return '../booking/pages/camp-search.html';
  return `../booking/pages/camp-detail.html?id=${encodeURIComponent(campgroundId)}`;
}

function openPartnerDetail(index) {
  const partner = partnerList[index];
  if (!partner) return;

  const titleElement = document.getElementById('partnerModalTitle');
  const imageElement = document.getElementById('partnerModalImg');
  const tagsElement = document.getElementById('partnerModalTags');
  const descElement = document.getElementById('partnerModalDesc');
  const regionElement = document.getElementById('partnerModalRegion');
  const bookingLink = document.getElementById('partnerModalBookingLink');

  if (titleElement) titleElement.textContent = partner.name;
  if (imageElement) setPartnerModalImage(imageElement, partner);
  if (tagsElement) {
    tagsElement.replaceChildren(
      ...(partner.tags || []).map((tag) =>
        createElement('span', 'partnerTag partnerModalTag', tag)
      )
    );
  }
  if (descElement) descElement.textContent = partner.desc;

  // 虛線區：左邊顯示地區，整塊連結到預約詳情頁
  // Dashed row: region on the left, whole block links to booking detail
  if (regionElement) regionElement.textContent = partner.region || '—';
  if (bookingLink) {
    bookingLink.href = getPartnerBookingHref(partner.id);
    bookingLink.setAttribute(
      'aria-label',
      `前往預約${partner.name ? `「${partner.name}」` : ''}`
    );
  }

  window.openModal?.(PARTNER_MODAL_ID);
}

/**
 * 開啟合作夥伴詳情並保留目前捲動位置，避免 Modal 聚焦造成頁面跳到最上方。
 * 套用元件：pages/branches.html 的 .partnerCardTrigger。
 */
function openPartnerDetailWithoutScrollJump(index, trigger) {
  partnerModalTrigger = trigger || document.activeElement;
  partnerModalScrollPosition = {
    x: window.scrollX,
    y: window.scrollY,
  };

  openPartnerDetail(index);

  window.requestAnimationFrame(() => {
    window.scrollTo(partnerModalScrollPosition.x, partnerModalScrollPosition.y);
  });
}

/**
 * 關閉合作夥伴詳情並還原原本捲動位置，避免 close button、背景遮罩或 Esc 把頁面帶到頂部。
 * 套用元件：pages/branches.html 的 #partnerModal。
 */
function closePartnerDetailWithoutScrollJump(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  window.closeModal?.(PARTNER_MODAL_ID);

  window.requestAnimationFrame(() => {
    window.scrollTo(partnerModalScrollPosition.x, partnerModalScrollPosition.y);
    if (partnerModalTrigger && document.contains(partnerModalTrigger)) {
      partnerModalTrigger.focus({ preventScroll: true });
    }
  });
}

function bindBranchSelection() {
  const container = document.getElementById('branchList');
  if (!container || container.dataset.branchesBound === 'true') return;
  container.dataset.branchesBound = 'true';

  container.addEventListener('click', (event) => {
    const selectedCard = event.target.closest('.branchCard');
    if (!selectedCard || !container.contains(selectedCard)) return;
    selectBranchCard(container, selectedCard);
  });
}

function bindPartnerGrid() {
  const partnersGrid = document.getElementById('partnersGrid');
  if (!partnersGrid || partnersGrid.dataset.partnersBound === 'true') return;
  partnersGrid.dataset.partnersBound = 'true';

  partnersGrid.addEventListener('click', (event) => {
    const trigger = event.target.closest('.partnerCardTrigger');
    if (!trigger || !partnersGrid.contains(trigger)) return;
    event.preventDefault();
    openPartnerDetailWithoutScrollJump(Number(trigger.dataset.partnerIndex), trigger);
  });
}

function bindPartnerModalCloseWithoutScrollJump() {
  const modal = document.getElementById(PARTNER_MODAL_ID);
  if (!modal || modal.dataset.partnerCloseScrollBound === 'true') return;
  modal.dataset.partnerCloseScrollBound = 'true';

  modal.addEventListener(
    'click',
    (event) => {
      const closeButton = event.target.closest('.partnerModalClose');
      const isBackdropClick = event.target === modal;
      if (!closeButton && !isBackdropClick) return;
      closePartnerDetailWithoutScrollJump(event);
    },
    true
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !modal.classList.contains('isOpen')) return;
      closePartnerDetailWithoutScrollJump(event);
    },
    true
  );
}

window.initBranchesPage = function initBranchesPage() {
  window._appComponentsInitialized = true;

  window.initNavbar?.();
  window.initModalListeners?.();
  window.initCartListeners?.();
  window.initPersonalizationModal?.();

  bindBranchSelection();
  bindPartnerGrid();
  bindPartnerModalCloseWithoutScrollJump();
  loadPartners();
  loadBranches();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.initBranchesPage);
} else {
  window.initBranchesPage();
}
