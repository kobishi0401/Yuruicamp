/**
 * Browser smoke test — 中文顯示與亂碼檢查
 * Run: node tests/smoke-browser-encoding.mjs [baseUrl]
 * Requires: npm install (puppeteer) + dev server on baseUrl (default http://127.0.0.1:5173)
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const baseUrl = process.argv[2] || 'http://127.0.0.1:5173';

/** 常見 UTF-8 被誤讀後的亂碼特徵 / Common mojibake markers */
const MOJIBAKE_RE = [
  /\uFFFD/,
  /Ã[\u0080-\u00BF\u00C0-\u00FF]/,
  /â€[œ™]/,
  /æ[\u0080-\u00BF\u00C0-\u00FF]{2,}/,
  /擐㚚|蝭拚|鋆嘥|銝𠹺|皜��膄/,
];

const BOOKING_CART_FIXTURE = {
  booking_info: {
    campground_id: 'C005',
    campground_name: '南投清境高山營地',
    check_in: '2026-08-01',
    check_out: '2026-08-03',
    total_days: 2,
    weekday_count: 1,
    holiday_count: 1,
    guest_count: 2,
  },
  selected_zones: [
    {
      zone_id: 'Z001',
      zone_type: '草皮區',
      quantity: 1,
      subtotal: 2000,
    },
  ],
  selected_rentals: [],
  summary: {
    zone_total: 2000,
    rental_total: 0,
    applied_discount: 0,
    final_amount: 2000,
  },
};

const failures = [];
const passes = [];

function pass(label, detail = '') {
  passes.push({ label, detail });
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail = '') {
  failures.push({ label, detail });
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

function scanMojibake(text, context) {
  const sample = String(text || '').replace(/\s+/g, ' ').slice(0, 500);
  for (const re of MOJIBAKE_RE) {
    if (re.test(text)) {
      const hit = text.match(re)?.[0];
      fail(`${context} 疑似亂碼`, `pattern=${re} hit=${JSON.stringify(hit)} sample=${sample.slice(0, 120)}`);
      return false;
    }
  }
  return true;
}

function assertContains(text, expected, context) {
  if (!text.includes(expected)) {
    fail(`${context} 缺少預期中文`, `expected「${expected}」`);
    return false;
  }
  pass(`${context} 含「${expected}」`);
  return true;
}

async function waitForText(page, text, timeoutMs = 15000) {
  await page.waitForFunction(
    (needle) => document.body && document.body.innerText.includes(needle),
    { timeout: timeoutMs },
    text
  );
}

async function checkStaticHtml(relativePath, mustInclude) {
  const html = readFileSync(join(rootDir, relativePath), 'utf8');
  const isPartial =
    relativePath.endsWith('.partial') || relativePath.includes('/partials/');
  if (!isPartial) {
    const charsetOk = /<meta[^>]+charset\s*=\s*["']?utf-8/i.test(html);
    if (charsetOk) pass(`${relativePath} charset=UTF-8`);
    else fail(`${relativePath} charset=UTF-8`, '缺少 UTF-8 meta');
  }

  scanMojibake(html, `${relativePath} 原始 HTML`);
  mustInclude.forEach((word) => assertContains(html, word, relativePath));
}

async function checkJson(relativePath, mustInclude) {
  const raw = readFileSync(join(rootDir, relativePath), 'utf8');
  scanMojibake(raw, relativePath);
  const data = JSON.parse(raw);
  const blob = JSON.stringify(data);
  mustInclude.forEach((word) => assertContains(blob, word, relativePath));
}

async function checkPage(browser, path, options = {}) {
  const { mustInclude = [], setup, waitFor } = options;
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);

  if (setup) await setup(page);

  const url = `${baseUrl}${path}`;
  await page.goto(url, { waitUntil: 'networkidle2' });

  if (waitFor) {
    try {
      await waitForText(page, waitFor);
    } catch (err) {
      fail(`${path} 載入逾時`, `等待「${waitFor}」`);
      await page.close();
      return;
    }
  } else {
    await page.waitForSelector('body');
  }

  const bodyText = await page.evaluate(() => document.body.innerText);
  const title = await page.title();

  scanMojibake(title, `${path} document.title`);
  scanMojibake(bodyText, `${path} body`);

  if (options.titleIncludes) {
    assertContains(title, options.titleIncludes, `${path} title`);
  }

  mustInclude.forEach((word) => assertContains(bodyText, word, path));

  if (options.extra) await options.extra(page, bodyText);

  await page.close();
}

async function ensureServer(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) return null;
  } catch {
    // start vite below
  }

  console.log('啟動 Vite dev server…');
  const child = spawn('npm', ['run', 'dev'], {
    cwd: rootDir,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Vite 啟動逾時')), 45000);
    const onData = (chunk) => {
      const text = chunk.toString();
      if (text.includes('Local:') || text.includes('5173')) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
  });

  await ready;
  await new Promise((r) => setTimeout(r, 1500));
  return child;
}

console.log('\n=== 靜態檔 UTF-8 檢查 ===');
await checkStaticHtml('pages/home.html', ['首頁', '露營選物']);
await checkStaticHtml('pages/products.html', ['所有商品', '露營選物']);
await checkStaticHtml('pages/checkout.html', ['結帳', '手機']);
await checkStaticHtml('pages/member-center.html', ['會員中心']);
await checkStaticHtml('components/shipping-address-modal.partial', ['編輯配送地址', '手機']);
await checkStaticHtml('booking/pages/camp-rental.html', ['選擇租借裝備']);
await checkStaticHtml('booking/pages/booking-cart.html', ['確認背包']);
await checkStaticHtml('admin/partials/booking-calendar.html', ['預約排程面板', '營區', '營位類型', '公休']);
await checkStaticHtml('admin/partials/analytics.html', ['銷售額趨勢', '預約收入趨勢', '與上期比較']);

console.log('\n=== JSON 假資料中文 ===');
await checkJson('data/catalog/products.json', ['羽絨睡袋', '充氣式睡墊', '防水登山背包']);
await checkJson('data/catalog/camp-equipment.json', ['羽絨睡袋', '-10°C', '-5°C']);
await checkJson('data/catalog/campgrounds.json', ['草皮區', '雲海仙境露營區']);
await checkJson('data/admin/booking-policy.json', ['Asia/Taipei']);
await checkJson('data/admin/zone-blocks.json', ['草皮養護', '設施維修']);
await checkJson('data/admin/campground-closures.json', ['每週二公休', '設施年度檢修']);
await checkJson('data/admin/movement.json', ['（']);

const server = await ensureServer(baseUrl);

console.log(`\n=== 瀏覽器 smoke test (${baseUrl}) ===`);

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  await checkPage(browser, '/pages/home.html', {
    waitFor: '加入購物車',
    titleIncludes: '露營選物',
    mustInclude: ['加入購物車', '最新商品'],
    extra: async (page) => {
      const hasProduct = await page.evaluate(() =>
        Boolean(document.querySelector('.homeProductCard .homeProductName'))
      );
      if (hasProduct) pass('/pages/home.html 商品卡已渲染');
      else fail('/pages/home.html 商品卡已渲染', '找不到 .homeProductCard');
    },
  });

  await checkPage(browser, '/pages/products.html', {
    waitFor: '羽絨睡袋',
    mustInclude: ['羽絨睡袋', '加入購物車'],
    extra: async (page) => {
      const chipCount = await page.evaluate(() =>
        document.querySelectorAll('.productCardSpecChip').length
      );
      if (chipCount > 0) pass('/pages/products.html 規格 chip', `${chipCount} 個`);
      else fail('/pages/products.html 規格 chip', '未找到 .productCardSpecChip');
    },
  });

  await checkPage(browser, '/pages/product-detail.html?id=P004', {
    waitFor: '羽絨睡袋',
    mustInclude: ['羽絨睡袋', '加入購物車'],
  });

  await checkPage(browser, '/booking/pages/camp-rental.html', {
    setup: async (page) => {
      await page.evaluateOnNewDocument((cart) => {
        localStorage.setItem('bookingCart', JSON.stringify(cart));
      }, BOOKING_CART_FIXTURE);
    },
    waitFor: '羽絨睡袋',
    mustInclude: ['羽絨睡袋', '-10°C', '-5°C', '0°C'],
    extra: async (page) => {
      const cards = await page.evaluate(() =>
        [...document.querySelectorAll('.rentalItemCardName, .rentalItemCardNameBooking')]
          .map((el) => el.textContent.trim())
          .filter((t) => t.includes('羽絨睡袋'))
      );
      if (cards.length >= 3) pass('/booking camp-rental 羽絨睡袋卡片', `${cards.length} 張`);
      else fail('/booking camp-rental 羽絨睡袋卡片', `僅 ${cards.length} 張`);
    },
  });

  await checkPage(browser, '/data/catalog/products.json', {
    mustInclude: ['羽絨睡袋'],
  });

  await checkPage(browser, '/booking/pages/camp-detail.html?id=C002', {
    waitFor: '雲海仙境露營區',
    mustInclude: ['雲海仙境露營區', '草皮區', '選擇此類型'],
    extra: async (page) => {
      const hasZoneStock = await page.evaluate(() =>
        Boolean(document.querySelector('[data-zone-stock]'))
      );
      if (hasZoneStock) pass('/booking camp-detail 營位剩餘區塊');
      else fail('/booking camp-detail 營位剩餘區塊', '找不到 [data-zone-stock]');
    },
  });

  await checkPage(browser, '/admin/dashboard.html', {
    setup: async (page) => {
      await page.evaluateOnNewDocument(() => {
        sessionStorage.setItem('adminLoggedIn', 'true');
        sessionStorage.setItem('adminId', '01');
        sessionStorage.setItem('adminName', '王老闆');
        sessionStorage.setItem('isSuperAdmin', 'true');
        sessionStorage.setItem('adminPermissions', JSON.stringify({}));
      });
    },
    waitFor: '分析報表',
    mustInclude: ['分析報表'],
    extra: async (page) => {
      await page.click('.sidebar-link[data-section="booking-calendar"]');
      try {
        await waitForText(page, '預約排程面板', 15000);
        await waitForText(page, '剩', 15000);
        pass('/admin/dashboard 預約排程面板', 'section 已載入');
      } catch (err) {
        fail('/admin/dashboard 預約排程面板', '切換後未出現日曆內容');
        return;
      }
      const bodyText = await page.evaluate(() => document.body.innerText);
      scanMojibake(bodyText, '/admin/dashboard booking-calendar body');
      assertContains(bodyText, '草皮', '/admin/dashboard booking-calendar');
      assertContains(bodyText, '剩', '/admin/dashboard booking-calendar 剩餘');
      assertContains(bodyText, '公休', '/admin/dashboard booking-calendar 公休');
      assertContains(bodyText, '全部', '/admin/dashboard booking-calendar 全部');

      await page.click('.sidebar-link[data-section="analytics"]');
      try {
        await waitForText(page, '銷售額趨勢', 15000);
        pass('/admin/dashboard 分析報表', 'section 已載入');
      } catch (err) {
        fail('/admin/dashboard 分析報表', '切換後未出現分析內容');
        return;
      }
      const analyticsText = await page.evaluate(() => document.body.innerText);
      scanMojibake(analyticsText, '/admin/dashboard analytics body');
      assertContains(analyticsText, '銷售額趨勢', '/admin/dashboard analytics');

      const chartDualLine = await page.evaluate(() => {
        const canvas = document.getElementById('shopSalesLineChart');
        if (!canvas || typeof Chart === 'undefined') return null;
        const chart = Chart.getChart(canvas);
        if (!chart) return null;
        return (chart.data.datasets || []).map(function (ds) { return ds.label; });
      });
      if (chartDualLine && chartDualLine.indexOf('本期銷售額') >= 0 && chartDualLine.indexOf('上期銷售額') >= 0) {
        pass('/admin/dashboard 分析報表雙線圖例', chartDualLine.join(' / '));
      } else {
        fail('/admin/dashboard 分析報表雙線圖例', JSON.stringify(chartDualLine));
      }

      const hasDelta = await page.evaluate(() => {
        const el = document.querySelector('#shopLineTotalDelta');
        return el && /[+\-]/.test(el.textContent || '');
      });
      if (hasDelta) pass('/admin/dashboard 分析報表上期比較', 'shopLineTotalDelta 含 +/-');
      else fail('/admin/dashboard 分析報表上期比較', '找不到上期差額顯示');

      await page.click('#bookingTab');
      await waitForText(page, '預約收入趨勢', 10000);
      const bookingTabText = await page.evaluate(() => document.body.innerText);
      scanMojibake(bookingTabText, '/admin/dashboard analytics booking tab');
      assertContains(bookingTabText, '預約收入趨勢', '/admin/dashboard analytics booking tab');
    },
  });
} finally {
  await browser.close();
  if (server) {
    server.kill('SIGTERM');
  }
}

console.log('\n=== 結果 ===');
console.log(`通過: ${passes.length}  失敗: ${failures.length}`);

if (failures.length) {
  console.error('\n失敗清單:');
  failures.forEach((item) => console.error(` - ${item.label}: ${item.detail}`));
  process.exit(1);
}

console.log('Browser encoding smoke test passed');
