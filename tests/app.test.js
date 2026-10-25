import './helpers/env.js';
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { closePool } from '../src/db/pool.js';
import { slugify, uniqueSlug } from '../src/services/slug.js';
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

test('health endpoint returns an ok response', async () => {
  const res = await client.get('/health');

  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { success: true, data: { status: 'ok' } });
});

test('unknown routes return the standard error response', async () => {
  const res = await client.get('/does-not-exist');

  assert.equal(res.status, 404);
  assert.equal(res.json.success, false);
  assert.equal(res.json.error.code, 'NOT_FOUND');
});

test('protected routes reject an anonymous caller', async () => {
  const res = await client.get('/api/cart');

  assert.equal(res.status, 401);
  assert.equal(res.json.error.code, 'AUTHENTICATION_REQUIRED');
});

test('state-changing requests are rejected without a CSRF token', async () => {
  const res = await client.post('/api/cart/items', {
    productId: '00000000-0000-4000-8000-000000000000',
    quantity: 1
  });

  assert.equal(res.status, 403);
  assert.equal(res.json.error.code, 'CSRF_TOKEN_INVALID');
});

test('request validation returns structured errors', async () => {
  const res = await client.post('/api/auth/register', {
    name: 'A',
    email: 'not-an-email',
    password: 'short'
  });

  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(res.json.error.details));
});

test('malformed JSON is reported as invalid JSON', async () => {
  const res = await client.raw('POST', '/api/auth/login', undefined, { multipart: true });

  assert.equal(res.status, 400);
});

test('slugify creates URL-safe slugs', () => {
  assert.equal(slugify('  Handmade Ceramic Vase! '), 'handmade-ceramic-vase');
});

test('slugify falls back to a random name when nothing survives normalisation', () => {
  assert.match(slugify('!!!'), /^item-[0-9a-f]{8}$/);
});

test('uniqueSlug suffixes deterministically on collision', async () => {
  const taken = new Map([['kurti', { id: 1 }]]);
  const findBySlug = async (slug) => taken.get(slug) ?? null;

  assert.equal(await uniqueSlug('Kurti', findBySlug), 'kurti-2');

  taken.set('kurti-2', { id: 2 });
  assert.equal(await uniqueSlug('Kurti', findBySlug), 'kurti-3');
});

test('uniqueSlug lets a row keep its own slug', async () => {
  const findBySlug = async (slug) => (slug === 'kurti' ? { id: 7 } : null);

  assert.equal(await uniqueSlug('Kurti', findBySlug, 7), 'kurti');
  assert.equal(await uniqueSlug('Kurti', findBySlug, 8), 'kurti-2');
});
