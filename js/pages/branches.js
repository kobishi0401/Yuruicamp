const PARTNER_IMAGE_FALLBACK = 'https://picsum.photos/seed/partner-fallback/500/281';

const PARTNER_DATA = [
  {
    name: '森谷露營區',
    image: 'https://picsum.photos/seed/partner1/400/300',
    tags: ['山林營位', '親子友善', '裝備租借'],
    discount: 'YURUI88 享 88 折',
    desc: '位於中海拔山區的寬敞營地，提供草地營位、衛浴設施與夜間照明，適合第一次露營的家庭與小型團體。',
  },
  {
    name: '湖畔野營俱樂部',
    image: 'https://picsum.photos/seed/partner2/400/300',
    tags: ['湖景', 'SUP 體驗', '寵物友善'],
    discount: 'LAKE100 折抵 NT$100',
    desc: '鄰近湖岸的輕量野營場域，白天可預約水上體驗，夜晚適合觀星與小型聚會。',
  },
  {
    name: '星野高原營地',
    image: 'https://picsum.photos/seed/partner3/400/300',
    tags: ['高海拔', '觀星', '團體包場'],
    discount: 'STAR15 享 85 折',
    desc: '高原草地與低光害環境是觀星愛好者的首選，營區提供團體包場與專人營位導引服務。',
  },
  {
    name: '杉木工作室',
    image: 'https://picsum.photos/seed/partner4/400/300',
    tags: ['木作課程', '咖啡', '選物店'],
    discount: 'WOOD10 享 9 折',
    desc: '結合戶外選物、木作課程與咖啡吧的複合空間，適合行前採買與午後休息。',
  },
  {
    name: '溪谷漫遊營地',
    image: 'https://picsum.photos/seed/partner5/400/300',
    tags: ['溪流', '夏季戲水', '車宿'],
    discount: 'RIVER200 折抵 NT$200',
    desc: '營位沿溪谷排列，夏季可安排安全戲水活動，也提供車宿與簡易電源配置。',
  },
  {
    name: '北海岸風格露營',
    image: 'https://picsum.photos/seed/partner6/400/300',
    tags: ['海景', '懶人露營', '餐食預訂'],
    discount: 'COAST12 享 88 折',
    desc: '面向海岸線的懶人露營區，提供帳篷搭設、餐食預訂與基礎裝備，適合週末短行程。',
  },
];

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
  (branch.features || []).forEach(feature => {
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
  container.querySelectorAll('.branchCard').forEach(branchCard => {
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

  const response = await fetch('../data/branches.json', { cache: 'no-store' });
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
  image.addEventListener('error', () => {
    image.src = PARTNER_IMAGE_FALLBACK;
  }, { once: true });
  imageWrap.append(image);

  const content = createElement('span', 'partnerCardContent');
  const title = createElement('span', 'partnerCardTitle', partner.name);
  const tags = createElement('span', 'partnerTags');
  partner.tags.forEach(tag => tags.append(createTag(tag)));
  const discount = createElement('span', 'partnerDiscountPreview', partner.discount);

  content.append(title, tags, discount);
  trigger.append(imageWrap, content);
  article.append(trigger);
  return article;
}

function renderPartners() {
  const container = document.getElementById('partnersGrid');
  if (!container) return;

  container.replaceChildren(...PARTNER_DATA.map((partner, index) => createPartnerCard(partner, index)));
}

function setPartnerModalImage(imageElement, partner) {
  imageElement.src = partner.image;
  imageElement.alt = partner.name;
  imageElement.addEventListener('error', () => {
    imageElement.src = PARTNER_IMAGE_FALLBACK;
  }, { once: true });
}

function openPartnerDetail(index) {
  const partner = PARTNER_DATA[index];
  if (!partner) return;

  const titleElement = document.getElementById('partnerModalTitle');
  const imageElement = document.getElementById('partnerModalImg');
  const tagsElement = document.getElementById('partnerModalTags');
  const descElement = document.getElementById('partnerModalDesc');
  const discountElement = document.getElementById('partnerModalDiscount');

  if (titleElement) titleElement.textContent = partner.name;
  if (imageElement) setPartnerModalImage(imageElement, partner);
  if (tagsElement) tagsElement.replaceChildren(...partner.tags.map(tag => createElement('span', 'partnerTag partnerModalTag', tag)));
  if (descElement) descElement.textContent = partner.desc;
  if (discountElement) discountElement.textContent = partner.discount;

  window.openModal?.('partnerModal');
}

/**
 * 開啟合作夥伴詳情並保留目前捲動位置，避免 Modal 聚焦造成頁面跳到最上方。
 * 套用元件：pages/branches.html 的 .partnerCardTrigger。
 */
function openPartnerDetailWithoutScrollJump(index) {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  openPartnerDetail(index);

  window.requestAnimationFrame(() => {
    window.scrollTo(scrollX, scrollY);
  });
}

function bindBranchSelection() {
  const container = document.getElementById('branchList');
  if (!container || container.dataset.branchesBound === 'true') return;
  container.dataset.branchesBound = 'true';

  container.addEventListener('click', event => {
    const selectedCard = event.target.closest('.branchCard');
    if (!selectedCard || !container.contains(selectedCard)) return;
    selectBranchCard(container, selectedCard);
  });
}

function bindPartnerGrid() {
  const partnersGrid = document.getElementById('partnersGrid');
  if (!partnersGrid || partnersGrid.dataset.partnersBound === 'true') return;
  partnersGrid.dataset.partnersBound = 'true';

  partnersGrid.addEventListener('click', event => {
    const trigger = event.target.closest('.partnerCardTrigger');
    if (!trigger || !partnersGrid.contains(trigger)) return;
    event.preventDefault();
    openPartnerDetailWithoutScrollJump(Number(trigger.dataset.partnerIndex));
  });
}

function bindPartnerModalActions() {
  const modal = document.getElementById('partnerModal');
  if (!modal || modal.dataset.partnerActionsBound === 'true') return;
  modal.dataset.partnerActionsBound = 'true';

  modal.addEventListener('click', event => {
    const action = event.target.closest('[data-action="use-partner-discount"]');
    if (!action || !modal.contains(action)) return;
    window.showToast?.('優惠已記錄，前往合作夥伴時出示即可。', 'success');
  });
}

window.initBranchesPage = function initBranchesPage() {
  window._appComponentsInitialized = true;

  window.initNavbar?.();
  window.initModalListeners?.();
  window.initCartListeners?.();
  window.initPersonalizationModal?.();

  bindBranchSelection();
  bindPartnerGrid();
  bindPartnerModalActions();
  renderPartners();
  loadBranches();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.initBranchesPage);
} else {
  window.initBranchesPage();
}
