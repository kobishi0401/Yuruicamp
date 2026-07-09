/**
 * admin/js/reviews.js
 * 評論管理模組
 * Review management — browse, filter, search, sort, delete
 *
 * 使用 jQuery Event Namespace (.reviews) 防止重複導覽時事件堆疊
 * Data: /data/admin/reviews.json（種子）
 * 持久化：AdminAPI.reviews（後端就緒後）+ localStorage mockReviews（與前台共用）
 */

var REVIEWS_STORAGE_KEY = 'mockReviews';
var LEGACY_REVIEWS_STORAGE_KEY = 'adminReviews';

/** @type {{ allReviews: Array, searchQuery: string, ratingFilter: string, sortBy: string }} */
var reviewsState = {
  allReviews: [],
  searchQuery: '',
  ratingFilter: '',
  sortBy: 'date-desc',
};

window.initReviews = function () {
  $(document).off('.reviews');
  bindReviewEvents();

  loadReviews(function (reviews) {
    reviewsState.allReviews = reviews;
    applyFiltersAndRender();
    updateReviewCount();
  });
};

// ==========================================================
// === 資料載入 / 儲存（localStorage mock，未來可換 REST API）===
// ==========================================================

/**
 * 從 localStorage 或 JSON 種子載入評論
 * 後端啟用時改由 AdminAPI.reviews.list() 載入
 */
function loadReviews(callback) {
  if (typeof AdminAPI !== 'undefined' && AdminAPI.isBackendEnabled && AdminAPI.isBackendEnabled()) {
    AdminAPI.reviews.list()
      .then(function (res) {
        callback((res && res.data) || []);
      })
      .catch(function (err) {
        AdminAPI.handleError(err, '載入評論失敗');
        callback([]);
      });
    return;
  }

  /** 舊版 localStorage 可能仍用 R001 格式，轉為 REV001 */
  function normalizeLegacyReviewIds(reviews) {
    return (reviews || []).map(function (r) {
      if (r && /^R\d+$/.test(r.id)) {
        return Object.assign({}, r, { id: 'REV' + r.id.slice(1) });
      }
      return r;
    });
  }

  function finishLoad(seed) {
    var base = seed || [];
    if (typeof MockStorageMerge !== 'undefined') {
      var legacy = MockStorageMerge.readJsonStorage(LEGACY_REVIEWS_STORAGE_KEY, []);
      var overlay = MockStorageMerge.readJsonStorage(REVIEWS_STORAGE_KEY, []);
      base = MockStorageMerge.mergeById(base, legacy, 'id');
      base = MockStorageMerge.mergeById(base, overlay, 'id');
      if (legacy.length) {
        localStorage.removeItem(LEGACY_REVIEWS_STORAGE_KEY);
      }
    }
    callback(normalizeLegacyReviewIds(base));
  }

  $.getJSON(DataPaths.reviews, function (reviews) {
    finishLoad(reviews);
  }).fail(function () {
    $('#reviewsContainer').html(
      '<div class="alert alert-danger mb-0">' +
      '<i class="fas fa-exclamation-triangle me-2"></i>載入評論數據失敗' +
      '</div>'
    );
  });
}

/**
 * 持久化評論：先更新 state，再呼叫 AdminAPI；開發期另寫 localStorage 備援
 */
function saveReviews(reviews) {
  reviewsState.allReviews = reviews;

  if (typeof AdminAPI !== 'undefined' && AdminAPI.reviews) {
    AdminAPI.reviews.saveAll(reviews).catch(function (err) {
      AdminAPI.handleError(err, '同步評論失敗');
    });
  }

  if (!AdminAPI || !AdminAPI.isBackendEnabled || !AdminAPI.isBackendEnabled()) {
    localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(reviews));
  }
}

/** HTML 跳脫，防止 XSS / Escape HTML for safe rendering */
function escapeHtml(str) {
  return $('<div>').text(str || '').html();
}

// ==========================================================
// === 事件綁定 ===
// ==========================================================

function bindReviewEvents() {
  // 搜尋（即時）
  $(document).on('input.reviews', '#reviewSearchInput', function () {
    reviewsState.searchQuery = $(this).val().trim().toLowerCase();
    applyFiltersAndRender();
  });

  // 評分篩選
  $(document).on('change.reviews', '#reviewRatingFilter', function () {
    reviewsState.ratingFilter = $(this).val();
    applyFiltersAndRender();
  });

  // 排序
  $(document).on('change.reviews', '#reviewSortSelect', function () {
    reviewsState.sortBy = $(this).val();
    applyFiltersAndRender();
  });

  // 清除條件
  $(document).on('click.reviews', '#btnClearReviewFilters', function () {
    reviewsState.searchQuery = '';
    reviewsState.ratingFilter = '';
    reviewsState.sortBy = 'date-desc';

    $('#reviewSearchInput').val('');
    $('#reviewRatingFilter').val('');
    $('#reviewSortSelect').val('date-desc');

    applyFiltersAndRender();
  });

  // 刪除整則評論
  $(document).on('click.reviews', '.btn-delete-review', function () {
    var reviewId = $(this).data('review-id');
    deleteReview(reviewId);
  });
}

// ==========================================================
// === 篩選 / 排序 / 渲染 ===
// ==========================================================

function applyFiltersAndRender() {
  var filtered = filterReviews(reviewsState.allReviews);
  filtered = sortReviews(filtered);
  renderReviewCards(filtered);
  updateClearButtonVisibility();
}

/** 依搜尋、評分篩選 / Apply search and rating filters */
function filterReviews(reviews) {
  return reviews.filter(function (r) {
    if (reviewsState.ratingFilter) {
      var rating = Number(r.rating) || 0;
      if (reviewsState.ratingFilter === '1-2' && (rating < 1 || rating > 2)) return false;
      if (reviewsState.ratingFilter === '3' && rating !== 3) return false;
      if (reviewsState.ratingFilter === '4-5' && (rating < 4 || rating > 5)) return false;
    }

    if (reviewsState.searchQuery) {
      var q = reviewsState.searchQuery;
      var haystack = [
        r.id, r.buyerName, r.productName, r.comment,
      ].join(' ').toLowerCase();
      if (haystack.indexOf(q) === -1) return false;
    }

    return true;
  });
}

/** 排序評論列表 / Sort review list */
function sortReviews(reviews) {
  var list = reviews.slice();

  list.sort(function (a, b) {
    if (reviewsState.sortBy === 'date-desc') {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    }
    if (reviewsState.sortBy === 'rating-asc') {
      return (Number(a.rating) || 0) - (Number(b.rating) || 0);
    }
    if (reviewsState.sortBy === 'rating-desc') {
      return (Number(b.rating) || 0) - (Number(a.rating) || 0);
    }
    return 0;
  });

  return list;
}

/** 更新評論總數 / Update total review count */
function updateReviewCount() {
  $('#tabCountAll').text(reviewsState.allReviews.length);
}

/** 有非預設篩選時顯示「清除條件」/ Show clear button when filters active */
function updateClearButtonVisibility() {
  var hasExtra =
    reviewsState.searchQuery !== '' ||
    reviewsState.ratingFilter !== '' ||
    reviewsState.sortBy !== 'date-desc';

  $('#btnClearReviewFilters').toggleClass('d-none', !hasExtra);
}

/** 空狀態文案 / Empty state message */
function getReviewEmptyMessage() {
  if (reviewsState.searchQuery || reviewsState.ratingFilter) {
    return '找不到符合條件的評論';
  }
  return '目前沒有評論';
}

/**
 * 渲染星星評分（1–5 顆）
 * @param {number} rating
 */
function renderStars(rating) {
  var html = '';
  var r = Number(rating) || 0;
  for (var i = 1; i <= 5; i++) {
    html += i <= r
      ? '<i class="fas fa-star text-warning"></i>'
      : '<i class="far fa-star text-muted"></i>';
  }
  return html;
}

/** 低分評論左邊框標示（1–2 星需關注）/ Border class for low-rating cards */
function getReviewCardBorderClass(review) {
  var rating = Number(review.rating) || 0;
  if (rating <= 2) return ' review-card-urgent';
  return '';
}

/** 渲染買家附圖縮圖 / Render buyer photo thumbnails */
function renderReviewPhotos(photos) {
  if (!photos || !photos.length) return '';

  var thumbs = photos.map(function (url) {
    return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener" class="review-photo-thumb">' +
      '<img src="' + escapeHtml(url) + '" alt="評論附圖"' +
      ' onerror="this.parentElement.classList.add(\'d-none\')">' +
      '</a>';
  }).join('');

  return '<div class="review-photos d-flex flex-wrap gap-2 mt-2">' + thumbs + '</div>';
}

/**
 * 將 reviews 陣列渲染成單欄卡片清單
 * @param {Array} reviews
 */
function renderReviewCards(reviews) {
  if (!reviews || reviews.length === 0) {
    $('#reviewsContainer').html(
      '<div class="text-center text-muted py-5">' +
      '<i class="far fa-comment-dots fa-2x mb-2 d-block opacity-50"></i>' +
      escapeHtml(getReviewEmptyMessage()) +
      '</div>'
    );
    return;
  }

  var html = '<div class="row g-3">' +
    reviews.map(function (r) {
      var rating = Number(r.rating) || 0;
      var lowRatingBadge = rating <= 2
        ? '<span class="badge bg-danger ms-1">需關注</span>'
        : '';

      var avatarSrc = r.buyerAvatar || 'https://placehold.co/44x44/cccccc/555555?text=U';

      var deleteBtn =
        '<button type="button" class="btn btn-sm btn-outline-danger btn-delete-review"' +
        ' data-review-id="' + escapeHtml(r.id) + '">' +
        '<i class="fas fa-trash-alt me-1"></i>刪除評論</button>';

      return '<div class="col-12">' +
        '<div class="card shadow-sm review-card' + getReviewCardBorderClass(r) + '"' +
        ' data-review-id="' + escapeHtml(r.id) + '"' +
        ' data-rating="' + rating + '">' +
        '<div class="card-body">' +
        '<div class="d-flex align-items-start gap-3">' +
        '<img src="' + escapeHtml(avatarSrc) + '" width="44" height="44"' +
        ' class="rounded-circle border object-fit-cover flex-shrink-0"' +
        ' alt="' + escapeHtml(r.buyerName) + ' 頭像"' +
        ' onerror="this.src=\'https://placehold.co/44x44/cccccc/555555?text=U\'">' +
        '<div class="flex-grow-1 min-w-0">' +
        '<div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-1">' +
        '<div class="d-flex flex-wrap align-items-center gap-2">' +
        '<span class="fw-semibold">' + escapeHtml(r.buyerName) + '</span>' +
        '<span class="badge bg-secondary">' + escapeHtml(r.id) + '</span>' +
        lowRatingBadge +
        '</div>' +
        '<div class="review-card-stars">' + renderStars(rating) + '</div>' +
        '</div>' +
        '<div class="small text-muted mb-2">' +
        escapeHtml(r.createdAt) + ' · ' + escapeHtml(r.productName) +
        '</div>' +
        '<div class="review-buyer-comment">' +
        '<div class="small text-muted mb-1">買家評論</div>' +
        '<p class="mb-0">' + escapeHtml(r.comment) + '</p>' +
        renderReviewPhotos(r.photos) +
        '</div>' +
        '<div class="d-flex justify-content-end mt-3">' + deleteBtn + '</div>' +
        '</div></div>' +
        '</div></div></div>';
    }).join('') +
    '</div>';

  $('#reviewsContainer').html(html);

  if (typeof window.applyEditPermission === 'function') {
    window.applyEditPermission('reviews', $('#contentArea'));
  }
}

// ==========================================================
// === 刪除評論 ===
// ==========================================================

/**
 * 刪除整則評論（不可復原）
 * @param {string} reviewId
 */
function deleteReview(reviewId) {
  if (!window.confirm('確定要刪除此評論嗎？此操作無法復原。')) return;

  var updated = reviewsState.allReviews.filter(function (r) {
    return r.id !== reviewId;
  });

  saveReviews(updated);

  if (typeof AdminAPI !== 'undefined' && AdminAPI.reviews) {
    AdminAPI.reviews.remove(reviewId).catch(function (err) {
      AdminAPI.handleError(err, '刪除評論失敗');
    });
  }

  updateReviewCount();
  applyFiltersAndRender();
  window.showAdminToast('評論 ' + reviewId + ' 已刪除', 'warning');
}
