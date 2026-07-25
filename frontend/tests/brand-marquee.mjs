import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const apiSource = readFileSync(join(rootDir, 'storefront/js/api-mock.js'), 'utf8');
const homeSource = readFileSync(join(rootDir, 'storefront/js/pages/home.js'), 'utf8');
const calls = [];
const window = {
  AppConfig: { USE_MOCK_API: false },
  ApiClient: {
    _restRequest: async (path, options) => {
      calls.push({ path, options });

      return [{ id: 'coleman', name: 'Coleman', logoUrl: null }];
    },
  },
};

// 建立最小瀏覽器環境，驗證公開品牌 facade 不會夾帶登入 Token。
vm.runInNewContext(apiSource, { window, console }, { filename: 'api-mock.js' });

const brands = await window.API.marketing.getBrands();

assert.equal(brands[0].name, 'Coleman');
assert.equal(calls.length, 1);
assert.equal(calls[0].path, '/brands');
assert.equal(calls[0].options.auth, 'none');
assert(
  homeSource.includes("track.replaceChildren(fragment)"),
  '品牌跑馬燈應以安全 DOM 節點渲染兩組品牌',
);
assert(
  homeSource.includes("renderStatus('合作品牌暫時無法載入')"),
  '品牌 API 失敗時應保留可見狀態，不可讓區塊縮成 0 高度',
);
assert(
  !homeSource.includes('track.innerHTML'),
  '品牌名稱不可直接插入 innerHTML',
);

console.log('Brand marquee checks passed');
