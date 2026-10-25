import './helpers/env.js';
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { closePool } from '../src/db/pool.js';
import { resetDatabase } from './helpers/database.js';
import { startTestServer } from './helpers/server.js';

let harness;
let client;

before(async () => {
  await resetDatabase();
  harness = await startTestServer();
  client = harness.client;
});

after(async () => {
  await harness?.close();
  await closePool();
});

test('categories are listed with product counts', async () => {
  const res = await client.get('/api/categories');

  assert.equal(res.status, 200);
  assert.equal(res.data.categories.length, 7);

  const sarees = res.data.categories.find((c) => c.slug === 'sarees');
  assert.equal(sarees.productCount, 4);
  assert.equal(sarees.name, 'Sarees');
  assert.ok('heroImageUrl' in sarees);
});

test('the catalogue returns every documented product field', async () => {
  const res = await client.get('/api/products?limit=100');

  assert.equal(res.status, 200);
  assert.equal(res.data.items.length, 17);
  assert.equal(res.data.pagination.total, 17);

  const fields = [
    'id', 'name', 'slug', 'sku', 'subcategory', 'description', 'price', 'compareAtPrice',
    'discountLabel', 'rating', 'reviewCount', 'stock', 'reorderPoint', 'colors', 'colorOptions',
    'sizes', 'fabric', 'occasion', 'collection', 'region', 'artisan', 'details', 'care',
    'tone', 'badge', 'isNew', 'isFeatured', 'isActive', 'category', 'categoryId',
    'categorySlug', 'images', 'createdAt', 'updatedAt'
  ];

  for (const product of res.data.items) {
    for (const field of fields) {
      assert.ok(field in product, `${product.name} is missing ${field}`);
    }
    assert.ok(Array.isArray(product.images) && product.images.length > 0);
    assert.ok(product.images.every((image) => image.src && typeof image.alt === 'string'));
    assert.ok(Array.isArray(product.colors));
    assert.ok(Array.isArray(product.sizes));
    assert.ok(Array.isArray(product.details));
    assert.ok(Array.isArray(product.care));
    assert.ok(product.colorOptions.every((c) => /^#[0-9A-Fa-f]{6}$/.test(c.hex)));
  }
});

test('a category can be selected by slug or by display name', async () => {
  const bySlug = await client.get('/api/products?category=sarees&limit=100');
  const byName = await client.get('/api/products?category=Sarees&limit=100');

  assert.equal(bySlug.status, 200);
  assert.equal(byName.status, 200);
  assert.equal(bySlug.data.items.length, 4);
  assert.equal(byName.data.items.length, 4);
});

test('search matches names and SKUs', async () => {
  const byName = await client.get('/api/products?search=kundan');
  const bySku = await client.get('/api/products?search=SC-JWL-101');

  assert.equal(byName.data.items.length, 1);
  assert.equal(byName.data.items[0].name, 'Kundan Bridal Choker');
  assert.equal(bySku.data.items.length, 1);
});

test('sort orders are honoured', async () => {
  const ascending = await client.get('/api/products?sort=price_asc&limit=100');
  const descending = await client.get('/api/products?sort=price_desc&limit=100');

  const asc = ascending.data.items.map((p) => p.price);
  const desc = descending.data.items.map((p) => p.price);

  assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
  assert.deepEqual(desc, [...desc].sort((a, b) => b - a));
});

test('price, stock and flag filters compose', async () => {
  const cheap = await client.get('/api/products?maxPrice=5000&limit=100');
  const pricey = await client.get('/api/products?minPrice=5000&limit=100');
  const inStock = await client.get('/api/products?inStock=true&limit=100');
  const featured = await client.get('/api/products?isFeatured=true&limit=100');

  assert.ok(cheap.data.items.every((p) => p.price <= 5000));
  assert.ok(pricey.data.items.every((p) => p.price >= 5000));
  assert.ok(inStock.data.items.every((p) => p.stock > 0));
  assert.ok(featured.data.items.every((p) => p.isFeatured));
});

test('pagination reports totals and returns an empty page past the end', async () => {
  const first = await client.get('/api/products?limit=5&page=1');
  const beyond = await client.get('/api/products?limit=5&page=99');

  assert.equal(first.data.items.length, 5);
  assert.equal(first.data.pagination.totalPages, 4);
  assert.deepEqual(beyond.data.items, []);
});

test('an invalid sort is rejected before reaching the database', async () => {
  const res = await client.get('/api/products?sort=nonsense');

  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, 'VALIDATION_ERROR');
});

test('inactive products stay hidden from the public catalogue', async () => {
  const res = await client.get('/api/products?includeInactive=true&limit=100');

  assert.ok(res.data.items.every((p) => p.isActive));
});

test('a product is retrievable by slug with related items', async () => {
  const list = await client.get('/api/products?category=sarees&limit=1');
  const target = list.data.items[0];

  const res = await client.get(`/api/products/${target.slug}`);

  assert.equal(res.status, 200);
  assert.equal(res.data.product.id, target.id);
  assert.ok(res.data.related.length > 0);
  assert.ok(res.data.related.every((p) => p.id !== target.id));
  assert.ok(res.data.related.every((p) => p.sku && Array.isArray(p.images)));
});

test('an unknown slug returns a structured 404', async () => {
  const res = await client.get('/api/products/no-such-product');

  assert.equal(res.status, 404);
  assert.equal(res.json.error.code, 'PRODUCT_NOT_FOUND');
});

test('the featured endpoint returns only featured products', async () => {
  const res = await client.get('/api/products/featured');

  assert.equal(res.status, 200);
  assert.ok(res.data.products.length > 0);
  assert.ok(res.data.products.every((p) => p.isFeatured && p.isActive));
});
