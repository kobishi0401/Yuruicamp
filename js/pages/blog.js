let blogAllArticles = [];
let blogCurrentCategory = 'all';
let blogFeaturedArticle = null;

const blogFallbackArticles = [
  {
    id: 'art-fallback-001',
    title: '第一次露營怎麼準備：從營位到裝備的完整清單',
    image: 'https://picsum.photos/seed/yurui-blog-guide/1200/675',
    category: '新手教學',
    excerpt: '整理初次露營前最容易忽略的準備事項，包含營地選擇、睡眠系統、炊事安排與安全檢查。',
    author: 'Yurui 編輯部',
    authorAvatar: 'https://picsum.photos/seed/yurui-editor/80/80',
    publishedDate: '2026-03-15',
    readTime: 8,
    isFeatured: true,
  },
  {
    id: 'art-fallback-002',
    title: '北部週末露營景點：適合新手的 5 個營區',
    image: 'https://picsum.photos/seed/yurui-blog-camp/1200/675',
    category: '景點推薦',
    excerpt: '從交通、衛浴、營位平整度到親子友善程度，快速篩選適合週末出發的北部營區。',
    author: 'Yurui 編輯部',
    authorAvatar: 'https://picsum.photos/seed/yurui-editor-2/80/80',
    publishedDate: '2026-04-02',
    readTime: 6,
    isFeatured: false,
  },
  {
    id: 'art-fallback-003',
    title: '裝備評測：三季睡袋與保暖層搭配指南',
    image: 'https://picsum.photos/seed/yurui-blog-gear/1200/675',
    category: '裝備評測',
    excerpt: '用溫標、填充材與收納體積判斷睡袋是否適合你的露營季節與移動方式。',
    author: 'Yurui 編輯部',
    authorAvatar: 'https://picsum.photos/seed/yurui-editor-3/80/80',
    publishedDate: '2026-04-18',
    readTime: 7,
    isFeatured: false,
  },
  {
    id: 'art-fallback-004',
    title: '露營收納技巧：讓車廂與營桌都更好用',
    image: 'https://picsum.photos/seed/yurui-blog-storage/1200/675',
    category: '生活技巧',
    excerpt: '用分區收納、透明袋與常用物件優先級，降低搭帳與撤收時的混亂感。',
    author: 'Yurui 編輯部',
    authorAvatar: 'https://picsum.photos/seed/yurui-editor-4/80/80',
    publishedDate: '2026-05-01',
    readTime: 5,
    isFeatured: false,
  },
];

function blogFormatDate(dateStr) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function blogEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function blogNormalizeArticle(article) {
  return {
    id: article.id,
    title: article.title,
    image: article.image,
    category: article.category,
    excerpt: article.excerpt,
    author: article.author,
    authorAvatar: article.authorAvatar,
    publishedDate: article.publishedDate,
    readTime: article.readTime,
    isFeatured: article.isFeatured === true,
  };
}

function blogIsValidArticle(article) {
  return Boolean(
    article &&
      article.id &&
      article.title &&
      article.image &&
      article.category &&
      article.excerpt &&
      article.author &&
      article.authorAvatar &&
      article.publishedDate &&
      article.readTime !== undefined &&
      Object.prototype.hasOwnProperty.call(article, 'isFeatured'),
  );
}

function blogReadTime(value) {
  return `${Number(value) || 1} 分鐘閱讀`;
}

function blogArticleHref(article) {
  return `blog-detail.html?id=${encodeURIComponent(article.id)}`;
}

function blogBuildArticleCard(article) {
  return `
    <article class="blogArticleCard">
      <a class="blogArticleLink" href="${blogArticleHref(article)}" aria-label="閱讀 ${blogEscape(article.title)}">
        <span class="blogArticleImageWrap">
          <img class="blogArticleImage" src="${blogEscape(article.image)}" alt="${blogEscape(article.title)}" loading="lazy">
        </span>
        <span class="blogArticleContent">
          <span class="blogArticleTag">${blogEscape(article.category)}</span>
          <span class="blogArticleTitle">${blogEscape(article.title)}</span>
          <span class="blogArticleExcerpt">${blogEscape(article.excerpt)}</span>
          <span class="blogArticleMeta">
            <span class="blogArticleAuthor">
              <img class="blogArticleAuthorAvatar" src="${blogEscape(article.authorAvatar)}" alt="${blogEscape(article.author)}" loading="lazy">
              <span>${blogEscape(article.author)}</span>
            </span>
            <span class="blogArticleReadTime">${blogEscape(blogReadTime(article.readTime))}</span>
          </span>
        </span>
      </a>
    </article>
  `;
}

function blogRenderFeaturedArticle(article) {
  const container = document.getElementById('featuredArticle');
  if (!container || !article) return;

  container.classList.remove('isLoading');
  container.innerHTML = `
    <article class="blogFeaturedCard">
      <a class="blogFeaturedLink" href="${blogArticleHref(article)}" aria-label="閱讀精選文章 ${blogEscape(article.title)}">
        <img class="blogFeaturedImage" src="${blogEscape(article.image)}" alt="${blogEscape(article.title)}" loading="eager">
        <span class="blogFeaturedOverlay" aria-hidden="true"></span>
        <span class="blogFeaturedContent">
          <span class="blogFeaturedTag">${blogEscape(article.category)}</span>
          <span class="blogFeaturedTitle" id="blogFeaturedTitle">${blogEscape(article.title)}</span>
          <span class="blogFeaturedMeta">
            <span class="blogFeaturedAuthor">
              <img class="blogFeaturedAuthorAvatar" src="${blogEscape(article.authorAvatar)}" alt="${blogEscape(article.author)}" loading="lazy">
              <span>${blogEscape(article.author)}</span>
            </span>
            <span>${blogEscape(blogFormatDate(article.publishedDate))}</span>
            <span class="blogFeaturedReadTime">${blogEscape(blogReadTime(article.readTime))}</span>
          </span>
        </span>
      </a>
    </article>
  `;
}

function blogSetEmptyState(isEmpty) {
  const noArticles = document.getElementById('noArticles');
  if (!noArticles) return;

  noArticles.hidden = !isEmpty;
  noArticles.classList.toggle('isHidden', !isEmpty);
  noArticles.classList.toggle('isEmpty', isEmpty);
}

function blogRenderArticlesGrid(articles) {
  const grid = document.getElementById('articlesGrid');
  if (!grid) return;

  grid.classList.remove('isLoading');
  if (!articles.length) {
    grid.innerHTML = '';
    blogSetEmptyState(true);
    return;
  }

  blogSetEmptyState(false);
  grid.innerHTML = articles.map(blogBuildArticleCard).join('');
}

function blogRenderErrorState(message) {
  const featured = document.getElementById('featuredArticle');
  const grid = document.getElementById('articlesGrid');

  if (featured) {
    featured.classList.remove('isLoading');
    featured.innerHTML = `
      <div class="blogErrorState" role="alert">
        <strong>文章載入失敗</strong>
        <span>${blogEscape(message)}</span>
      </div>
    `;
  }

  if (grid) {
    grid.classList.remove('isLoading');
    grid.innerHTML = '';
  }

  blogSetEmptyState(true);
}

function blogUpdateCategoryButtons(category) {
  document.querySelectorAll('#categoryTabs .blogCategoryTab').forEach(button => {
    const isCurrentCategory = button.dataset.cat === category;
    button.classList.toggle('isActive', isCurrentCategory);
    button.setAttribute('aria-pressed', String(isCurrentCategory));
  });
}

function blogFilterByCategory(category) {
  blogCurrentCategory = category || 'all';
  blogUpdateCategoryButtons(blogCurrentCategory);

  let filtered = blogAllArticles.filter(article => article.id !== blogFeaturedArticle?.id);
  if (blogCurrentCategory !== 'all') {
    filtered = filtered.filter(article => article.category === blogCurrentCategory);
  }

  blogRenderArticlesGrid(filtered);
}

async function blogLoadArticles() {
  if (window.API && typeof window.API.articles?.getAll === 'function') {
    try {
      const data = await window.API.articles.getAll();
      if (Array.isArray(data) && data.length) return data;
    } catch (error) {
      console.warn('window.API.articles.getAll() failed, fallback to articles.json', error);
    }
  }

  try {
    const path = (window.DataPaths && window.DataPaths.articles) || '/data/marketing/articles.json';
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (Array.isArray(data) && data.length) return data;
  } catch (error) {
    console.warn('articles.json fallback failed, using built-in fallback articles', error);
  }

  return blogFallbackArticles;
}

function blogBindCategoryTabs() {
  const categoryTabs = document.getElementById('categoryTabs');
  if (!categoryTabs || categoryTabs.dataset.bound === 'true') return;

  categoryTabs.dataset.bound = 'true';
  categoryTabs.addEventListener('click', event => {
    const button = event.target.closest('.blogCategoryTab');
    if (!button) return;
    blogFilterByCategory(button.dataset.cat);
  });
}

window.initBlogPage = async function () {
  window._appComponentsInitialized = true;

  if (typeof window.initNavbar === 'function') window.initNavbar();
  if (typeof window.initModalListeners === 'function') window.initModalListeners();
  if (typeof window.initCartListeners === 'function') window.initCartListeners();
  if (typeof window.initPersonalizationModal === 'function') window.initPersonalizationModal();

  blogBindCategoryTabs();

  try {
    const loadedArticles = await blogLoadArticles();
    blogAllArticles = loadedArticles.filter(blogIsValidArticle).map(blogNormalizeArticle);

    if (!blogAllArticles.length) {
      blogRenderErrorState('找不到符合資料格式的文章。');
      return;
    }

    blogFeaturedArticle = blogAllArticles.find(article => article.isFeatured === true) || blogAllArticles[0];
    blogRenderFeaturedArticle(blogFeaturedArticle);
    blogFilterByCategory(blogCurrentCategory);
  } catch (error) {
    console.error('Blog page init failed:', error);
    blogRenderErrorState('請稍後再試，或返回首頁重新載入。');
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.initBlogPage);
} else {
  window.initBlogPage();
}
