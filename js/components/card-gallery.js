/**
 * Card image gallery helper — Swiper (swipe/arrows) + GLightbox (zoom).
 * 商品卡／營地卡共用：左右切圖用 Swiper，點擊放大用 GLightbox。
 *
 * Prerequisites / 使用前請在頁面載入：
 * - Swiper CSS/JS (CDN or npm)
 * - GLightbox CSS/JS (CDN or npm)
 *
 * Usage / 用法：
 * 1. HTML: buildCardGalleryHtml({ images, alt, galleryId, ... })
 * 2. After DOM insert: initCardGalleries(rootElement)
 */

(function initCardGalleryModule(global) {
  /** @type {{ destroy?: () => void } | null} */
  let lightboxInstance = null;

  /**
   * Normalize image list from product/camp data.
   * 從商品或營地資料取出圖片陣列（優先 images[]，否則單張 image）。
   * @param {{ images?: string[], image?: string }} item
   * @returns {string[]}
   */
  function getItemImages(item) {
    if (!item) return [];
    if (Array.isArray(item.images) && item.images.length > 0) {
      return item.images.filter(Boolean);
    }
    return item.image ? [item.image] : [];
  }

  /**
   * Escape text for safe HTML attribute / text content.
   * 跳脫 HTML 特殊字元，避免 XSS。
   * @param {string} value
   * @returns {string}
   */
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Build Swiper + GLightbox markup for a card image area.
   * 產生卡片圖片區 HTML（輪播 + 可點擊放大）。
   *
   * @param {Object} options
   * @param {string[]} options.images - Image URLs / 圖片網址陣列
   * @param {string} options.alt - Alt text / 替代文字
   * @param {string} options.galleryId - Unique lightbox group id / 燈箱群組 id
   * @param {string} [options.wrapClass=''] - Extra class on outer wrap / 外層額外 class
   * @param {string} [options.badgeHtml=''] - Overlay badge HTML / 疊加徽章 HTML
   * @param {string} [options.fallbackSrc=''] - onerror placeholder / 載入失敗佔位圖
   * @returns {string}
   */
  function buildCardGalleryHtml(options) {
    const {
      images = [],
      alt = '',
      galleryId = 'card-gallery',
      wrapClass = '',
      badgeHtml = '',
      fallbackSrc = '',
    } = options || {};

    const list = images.length > 0 ? images : [];
    if (list.length === 0) {
      return `<div class="cardGallery ${wrapClass}"><div class="cardGalleryEmpty">No image</div></div>`;
    }

    const safeAlt = escapeHtml(alt);
    const safeGalleryId = escapeHtml(galleryId);
    const onErrorAttr = fallbackSrc
      ? ` onerror="this.onerror=null;this.src='${escapeHtml(fallbackSrc)}'"`
      : '';

    const slides = list
      .map((src, index) => {
        const safeSrc = escapeHtml(src);
        // No data-title: avoids GLightbox bottom white title bar / 不設標題，避免下方白條
        return `
          <div class="swiper-slide">
            <a href="${safeSrc}"
               class="glightbox card-gallery-glightbox"
               data-gallery="${safeGalleryId}">
              <img src="${safeSrc}"
                   alt="${safeAlt}${list.length > 1 ? ` ${index + 1}` : ''}"
                   loading="lazy"${onErrorAttr}>
            </a>
          </div>
        `;
      })
      .join('');

    // Only show nav when there is more than one image / 多圖才顯示箭頭與分頁點
    const navHtml =
      list.length > 1
        ? `
      <div class="swiper-button-prev cardGalleryNav" aria-label="上一張"></div>
      <div class="swiper-button-next cardGalleryNav" aria-label="下一張"></div>
      <div class="swiper-pagination cardGalleryDots"></div>
    `
        : '';

    return `
      <div class="cardGallery ${wrapClass}">
        <div class="swiper card-gallery-swiper">
          <div class="swiper-wrapper">${slides}</div>
          ${navHtml}
        </div>
        ${badgeHtml}
      </div>
    `;
  }

  /**
   * Destroy previous GLightbox instance if any.
   * 銷毀舊的燈箱實例，避免重複綁定。
   */
  function destroyLightbox() {
    if (lightboxInstance && typeof lightboxInstance.destroy === 'function') {
      lightboxInstance.destroy();
    }
    lightboxInstance = null;
  }

  /**
   * Init Swiper on each .card-gallery-swiper and one shared GLightbox.
   * 在 root 內初始化所有卡片輪播，並重建燈箱。
   * Call this AFTER inserting card HTML into the DOM.
   * 請在把卡片 HTML 插入 DOM 之後再呼叫。
   *
   * @param {ParentNode} [root=document]
   */
  function initCardGalleries(root = document) {
    if (typeof Swiper === 'undefined') {
      console.warn('[card-gallery] Swiper is not loaded');
      return;
    }

    const swipers = root.querySelectorAll('.card-gallery-swiper');
    swipers.forEach((el) => {
      // Re-init safe: destroy existing instance first / 先銷毀再重建
      if (el.swiper) {
        el.swiper.destroy(true, true);
      }

      // eslint-disable-next-line no-new
      new Swiper(el, {
        loop: false,
        nested: true,
        watchOverflow: true,
        resistanceRatio: 0.65,
        pagination: {
          el: el.querySelector('.swiper-pagination'),
          clickable: true,
        },
        navigation: {
          nextEl: el.querySelector('.swiper-button-next'),
          prevEl: el.querySelector('.swiper-button-prev'),
        },
      });
    });

    if (typeof GLightbox === 'undefined') {
      console.warn('[card-gallery] GLightbox is not loaded');
      return;
    }

    destroyLightbox();
    lightboxInstance = GLightbox({
      selector: '.card-gallery-glightbox',
      touchNavigation: true,
      loop: true,
      openEffect: 'fade',
      closeEffect: 'fade',
      // Hide description/title strip under the image / 隱藏圖片下方標題白條
      moreLength: 0,
    });
  }

  /**
   * True if the event target is gallery chrome (nav / lightbox / dots).
   * 判斷點擊是否落在輪播控制或燈箱連結上（不應觸發「進詳情頁」）。
   * @param {EventTarget | null} target
   * @returns {boolean}
   */
  function isCardGalleryInteractiveTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest(
        '.card-gallery-glightbox, .swiper-button-prev, .swiper-button-next, .swiper-pagination, .cardGalleryNav, .cardGalleryDots'
      )
    );
  }

  global.getItemImages = getItemImages;
  global.buildCardGalleryHtml = buildCardGalleryHtml;
  global.initCardGalleries = initCardGalleries;
  global.destroyCardGalleries = destroyLightbox;
  global.isCardGalleryInteractiveTarget = isCardGalleryInteractiveTarget;

  console.log('✓ card-gallery.js 已載入');
})(window);
