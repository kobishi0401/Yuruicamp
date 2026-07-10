const BLOG_DETAIL_DEFAULT_IMAGE = 'https://picsum.photos/seed/yurui-blog-detail-default/1200/640';

const blogDetailFallbackArticles = [
  {
    id: 'art-fallback-001',
    title: '第一次露營怎麼準備：從營位到裝備的完整清單',
    category: '新手教學',
    author: 'Yurui 編輯部',
    authorAvatar: 'https://picsum.photos/seed/yurui-editor/80/80',
    publishedDate: '2026-03-15',
    readTime: 8,
    image: 'https://picsum.photos/seed/yurui-blog-guide/1200/675',
    excerpt: '整理初次露營前最容易忽略的準備事項。',
    tags: ['新手教學', '裝備清單', '營地準備'],
    content: [
      { type: 'text', value: '第一次露營不需要一次買齊所有裝備，先確認營地條件、季節溫度與交通方式，再決定帳篷、睡袋、炊具與照明。' },
      { type: 'heading', value: '先確認營地與天氣' },
      { type: 'text', value: '營地是否有雨棚、電源、浴廁與平整營位，會直接影響你需要攜帶的裝備。出發前也要檢查降雨機率與夜間低溫。' },
      { type: 'product', productId: 'prod-001' },
      { type: 'heading', value: '建立可重複使用的檢查清單' },
      { type: 'text', value: '把睡眠、炊事、照明、個人用品與安全用品分區收納，撤收後補齊耗材，下次出發會更穩定。' },
    ],
  },
  {
    id: 'art-fallback-002',
    title: '北部週末露營景點：適合新手的 5 個營區',
    category: '景點推薦',
    author: 'Yurui 編輯部',
    authorAvatar: 'https://picsum.photos/seed/yurui-editor-2/80/80',
    publishedDate: '2026-04-02',
    readTime: 6,
    image: 'https://picsum.photos/seed/yurui-blog-camp/1200/675',
    excerpt: '用交通、衛浴、營位與親子友善程度快速篩選週末營區。',
    tags: ['景點推薦', '北部露營'],
    content: [{ type: 'text', value: '新手選營區時，建議優先挑選交通便利、浴廁乾淨且營主回覆清楚的地點。' }],
  },
  {
    id: 'art-fallback-003',
    title: '裝備評測：三季睡袋與保暖層搭配指南',
    category: '裝備評測',
    author: 'Yurui 編輯部',
    authorAvatar: 'https://picsum.photos/seed/yurui-editor-3/80/80',
    publishedDate: '2026-04-18',
    readTime: 7,
    image: 'https://picsum.photos/seed/yurui-blog-gear/1200/675',
    excerpt: '用溫標、填充材與收納體積判斷睡袋是否適合你的露營季節。',
    tags: ['裝備評測', '睡袋'],
    content: [{ type: 'text', value: '睡袋選擇要看舒適溫標，不只看極限溫標；搭配睡墊與保暖衣物才能維持整晚睡眠品質。' }],
  },
];

const blogDetailFallbackProducts = [
  {
    id: 'prod-001',
    name: '雙人快搭帳篷',
    price: 2990,
    image: 'https://picsum.photos/seed/yurui-product-tent/240/240',
  },
];

function blogDetailGetArticleId() {
  return new URLSearchParams(window.location.search).get('id');
}

function blogDetailEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function blogDetailFormatDate(dateStr) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function blogDetailReadTime(value) {
  return `${Number(value) || 1} 分鐘閱讀`;
}

function blogDetailMoney(value) {
  return `NT$ ${Number(value || 0).toLocaleString('zh-TW')}`;
}

async function blogDetailLoadJson(path, fallback) {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data : fallback;
  } catch (error) {
    console.warn(`Failed to load ${path}`, error);
    return fallback;
  }
}

async function blogDetailLoadAllArticles() {
  return blogDetailLoadJson('../data/articles.json', blogDetailFallbackArticles);
}

async function blogDetailLoadAllProducts() {
  return blogDetailLoadJson('../data/products.json', blogDetailFallbackProducts);
}

function blogDetailProductHref(product) {
  return `product-detail.html?id=${encodeURIComponent(product.id)}`;
}

function blogDetailArticleHref(article) {
  return `blog-detail.html?id=${encodeURIComponent(article.id)}`;
}

function blogDetailBuildInlineProductCard(product) {
  if (!product) {
    return '';
  }

  const image = product.image || `https://picsum.photos/seed/${encodeURIComponent(product.id)}/240/240`;

  return `
    <article class="blogInlineProductCard">
      <a class="blogInlineProductLink" href="${blogDetailProductHref(product)}" aria-label="查看商品 ${blogDetailEscape(product.name || '推薦商品')}">
        <img class="blogInlineProductImage" src="${blogDetailEscape(image)}" alt="${blogDetailEscape(product.name || '推薦商品')}" loading="lazy">
        <span class="blogInlineProductContent">
          <span class="blogInlineProductLabel">文章推薦商品</span>
          <span class="blogInlineProductTitle">${blogDetailEscape(product.name || '推薦商品')}</span>
          ${product.price ? `<span class="blogInlineProductPrice">${blogDetailEscape(blogDetailMoney(product.price))}</span>` : ''}
          <span class="blogInlineProductHint">查看商品明細</span>
        </span>
      </a>
    </article>
  `;
}

function blogDetailRenderContentItems(contentItems, allProducts) {
  if (!Array.isArray(contentItems) || !contentItems.length) {
    return '<p class="blogDetailEmptyState">這篇文章目前沒有內容。</p>';
  }

  return contentItems.map(item => {
    if (!item || !item.type) return '';

    if (item.type === 'text') {
      return `<p class="blogDetailParagraph">${blogDetailEscape(item.value)}</p>`;
    }

    if (item.type === 'heading') {
      return `<h2 class="blogDetailSectionTitle">${blogDetailEscape(item.value)}</h2>`;
    }

    if (item.type === 'product') {
      const product = allProducts.find(productItem => productItem.id === item.productId);
      return blogDetailBuildInlineProductCard(product);
    }

    return '';
  }).join('');
}

function blogDetailBuildRelatedArticleCard(article) {
  return `
    <article class="blogRelatedCard">
      <a class="blogRelatedLink" href="${blogDetailArticleHref(article)}" aria-label="閱讀相關文章 ${blogDetailEscape(article.title)}">
        <img class="blogRelatedImage" src="${blogDetailEscape(article.image || BLOG_DETAIL_DEFAULT_IMAGE)}" alt="${blogDetailEscape(article.title)}" loading="lazy">
        <span class="blogRelatedContent">
          <span class="blogRelatedCategory">${blogDetailEscape(article.category || '露營生活')}</span>
          <span class="blogRelatedArticleTitle">${blogDetailEscape(article.title)}</span>
        </span>
      </a>
    </article>
  `;
}

function blogDetailRenderError(message) {
  const contentEl = document.getElementById('articleContent');
  if (!contentEl) return;

  contentEl.classList.remove('isLoading');
  contentEl.classList.add('isError');
  contentEl.innerHTML = `
    <div class="blogDetailErrorState" role="alert">
      <strong>文章載入失敗</strong>
      <span>${blogDetailEscape(message)}</span>
      <a class="blogDetailErrorLink" href="blog.html">返回露營生活誌</a>
    </div>
  `;
}

function blogDetailSetText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function blogDetailRenderArticle(article, allArticles, allProducts) {
  document.title = `${article.title} - Yuruicamp 露營生活誌`;

  const heroImg = document.getElementById('articleHeroImg');
  if (heroImg) {
    heroImg.src = article.image || BLOG_DETAIL_DEFAULT_IMAGE;
    heroImg.alt = article.title;
  }

  blogDetailSetText('breadcrumbTitle', article.title.length > 24 ? `${article.title.slice(0, 24)}...` : article.title);
  blogDetailSetText('articleCategory', article.category || '露營生活');
  blogDetailSetText('articleAuthorName', article.author || 'Yurui 編輯部');
  blogDetailSetText('articleReadTime', blogDetailReadTime(article.readTime));
  blogDetailSetText('articleTitle', article.title);

  const avatarEl = document.getElementById('articleAuthorAvatar');
  if (avatarEl) {
    avatarEl.src = article.authorAvatar || 'https://picsum.photos/seed/yurui-author-default/80/80';
    avatarEl.alt = article.author || '作者頭像';
  }

  const dateEl = document.getElementById('articleDate');
  if (dateEl) {
    dateEl.textContent = blogDetailFormatDate(article.publishedDate);
    dateEl.setAttribute('datetime', article.publishedDate || '');
  }

  const contentEl = document.getElementById('articleContent');
  if (contentEl) {
    contentEl.classList.remove('isLoading', 'isError');
    contentEl.innerHTML = blogDetailRenderContentItems(article.content || [], allProducts);
  }

  const tagsEl = document.getElementById('articleTags');
  if (tagsEl) {
    const tags = Array.isArray(article.tags) ? article.tags : [];
    tagsEl.innerHTML = tags.map(tag => `<li class="blogDetailTag"># ${blogDetailEscape(tag)}</li>`).join('');
    tagsEl.classList.toggle('isEmpty', tags.length === 0);
  }

  const relatedSection = document.getElementById('relatedArticlesSection');
  const relatedGrid = document.getElementById('relatedArticlesGrid');
  if (!relatedGrid) return;

  const sameCategory = allArticles
    .filter(item => item.id !== article.id && item.category === article.category)
    .slice(0, 3);
  const related = sameCategory.length
    ? sameCategory
    : allArticles.filter(item => item.id !== article.id).slice(0, 3);

  if (!related.length) {
    relatedGrid.innerHTML = '<div class="blogDetailEmptyState">目前沒有相關文章。</div>';
    relatedSection?.classList.add('isEmpty');
    return;
  }

  relatedSection?.classList.remove('isEmpty');
  relatedGrid.innerHTML = related.map(blogDetailBuildRelatedArticleCard).join('');
}

window.initBlogDetailPage = async function () {
  window._appComponentsInitialized = true;

  if (typeof window.initNavbar === 'function') window.initNavbar();
  if (typeof window.initModalListeners === 'function') window.initModalListeners();
  if (typeof window.initCartListeners === 'function') window.initCartListeners();
  if (typeof window.initPersonalizationModal === 'function') window.initPersonalizationModal();

  const articleId = blogDetailGetArticleId();
  if (!articleId) {
    blogDetailRenderError('缺少文章 ID，無法載入文章內容。');
    return;
  }

  const [allArticles, allProducts] = await Promise.all([
    blogDetailLoadAllArticles(),
    blogDetailLoadAllProducts(),
  ]);

  const article = allArticles.find(item => item.id === articleId);
  if (!article) {
    blogDetailRenderError(`找不到文章 ${articleId}。`);
    return;
  }

  blogDetailRenderArticle(article, allArticles, allProducts);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.initBlogDetailPage);
} else {
  window.initBlogDetailPage();
}
