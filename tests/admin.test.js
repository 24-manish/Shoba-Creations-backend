import './helpers/env.js';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import test, { after, before, beforeEach } from 'node:test';
import { closePool, query } from '../src/db/pool.js';
import { resetRateLimiters } from '../src/middleware/rate-limit.js';
import { uploadDirectory } from '../src/middleware/upload.js';
import { removeTestData, resetDatabase, truncateOrders } from './helpers/database.js';
import { startTestServer } from './helpers/server.js';

let harness;
let client;
let categoryId;

const ADMIN = { email: 'admin@shobacreations.com', password: 'TestAdmin@2026' };
const CUSTOMER = { email: 'meera@example.com', password: 'Shoba@2026' };

const productOf = (res) => res.data.product;

// The schema is rebuilt from the seed at the start of this file and the seed
// only upserts, so anything a test creates has to be removed again or the
// catalogue suite that follows counts 9 categories and 60 products.
const createdProducts = [];
const trackProduct = (id) => createdProducts.push(id);

const makeProduct = async (overrides = {}) => {
  const res = await client.post('/api/admin/products', {
    name: `Test Kurta ${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    description: 'A handloom cotton kurta used by the admin suite.',
    price: 4500,
    stock: 12,
    reorderPoint: 3,
    categoryId,
    ...overrides
  });

  assert.equal(res.status, 201, `could not create the product: ${res.text.slice(0, 300)}`);
  trackProduct(productOf(res).id);
  return productOf(res);
};

before(async () => {
  await resetDatabase();
  harness = await startTestServer();
  client = harness.client;

  const res = await client.get('/api/categories');
  categoryId = res.data.categories[0].id;
  assert.ok(categoryId, 'a category exists to attach products to');
});

after(async () => {
  // A product must go before the category it was filed under, or the category
  // delete trips the in-use guard.
  await removeTestData({ productIds: createdProducts });
  await harness?.close();
  await closePool();
});

beforeEach(async () => {
  resetRateLimiters();
  client.clearCookies();
  await client.signIn(ADMIN.email, ADMIN.password);
});

test('the dashboard reports order and revenue aggregates', async () => {
  const res = await client.get('/api/admin/dashboard');

  assert.equal(res.status, 200);

  // The summary is spread across the top level rather than nested.
  for (const key of [
    'totalOrders', 'awaitingFulfilment', 'cancelledOrders', 'ordersThisMonth',
    'revenueLifetime', 'revenueThisMonth', 'averageOrderValue'
  ]) {
    assert.ok(key in res.data, `the dashboard is missing ${key}`);
    assert.equal(typeof res.data[key], 'number', `${key} should be numeric`);
  }

  // statusCounts is a status -> count map, which is what a dashboard wants to
  // render directly.
  assert.equal(typeof res.data.statusCounts, 'object');
  assert.ok(Array.isArray(res.data.revenueByDay));
  assert.ok(Array.isArray(res.data.recentOrders));
  assert.ok(Array.isArray(res.data.lowStock));
  assert.ok(Array.isArray(res.data.bestSellers));
});

test('cancelled orders are excluded from revenue', async () => {
  const summary = (await client.get('/api/admin/dashboard')).data;

  const { rows } = await query(
    `SELECT COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled'), 0)::float8 AS revenue,
            COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
     FROM orders`
  );

  assert.equal(summary.revenueLifetime, Number(Number(rows[0].revenue).toFixed(2)));
  assert.equal(summary.cancelledOrders, rows[0].cancelled);
});

test('archived products are hidden from the admin list until includeInactive is passed', async () => {
  const product = await makeProduct();
  await client.delete(`/api/admin/products/${product.id}`);

  const hidden = await client.get('/api/admin/products?limit=100');
  assert.equal(hidden.status, 200);
  assert.ok(
    !hidden.data.items.some((p) => p.id === product.id),
    'the archived product stays out of the default admin list'
  );

  const shown = await client.get('/api/admin/products?limit=100&includeInactive=true');
  assert.equal(shown.status, 200);
  const found = shown.data.items.find((p) => p.id === product.id);
  assert.ok(found, 'the archived product appears once includeInactive=true');
  assert.equal(found.isActive, false);
});

test('an archived product disappears from the storefront and comes back on restore', async () => {
  const product = await makeProduct({ name: `Archivable ${Date.now()}` });

  const archived = await client.delete(`/api/admin/products/${product.id}`);
  assert.equal(archived.status, 200);
  assert.equal(productOf(archived).isActive, false);

  const hidden = await client.get(`/api/products/${product.slug}`);
  assert.equal(hidden.status, 404, 'the storefront hides it');

  const restored = await client.post(`/api/admin/products/${product.id}/restore`);
  assert.equal(restored.status, 200);
  assert.equal(productOf(restored).isActive, true);

  const visible = await client.get(`/api/products/${product.slug}`);
  assert.equal(visible.status, 200);
});

test('a duplicate product name gets a deterministic slug suffix', async () => {
  // A unique base per run keeps the first slug predictable even though earlier
  // runs leave their products behind.
  const base = `Chanderi Night Suit ${Date.now()}`;

  const first = await makeProduct({ name: base });
  const second = await makeProduct({ name: base });

  const baseSlug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  assert.equal(first.slug, baseSlug);
  assert.equal(second.slug, `${baseSlug}-2`);
});

test('renaming a product keeps its own slug when the name is unchanged', async () => {
  const product = await makeProduct({ name: 'Stable Slug Dress' });

  const res = await client.patch(`/api/admin/products/${product.id}`, { price: 5000 });

  assert.equal(res.status, 200);
  assert.equal(productOf(res).slug, product.slug, 'editing the price does not change the URL');
  assert.equal(productOf(res).price, 5000);
});

test('an invalid product is rejected with field-level detail', async () => {
  const res = await client.post('/api/admin/products', { name: 'x', price: -5 });

  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(res.json.error.details) && res.json.error.details.length > 0);
});

test('an unknown product id is a 404', async () => {
  const res = await client.patch(
    '/api/admin/products/1a33b166-dea0-435a-bdb8-eb29fe494f31',
    { price: 100 }
  );

  assert.equal(res.status, 404);
});

test('a malformed product id is a validation error, not a server error', async () => {
  const res = await client.patch('/api/admin/products/not-a-uuid', { price: 100 });

  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, 'VALIDATION_ERROR');
});

test('a SKU is generated automatically and is unique per product', async () => {
  const res = await client.post('/api/admin/products', {
    name: `Auto Sku Saree ${Date.now()}`,
    sku: 'CLIENT-PICKED-SKU',
    price: 4500,
    stock: 5,
    categoryId
  });

  assert.equal(res.status, 201, `create failed: ${res.text.slice(0, 300)}`);
  const product = productOf(res);
  assert.match(product.sku, /^SC-[A-Z0-9]{8}$/);
  assert.notEqual(product.sku, 'CLIENT-PICKED-SKU');
  trackProduct(product.id);

  // Two records never share a SKU with the auto-generation scheme.
  const second = await client.post('/api/admin/products', {
    name: `Auto Sku Kurta ${Date.now()}`,
    price: 3000,
    stock: 4,
    categoryId
  });
  assert.equal(second.status, 201);
  const secondProduct = productOf(second);
  assert.match(secondProduct.sku, /^SC-[A-Z0-9]{8}$/);
  assert.notEqual(secondProduct.sku, product.sku);
  trackProduct(secondProduct.id);
});;

test('images can be uploaded, reordered and deleted', async () => {
  const product = await makeProduct();

  // A 1x1 PNG, built in memory so the suite does not depend on a fixture file.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );

  const form = new FormData();
  form.append('images', new Blob([png], { type: 'image/png' }), 'one.png');
  form.append('images', new Blob([png], { type: 'image/png' }), 'two.png');

  const uploaded = await client.upload(`/api/admin/products/${product.id}/images`, form);
  assert.equal(uploaded.status, 201, `upload failed: ${uploaded.text.slice(0, 300)}`);

  // Upload, reorder and delete all answer with the updated product, and the
  // gallery carries id/position/src/alt in every one of them, so the editor can
  // reorder and delete straight from the response.
  const images = uploaded.data.product.images;
  assert.equal(images.length, 2);
  assert.deepEqual(
    images.map((image) => image.position),
    [0, 1],
    'the gallery is ordered by position'
  );
  assert.ok(images.every((image) => image.id), 'each image carries its id so it can be reordered or deleted');
  assert.ok(images.every((image) => image.src.startsWith('/uploads/')), 'each image points at the uploads directory');
  assert.ok(
    images.every((image) => typeof image.alt === 'string' && image.alt.length > 0),
    'each image has alt text'
  );

  const fetched = await client.get(`/api/products/${product.slug}`);
  assert.equal(fetched.data.product.images.length, 2, 'the storefront shows both images');
  assert.deepEqual(
    fetched.data.product.images.map((image) => image.src),
    images.map((image) => image.src),
    'the storefront and the admin view describe the gallery identically'
  );

  const reordered = await client.put(`/api/admin/products/${product.id}/images`, {
    imageIds: [images[1].id, images[0].id]
  });
  assert.equal(reordered.status, 200, `reorder failed: ${reordered.text.slice(0, 200)}`);
  assert.deepEqual(
    reordered.data.product.images.map((image) => image.src),
    [images[1].src, images[0].src],
    'the new order is reflected in the gallery'
  );
  assert.deepEqual(
    reordered.data.product.images.map((image) => image.position),
    [0, 1],
    'positions are renumbered so they stay contiguous'
  );

  const removed = await client.delete(`/api/admin/products/${product.id}/images/${images[0].id}`);
  assert.equal(removed.status, 200, `delete failed: ${removed.text.slice(0, 200)}`);
  assert.deepEqual(
    removed.data.product.images.map((image) => image.src),
    [images[1].src],
    'delete answers with the remaining gallery rather than a bare id'
  );
  assert.ok(
    removed.data.product.images.every((image) => image.id !== images[0].id),
    'the deleted image is gone'
  );

  const after = await client.get(`/api/products/${product.slug}`);
  assert.equal(after.data.product.images.length, 1, 'the storefront drops the deleted image');
  assert.equal(after.data.product.images[0].src, images[1].src);
});

test('a file that is not an image is rejected', async () => {
  const product = await makeProduct();
  const form = new FormData();
  form.append('images', new Blob([Buffer.from('not an image')], { type: 'text/plain' }), 'notes.txt');

  const res = await client.upload(`/api/admin/products/${product.id}/images`, form);

  assert.ok(res.status >= 400, `expected a rejection, got ${res.status}`);
});

test('a permanent delete removes the product everywhere', async () => {
  const product = await makeProduct({ name: `Purge Me ${Date.now()}` });

  const res = await client.delete(`/api/admin/products/${product.id}/permanent`);
  assert.equal(res.status, 200);
  assert.equal(res.data.product.id, product.id);
  assert.equal(res.data.product.name, product.name);

  const hidden = await client.get(`/api/products/${product.slug}`);
  assert.equal(hidden.status, 404, 'the storefront no longer serves it');

  const listed = await client.get('/api/admin/products?limit=100');
  assert.ok(
    !listed.data.items.some((p) => p.id === product.id),
    'the admin list drops the purged product entirely'
  );
});

test('a permanent delete refuses a product that carries order history', async () => {
  await truncateOrders();

  // The forbidden product is a freshly created one so purging it (with force,
  // below) never removes a seeded row the catalogue suites still count.
  const product = await makeProduct({ name: `Order-Linked ${Date.now()}` });

  client.clearCookies();
  await client.signIn(CUSTOMER.email, CUSTOMER.password);

  await client.post('/api/cart/items', { productId: product.id, quantity: 1 });
  const placed = await client.post('/api/orders', {
    shippingName: 'Meera Chen',
    shippingEmail: 'meera@example.com',
    shippingPhone: '+91 98765 43210',
    shippingAddress: '12 MG Road',
    shippingCity: 'Bengaluru',
    shippingState: 'Karnataka',
    shippingPincode: '560001',
    shippingMethod: 'standard',
    paymentMethod: 'cod'
  });
  assert.equal(placed.status, 201, `could not place the order: ${placed.text.slice(0, 200)}`);
  const orderNumber = placed.data.order.orderNumber;

  client.clearCookies();
  await client.signIn(ADMIN.email, ADMIN.password);

  const refused = await client.delete(`/api/admin/products/${product.id}/permanent`);
  assert.equal(refused.status, 409);
  assert.equal(refused.json.error.code, 'PRODUCT_IN_ORDER_HISTORY');

  const forced = await client.delete(`/api/admin/products/${product.id}/permanent?force=true`);
  assert.equal(forced.status, 200);

  // The order survives the purge; the line keeps its snapshot with a null link.
  const order = await client.get(`/api/admin/orders/${orderNumber}`);
  assert.equal(order.status, 200);
  assert.equal(order.data.order.orderNumber, orderNumber);
});

test('bulk archive records many products at once', async () => {
  const first = await makeProduct();
  const second = await makeProduct();

  const res = await client.post('/api/admin/products/bulk-archive', {
    productIds: [first.id, second.id]
  });

  assert.equal(res.status, 200);
  assert.deepEqual(res.data.productIds.sort(), [first.id, second.id].sort());

  const listed = await client.get('/api/admin/products?limit=100&includeInactive=true');
  const found = listed.data.items.filter((p) => [first.id, second.id].includes(p.id));
  assert.equal(found.length, 2);
  assert.ok(found.every((p) => p.isActive === false), 'both are archived');

  const storefront = await client.get('/api/products?limit=100');
  assert.ok(
    !storefront.data.items.some((p) => [first.id, second.id].includes(p.id)),
    'neither appears in the public catalogue'
  );
});

test('bulk restore brings archived products back to the storefront', async () => {
  const first = await makeProduct();
  const second = await makeProduct();

  await client.post('/api/admin/products/bulk-archive', {
    productIds: [first.id, second.id]
  });

  const res = await client.post('/api/admin/products/bulk-restore', {
    productIds: [first.id, second.id]
  });

  assert.equal(res.status, 200);
  assert.deepEqual(res.data.productIds.sort(), [first.id, second.id].sort());

  const storefront = await client.get('/api/products?limit=100');
  const restored = storefront.data.items.filter((p) => [first.id, second.id].includes(p.id));
  assert.equal(restored.length, 2, 'both are live again in the public catalogue');
  assert.ok(restored.every((p) => p.isActive === true));
});

test('bulk purge requires an explicit force once order history exists', async () => {
  await truncateOrders();

  const clean = await makeProduct();

  // The "dirty" product is freshly created (not seeded) so force-purging it
  // cannot change the count-based assertions later suites rely on.
  const referenced = await makeProduct();

  client.clearCookies();
  await client.signIn(CUSTOMER.email, CUSTOMER.password);

  await client.post('/api/cart/items', { productId: referenced.id, quantity: 1 });
  const placed = await client.post('/api/orders', {
    shippingName: 'Meera Chen',
    shippingEmail: 'meera@example.com',
    shippingPhone: '+91 98765 43210',
    shippingAddress: '12 MG Road',
    shippingCity: 'Bengaluru',
    shippingState: 'Karnataka',
    shippingPincode: '560001',
    shippingMethod: 'standard',
    paymentMethod: 'cod'
  });
  assert.equal(placed.status, 201);

  client.clearCookies();
  await client.signIn(ADMIN.email, ADMIN.password);

  // One bad apple poisons the whole basket.
  const refused = await client.post('/api/admin/products/bulk-purge', {
    productIds: [clean.id, referenced.id]
  });
  assert.equal(refused.status, 409);

  const forced = await client.post('/api/admin/products/bulk-purge', {
    productIds: [clean.id, referenced.id],
    force: true
  });
  assert.equal(forced.status, 200);
  assert.equal(forced.data.products.length, 2);

  const listed = await client.get('/api/admin/products?limit=100');
  assert.ok(!listed.data.items.some((p) => p.id === clean.id || p.id === referenced.id));
});

test('purge cleans the product images up from disk', async () => {
  const product = await makeProduct();

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const form = new FormData();
  form.append('images', new Blob([png], { type: 'image/png' }), 'one.png');

  const uploaded = await client.upload(`/api/admin/products/${product.id}/images`, form);
  assert.equal(uploaded.status, 201);

  const src = uploaded.data.product.images[0].src;
  const filename = src.split('/').pop();
  const filePath = path.join(uploadDirectory, filename);
  assert.equal(await access(filePath).then(() => true, () => false), true, 'the file exists on disk');

  await client.delete(`/api/admin/products/${product.id}/permanent`);
  assert.equal(await access(filePath).then(() => true, () => false), false, 'the file is removed with the product');
});

test('the admin order list can filter by status and search', async () => {
  await truncateOrders();

  const all = await client.get('/api/admin/orders');
  assert.equal(all.status, 200);
  assert.equal(all.data.orders.length, 0, 'the order table starts empty for this suite');

  const search = await client.get('/api/admin/orders?search=SC-');
  assert.equal(search.status, 200);
});

test('the admin order detail offers only the legal next steps', async () => {
  await truncateOrders();

  // Place a real order through the storefront so the admin view has something to
  // render, rather than relying on whatever the seed left behind.
  client.clearCookies();
  await client.signIn(CUSTOMER.email, CUSTOMER.password);

  const product = (await client.get('/api/products?limit=1')).data.items[0];
  assert.equal((await client.post('/api/cart/items', { productId: product.id, quantity: 1 })).status, 200);

  const placed = await client.post('/api/orders', {
    shippingName: 'Meera Chen',
    shippingEmail: 'meera@example.com',
    shippingPhone: '+91 98765 43210',
    shippingAddress: '12 MG Road',
    shippingCity: 'Bengaluru',
    shippingState: 'Karnataka',
    shippingPincode: '560001',
    shippingMethod: 'standard',
    paymentMethod: 'cod'
  });
  assert.equal(placed.status, 201, `could not place the order: ${placed.text.slice(0, 200)}`);
  const orderNumber = placed.data.order.orderNumber;

  client.clearCookies();
  await client.signIn(ADMIN.email, ADMIN.password);

  const res = await client.get(`/api/admin/orders/${orderNumber}`);

  assert.equal(res.status, 200);
  assert.equal(res.data.order.orderNumber, orderNumber);
  assert.ok(res.data.order.items.length > 0, 'the admin view includes the line items');
  assert.ok(Array.isArray(res.data.availableTransitions));
  assert.deepEqual(res.data.availableTransitions, ['packed', 'cancelled']);
});

test('low stock lists products at or below their reorder point', async () => {
  const product = await makeProduct({ stock: 2, reorderPoint: 5 });

  const res = await client.get('/api/admin/low-stock?limit=100');
  assert.equal(res.status, 200);

  const found = res.data.products.find((p) => p.id === product.id);
  assert.ok(found, 'a product below its reorder point is listed');
  assert.ok(found.stock <= found.reorderPoint);
});

test('categories can be listed, created, renamed and removed', async () => {
  const listed = await client.get('/api/admin/categories');
  assert.equal(listed.status, 200);
  assert.ok(listed.data.categories.length >= 7);

  const createdCategory = await client.post('/api/admin/categories', {
    name: `Test Category ${Date.now()}`,
    slug: `test-category-${Date.now()}`,
    description: 'Created by the admin suite.'
  });
  assert.equal(createdCategory.status, 201);

  const category = createdCategory.data.category;
  assert.match(category.slug, /^test-category-\d+$/);

  const renamed = await client.patch(`/api/admin/categories/${category.id}`, { name: 'Renamed Category' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.data.category.name, 'Renamed Category');

  const removed = await client.delete(`/api/admin/categories/${category.id}`);
  assert.equal(removed.status, 200);
});

test('a category that still has products cannot be deleted', async () => {
  const res = await client.delete(`/api/admin/categories/${categoryId}`);

  assert.equal(res.status, 409);
  assert.equal(res.json.error.code, 'CATEGORY_IN_USE');
});

test('the customer list is available to admins', async () => {
  const res = await client.get('/api/admin/users');

  assert.equal(res.status, 200);
  assert.ok(res.data.users.length > 0);
  assert.ok(res.data.users.every((user) => user.passwordHash === undefined));
});

test('admin routes are closed to customers and to anonymous callers', async () => {
  client.clearCookies();
  await client.get('/api/auth/csrf');
  const anonymous = await client.get('/api/admin/dashboard');
  assert.equal(anonymous.status, 401);

  client.clearCookies();
  await client.signIn(CUSTOMER.email, CUSTOMER.password);
  const customer = await client.get('/api/admin/dashboard');
  assert.equal(customer.status, 403);
  assert.equal(customer.json.error.code, 'FORBIDDEN');
});
