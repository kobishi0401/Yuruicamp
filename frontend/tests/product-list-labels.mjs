import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const productListSource = readFileSync(
  join(rootDir, 'storefront/js/pages/product-list.js'),
  'utf8',
);
const testExports = `
  window.__productLabelTest = {
    annotate: _annotateProductLabels,
    buildBadges: _buildProductBadges,
    filterByTag(products, tag) {
      _state.allProducts = products;
      _state.filters = {
        category: '',
        brands: [],
        minPrice: null,
        maxPrice: null,
        tag,
        keyword: '',
      };
      return _filterBySelectedOptions(products);
    },
  };
`;
const window = {};
const document = {
  readyState: 'loading',
  addEventListener: () => {},
};

// 驗證商品列表以後端 tags 判定標籤，並沿用新品與熱銷端點的排序順位。
vm.runInNewContext(
  `${productListSource}\n${testExports}`,
  {
    window,
    document,
    console,
    URLSearchParams,
    Set,
  },
  { filename: 'product-list.js' },
);

const products = [
  {
    id: 'P001',
    name: '新品帳篷',
    brand: 'Yuruicamp',
    category: '帳篷',
    description: '',
    price: 3200,
    tags: ['新品', '熱銷'],
  },
  {
    id: 'P002',
    name: '熱銷睡袋',
    brand: 'Yuruicamp',
    category: '睡袋',
    description: '',
    price: 1800,
    tags: ['熱銷'],
  },
  {
    id: 'P003',
    name: '一般商品',
    brand: 'Yuruicamp',
    category: '配件',
    description: '',
    price: 500,
    tags: [],
  },
];
const annotated = window.__productLabelTest.annotate(
  products,
  [products[0]],
  [products[0], products[1]],
);

assert.equal(annotated[0].isNew, true);
assert.equal(annotated[0].isBestseller, true);
assert.equal(annotated[1].isNew, false);
assert.equal(annotated[1].isBestseller, true);
assert.deepEqual(
  Array.from(window.__productLabelTest.filterByTag(annotated, 'new'), product => product.id),
  ['P001'],
);
assert.deepEqual(
  Array.from(
    window.__productLabelTest.filterByTag(annotated, 'bestseller'),
    product => product.id,
  ),
  ['P001', 'P002'],
);
assert.match(window.__productLabelTest.buildBadges(annotated[0]), />新品</);
assert.match(window.__productLabelTest.buildBadges(annotated[0]), />熱銷</);
assert.equal(window.__productLabelTest.buildBadges(annotated[2]), '');
assert.match(productListSource, /window\.API\.products\.getNewest\(100\)/);
assert.match(productListSource, /window\.API\.products\.getBestsellers\(100\)/);

console.log('Product list labels and quick filters passed');
