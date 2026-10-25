import './helpers/env.js';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { after, before, beforeEach } from 'node:test';
import { closePool, query } from '../src/db/pool.js';
import { resetRateLimiters } from '../src/middleware/rate-limit.js';
import { resetDatabase } from './helpers/database.js';
import { startTestServer } from './helpers/server.js';

let harness;
let client;

const uniqueEmail = (label) => `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const cookieNames = (res) => new Set((res.headers.getSetCookie?.() ?? []).map((c) => c.split('=')[0].trim()));

before(async () => {
  await resetDatabase();
  harness = await startTestServer();
  client = harness.client;
});

after(async () => {
  await harness?.close();
  await closePool();
});

beforeEach(() => {
  resetRateLimiters();
  client.clearCookies();
});

test('registering creates an account and signs the customer in', async () => {
  const email = uniqueEmail('newcomer');

  const res = await client.post('/api/auth/register', {
    name: 'Asha Menon',
    email,
    password: 'Shoba@2026',
    phone: '+91 90000 00001',
    city: 'Kochi'
  });

  assert.equal(res.status, 201);
  assert.equal(res.data.user.email, email);
  assert.equal(res.data.user.role, 'customer');
  assert.equal(res.data.user.initials, 'AM');
  assert.equal(res.data.user.passwordHash, undefined);

  const cookies = cookieNames(res);
  assert.ok(cookies.has('sc_at'), 'sets an access cookie');
  assert.ok(cookies.has('sc_rt'), 'sets a refresh cookie');
  assert.ok(cookies.has('sc_csrf'), 'exposes a CSRF cookie');
});

test('an already-registered email is rejected', async () => {
  const email = uniqueEmail('duplicate');

  const first = await client.post('/api/auth/register', { name: 'Rhea Kapoor', email, password: 'Shoba@2026' });
  assert.equal(first.status, 201);

  client.clearCookies();
  const second = await client.post('/api/auth/register', { name: 'Rhea Kapoor', email, password: 'Shoba@2026' });

  assert.equal(second.status, 409);
  assert.equal(second.json.error.code, 'EMAIL_TAKEN');
});

test('a duplicate email is matched case-insensitively', async () => {
  const email = uniqueEmail('cased');
  await client.post('/api/auth/register', { name: 'Nila Das', email, password: 'Shoba@2026' });

  client.clearCookies();
  const res = await client.post('/api/auth/register', {
    name: 'Nila Das',
    email: email.toUpperCase(),
    password: 'Shoba@2026'
  });

  assert.equal(res.status, 409);
});

test('registering rejects a short password', async () => {
  const res = await client.post('/api/auth/register', {
    name: 'Short Pass',
    email: uniqueEmail('short'),
    password: 'abc'
  });

  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, 'VALIDATION_ERROR');
});

test('signing in returns the user', async () => {
  const res = await client.post('/api/auth/login', {
    email: 'meera@example.com',
    password: 'Shoba@2026'
  });

  assert.equal(res.status, 200);
  assert.equal(res.data.user.email, 'meera@example.com');
  assert.equal(res.data.user.name, 'Meera Chen');
  assert.equal(res.data.user.role, 'customer');
  assert.ok(cookieNames(res).has('sc_at'));
});

test('a wrong password is reported as invalid credentials, not as a missing account', async () => {
  const res = await client.post('/api/auth/login', {
    email: 'meera@example.com',
    password: 'WrongPassword@1'
  });

  assert.equal(res.status, 401);
  assert.equal(res.json.error.code, 'INVALID_CREDENTIALS');
});

test('an unknown email gives the same response as a wrong password', async () => {
  const unknown = await client.post('/api/auth/login', {
    email: uniqueEmail('ghost'),
    password: 'Shoba@2026'
  });
  const wrong = await client.post('/api/auth/login', {
    email: 'meera@example.com',
    password: 'WrongPassword@1'
  });

  assert.equal(unknown.status, wrong.status);
  assert.deepEqual(unknown.json.error, wrong.json.error);
});

test('signing in rotates the CSRF token', async () => {
  await client.get('/api/auth/csrf');
  const before = client.jar.get('sc_csrf');

  const res = await client.post('/api/auth/login', {
    email: 'meera@example.com',
    password: 'Shoba@2026'
  });

  assert.equal(res.status, 200);
  assert.notEqual(client.jar.get('sc_csrf'), before);
});

test('a cookie and header that disagree are rejected', async () => {
  await client.signIn('meera@example.com', 'Shoba@2026');

  // A cross-origin form post can send the cookie but never a custom header, so
  // the two must be required to match.
  const res = await client.raw('PATCH', '/api/auth/me', { name: 'Mismatch Attempt' }, {
    csrf: 'a-token-the-cookie-does-not-contain'
  });

  assert.equal(res.status, 403);
  assert.equal(res.json.error.code, 'CSRF_TOKEN_INVALID');

  const me = await client.get('/api/auth/me');
  assert.equal(me.data.user.name, 'Meera Chen', 'the rejected request changed nothing');
});

test('/me reports the signed-in user', async () => {
  await client.signIn('meera@example.com', 'Shoba@2026');

  const res = await client.get('/api/auth/me');

  assert.equal(res.status, 200);
  assert.equal(res.data.user.email, 'meera@example.com');
});

test('/me rejects an anonymous caller', async () => {
  const res = await client.get('/api/auth/me');

  assert.equal(res.status, 401);
});

test('a profile update persists and returns the new values', async () => {
  const email = uniqueEmail('profile');
  await client.post('/api/auth/register', { name: 'Old Name', email, password: 'Shoba@2026' });

  const res = await client.patch('/api/auth/me', {
    name: 'New Name',
    phone: '+91 90000 00002',
    city: 'Pune'
  });

  assert.equal(res.status, 200);
  assert.equal(res.data.user.name, 'New Name');
  assert.equal(res.data.user.phone, '+91 90000 00002');
  assert.equal(res.data.user.city, 'Pune');

  const { rows } = await query('SELECT name, city FROM users WHERE email = $1', [email]);
  assert.equal(rows[0].name, 'New Name');
  assert.equal(rows[0].city, 'Pune');
});

test('an email cannot be changed through the profile endpoint', async () => {
  await client.signIn('meera@example.com', 'Shoba@2026');

  const res = await client.patch('/api/auth/me', { name: 'Meera Chen', email: 'hijack@example.com' });

  assert.equal(res.status, 200);
  assert.equal(res.data.user.email, 'meera@example.com');
});

test('changing a password requires the current one', async () => {
  const email = uniqueEmail('rotate');
  await client.post('/api/auth/register', { name: 'Rotate Me', email, password: 'Shoba@2026' });

  const wrong = await client.post('/api/auth/change-password', {
    currentPassword: 'NotThePassword@1',
    newPassword: 'Shoba@2027'
  });

  assert.equal(wrong.status, 401);
  assert.equal(wrong.json.error.code, 'INVALID_CREDENTIALS');
});

test('changing a password revokes every refresh token', async () => {
  const email = uniqueEmail('relogin');
  const registered = await client.post('/api/auth/register', { name: 'Re Login', email, password: 'Shoba@2026' });
  assert.equal(registered.status, 201);

  const changed = await client.post('/api/auth/change-password', {
    currentPassword: 'Shoba@2026',
    newPassword: 'Shoba@2027'
  });
  assert.equal(changed.status, 200);

  // The access JWT is stateless and stays valid until it expires (<=15 min), but
  // the refresh token is revoked immediately, so the session cannot be extended.
  // That remaining window is a deliberate, documented trade-off.
  const refresh = await client.post('/api/auth/refresh');
  assert.equal(refresh.status, 401);

  client.clearCookies();
  const oldPassword = await client.post('/api/auth/login', { email, password: 'Shoba@2026' });
  assert.equal(oldPassword.status, 401);

  client.clearCookies();
  const newPassword = await client.post('/api/auth/login', { email, password: 'Shoba@2027' });
  assert.equal(newPassword.status, 200);
});

test('logout clears the session cookies and revokes the refresh token', async () => {
  await client.signIn('meera@example.com', 'Shoba@2026');
  const refreshCookie = client.jar.get('sc_rt');
  assert.ok(refreshCookie);

  const res = await client.post('/api/auth/logout');
  assert.equal(res.status, 200);

  assert.equal(client.jar.has('sc_at'), false);
  assert.equal(client.jar.has('sc_rt'), false);
  assert.equal(client.jar.has('sc_csrf'), false);

  const { rows } = await query('SELECT revoked_at FROM refresh_tokens WHERE token_hash = $1', [sha256(refreshCookie)]);
  assert.ok(rows[0]?.revoked_at, 'the refresh token is marked revoked');
});

test('refresh issues a new access token and rotates the refresh cookie', async () => {
  await client.signIn('meera@example.com', 'Shoba@2026');
  const firstRefresh = client.jar.get('sc_rt');

  const res = await client.post('/api/auth/refresh');

  assert.equal(res.status, 200);
  assert.ok(client.jar.has('sc_at'));
  assert.notEqual(client.jar.get('sc_rt'), firstRefresh, 'a new refresh cookie is issued');
});

test('reusing a rotated refresh token revokes the whole family', async () => {
  await client.post('/api/auth/register', {
    name: 'Reuse Family',
    email: uniqueEmail('reuse'),
    password: 'Shoba@2026'
  });

  const stolen = client.jar.get('sc_rt');
  const rotated = await client.post('/api/auth/refresh');
  assert.equal(rotated.status, 200);

  // The attacker presents the pre-rotation token. The server treats that as
  // theft and cuts the family, including the cookie the real user is holding.
  client.jar.set('sc_rt', stolen);
  const replay = await client.raw('POST', '/api/auth/refresh');
  assert.ok([401, 403].includes(replay.status), `expected the replay to fail, got ${replay.status}`);

  // Revocation also drops the session cookies, so a fresh CSRF token alone must
  // not be enough to resurrect the family.
  await client.get('/api/auth/csrf');
  const legitimate = await client.raw('POST', '/api/auth/refresh');
  assert.equal(legitimate.status, 401, 'the whole family is revoked, not just the stolen token');
  assert.equal(legitimate.json.error.code, 'SESSION_EXPIRED');
});

test('refresh without a cookie is rejected', async () => {
  // A CSRF cookie is required first; only then does the missing refresh token
  // become the actual failure.
  const noCookie = await client.post('/api/auth/refresh');
  assert.equal(noCookie.status, 403);
  assert.equal(noCookie.json.error.code, 'CSRF_TOKEN_INVALID');

  await client.get('/api/auth/csrf');
  const noRefresh = await client.post('/api/auth/refresh');
  assert.equal(noRefresh.status, 401);
});

test('logging out everywhere invalidates the session', async () => {
  await client.post('/api/auth/register', {
    name: 'Everywhere',
    email: uniqueEmail('everywhere'),
    password: 'Shoba@2026'
  });

  const res = await client.post('/api/auth/logout-everywhere');
  assert.equal(res.status, 200);

  await client.get('/api/auth/csrf');
  const refresh = await client.post('/api/auth/refresh');
  assert.equal(refresh.status, 401);
});

test('an admin-only route rejects a customer', async () => {
  await client.signIn('meera@example.com', 'Shoba@2026');

  const res = await client.get('/api/admin/dashboard');

  assert.equal(res.status, 403);
  assert.equal(res.json.error.code, 'FORBIDDEN');
});

test('an admin sign-in replaces the customer session and unlocks admin routes', async () => {
  await client.signIn('meera@example.com', 'Shoba@2026');

  const admin = await client.signIn('admin@shobacreations.com', 'TestAdmin@2026');
  assert.equal(admin.user.role, 'admin');

  const dashboard = await client.get('/api/admin/dashboard');
  assert.equal(dashboard.status, 200);

  const me = await client.get('/api/auth/me');
  assert.equal(me.data.user.role, 'admin');
});

test('an inactive account cannot sign in', async () => {
  const email = uniqueEmail('inactive');
  await client.post('/api/auth/register', { name: 'Deactivated', email, password: 'Shoba@2026' });
  await query('UPDATE users SET is_active = FALSE WHERE email = $1', [email]);

  const res = await client.post('/api/auth/login', { email, password: 'Shoba@2026' });

  assert.equal(res.status, 403);
  assert.equal(res.json.error.code, 'ACCOUNT_DISABLED');
});

test('sign-in attempts are rate limited per email', async () => {
  const email = uniqueEmail('bruteforce');
  let limited = null;

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const res = await client.post('/api/auth/login', { email, password: `guess-${attempt}` });
    if (res.status === 429) {
      limited = res;
      break;
    }
  }

  assert.ok(limited, 'repeated failures are eventually rate limited');
  assert.equal(limited.json.error.code, 'RATE_LIMITED');
  assert.ok(Number(limited.headers.get('retry-after')) > 0);

  resetRateLimiters();
  const allowed = await client.post('/api/auth/login', { email: 'meera@example.com', password: 'Shoba@2026' });
  assert.equal(allowed.status, 200, 'resetRateLimiters clears the window');
});
