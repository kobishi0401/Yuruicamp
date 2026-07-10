/**
 * 下載商品假圖到 assets/images/products/
 * 每個商品 3 張圖，並更新 admin/data/products.json
 *
 * 執行：node admin/scripts/generate-product-images.cjs
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '../..');
const PRODUCTS_JSON = path.join(ROOT, 'admin/data/products.json');
const OUT_DIR = path.join(ROOT, 'assets/images/products');

// 依分類選不同 seed 前綴，讓同類商品圖片風格接近
// Pick seed prefix by category so similar products look related
const CATEGORY_SEED = {
  '帳篷': 'tent',
  '睡袋': 'sleep',
  '炊具': 'cook',
  '燈具': 'lamp',
  '背包': 'pack',
  '其他': 'gear',
};

function download(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume();
          download(res.headers.location, dest, redirectsLeft - 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${url}`));
          return;
        }

        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      })
      .on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const products = JSON.parse(fs.readFileSync(PRODUCTS_JSON, 'utf8'));
  let downloadCount = 0;

  for (const product of products) {
    const prefix = CATEGORY_SEED[product.category] || 'gear';
    const imagePaths = [];

    for (let i = 1; i <= 3; i += 1) {
      const filename = `${product.id}-${i}.jpg`;
      const filepath = path.join(OUT_DIR, filename);
      const seed = `${prefix}-${product.id}-${i}`;
      const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/600/450`;

      console.log(`[${++downloadCount}] 下載 ${product.id} ${product.name} → ${filename}`);
      await download(url, filepath);
      await sleep(150);

      imagePaths.push(`../assets/images/products/${filename}`);
    }

    product.thumbnail = imagePaths[0];
    product.images = imagePaths;
  }

  fs.writeFileSync(PRODUCTS_JSON, JSON.stringify(products, null, 2) + '\n', 'utf8');
  console.log(`\n完成！共下載 ${downloadCount} 張圖片，已更新 admin/data/products.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
