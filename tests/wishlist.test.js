import './helpers/env.js';
import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { closePool, query } from '../src/db/pool.js';
import { resetRateLimiters } from '../src/middleware/rate-limit.js';
import { resetDatabase } from './helpers/database.js';
import { startTestServer } from './helpers/server.js';

let harness;
let client;
let product;
let other;

const CUSTOMER = { email: 'meera@example.com', password: 'Shoba@2026' };
// Wishlist endpoints answer { wishlist }; the object itself is the payload.
const wl = (res) => res.data.wishlist;
const idsIn = (wishlist) => wishlist.items.map((p) => p.id);

before(async () => {
  await resetDatabase();
  harness = await startTestServer();
  client = harness.client;

  const res = await client.get('/api/products?limit=100');
  const list = res.data.items;
  product = list.find((p) => p.slug === 'kundan-bridal-choker');
  other = list.find((p) => p.slug === 'madder-lipstick');
});

after(async () => {
  await harness?.close();
  await closePool();
});

beforeEach(async () => {
  resetRateLimiters();
  client.clearCookies();
  await client.signIn(CUSTOMER.email, CUSTOMER.password);
  assert.equal((await client.delete('/api/wishlist')).status, 200);
});

test('a new wishlist is empty', async () => {
  const res = await client.get('/api/wishlist');

  assert.equal(res.status, 200);
  assert.deepEqual(wl(res).items, []);
  assert.equal(wl(res).count, 0);
});

test('an item can be added and is returned as a full product', async () => {
  const res = await client.post(`/api/wishlist/${product.id}`);

  assert.equal(res.status, 200);
  assert.equal(wl(res).count, 1);

  const [item] = wl(await client.get('/api/wishlist')).items;
  assert.equal(item.id, product.id);
  assert.equal(item.slug, product.slug);
  assert.equal(item.name, product.name);
  assert.equal(item.price, product.price);
  assert.ok(Array.isArray(item.images) && item.images.length > 0);
});

test('adding the same item twice does not duplicate it', async () => {
  await client.post(`/api/wishlist/${product.id}`);
  const res = await client.post(`/api/wishlist/${product.id}`);

  assert.equal(res.status, 200);
  assert.equal(wl(res).count, 1);
});

test('wishlist items are returned newest first', async () => {
  await client.post(`/api/wishlist/${product.id}`);
  const res = await client.post(`/api/wishlist/${other.id}`);

  // The most recently saved product leads the list.
  assert.deepEqual(idsIn(wl(res)), [other.id, product.id]);
});

test('a wishlist item carries the same shape as a catalogue product', async () => {
  await client.post(`/api/wishlist/${product.id}`);
  const [saved] = wl(await client.get('/api/wishlist')).items;

  // Same projection as /api/products, so the client renders one card component.
  for (const field of ['id', 'name', 'slug', 'sku', 'price', 'stock', 'images', 'category', 'isActive']) {
    assert.ok(field in saved, `the wishlist item is missing ${field}`);
  }

  assert.ok(Array.isArray(saved.images) && saved.images.length > 0);
  assert.ok(saved.images.every((image) => image.src && typeof image.alt === 'string'));
  assert.equal(saved.price, product.price);
  assert.equal(saved.slug, product.slug);
});

test('an item can be removed', async () => {
  await client.post(`/api/wishlist/${product.id}`);
  await client.post(`/api/wishlist/${other.id}`);

  const res = await client.delete(`/api/wishlist/${product.id}`);

  assert.equal(res.status, 200);
  assert.deepEqual(idsIn(wl(await client.get('/api/wishlist'))), [other.id]);
});

test('removing an item that is not saved is a 404', async () => {
  const res = await client.delete(`/api/wishlist/${product.id}`);

  assert.equal(res.status, 404);
  assert.equal(res.json.error.code, 'WISHLIST_ITEM_NOT_FOUND');
});

test('clearing removes everything', async () => {
  await client.post(`/api/wishlist/${product.id}`);
  await client.post(`/api/wishlist/${other.id}`);

  const res = await client.delete('/api/wishlist');

  assert.equal(res.status, 200);
  assert.deepEqual(wl(res).items, []);
});

test('a malformed id is rejected before the database is touched', async () => {
  const res = await client.post('/api/wishlist/not-a-uuid');

  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, 'VALIDATION_ERROR');
});

test('an archived product can still be saved to a wishlist', async () => {
  // A wishlist is a "save for later" list, so a delisted product must remain
  // savable and visible, with isActive telling the client it cannot be bought.
  await query('UPDATE products SET is_active = FALSE WHERE id = $1', [product.id]);

  try {
    const added = await client.post(`/api/wishlist/${product.id}`);
    assert.equal(added.status, 200);

    const saved = wl(await client.get('/api/wishlist'));
    assert.equal(saved.count, 1);
    assert.equal(saved.items[0].id, product.id);
    assert.equal(saved.items[0].isActive, false, 'the client is told it is no longer for sale');
  } finally {
    await query('UPDATE products SET is_active = TRUE WHERE id = $1', [product.id]);
  }
});

test('a guest wishlist is merged into the account on sign-in', async () => {
  client.clearCookies();
  const session = await client.signIn(CUSTOMER.email, CUSTOMER.password, {
    wishlist: [product.slug, other.slug]
  });

  assert.ok(session.wishlist, 'the merged wishlist is returned with the session');
  assert.deepEqual(idsIn(session.wishlist).sort(), [product.id, other.id].sort());
});

test('a guest wishlist is merged by slug, not by client-supplied product data', async () => {
  client.clearCookies();
  const session = await client.signIn(CUSTOMER.email, CUSTOMER.password, {
    wishlist: [product.slug]
  });

  // The client only sends slugs, so names and prices must come from the database.
  const [saved] = session.wishlist.items;
  assert.equal(saved.id, product.id);
  assert.equal(saved.price, product.price);
  assert.equal(saved.name, product.name);
});

test('an unknown slug in a guest wishlist is ignored', async () => {
  client.clearCookies();
  const session = await client.signIn(CUSTOMER.email, CUSTOMER.password, {
    wishlist: [product.slug, 'a-slug-that-does-not-exist']
  });

  assert.deepEqual(idsIn(session.wishlist), [product.id]);
});

test('a guest wishlist does not duplicate items already saved', async () => {
  await client.post(`/api/wishlist/${product.id}`);

  client.clearCookies();
  const session = await client.signIn(CUSTOMER.email, CUSTOMER.password, { wishlist: [product.slug] });

  assert.equal(idsIn(session.wishlist).length, 1);
});

test('wishlist routes require a session', async () => {
  client.clearCookies();
  await client.get('/api/auth/csrf');

  const responses = [
    await client.get('/api/wishlist'),
    await client.post(`/api/wishlist/${product.id}`),
    await client.delete(`/api/wishlist/${product.id}`),
    await client.delete('/api/wishlist')
  ];

  for (const res of responses) {
    assert.equal(res.status, 401);
  }
});
