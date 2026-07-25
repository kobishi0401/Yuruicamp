import assert from 'node:assert/strict';
import fs from 'node:fs';

const products = JSON.parse(
  fs.readFileSync(new URL('../data/catalog/products.json', import.meta.url), 'utf8')
);
const facade = fs.readFileSync(new URL('../storefront/js/api-mock.js', import.meta.url), 'utf8');

assert.ok(products.length > 0);
for (const product of products) {
  assert.match(product.rating, /^\d+\.\d$/, `${product.id}.rating must use one decimal`);
  assert.ok(Number.isInteger(product.reviewCount) && product.reviewCount >= 0);
}
assert.match(facade, /'rating', 'reviewCount', 'variants'/);
assert.match(facade, /hasTags \? \[\.\.\.PRODUCT_CONTRACT_FIELDS, 'tags'\]/);
assert.match(facade, /enriched\.rating = Number\(product\.rating\)/);
assert.match(facade, /enriched\.reviewCount = product\.reviewCount/);
assert.match(facade, /_useMockApi\(\) \? _loadReviews\(\) : Promise\.resolve\(\[\]\)/);

console.log('Product rating contract checks passed');
