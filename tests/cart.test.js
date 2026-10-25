import './helpers/env.js';
import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { closePool, query } from '../src/db/pool.js';
import { resetRateLimiters } from '../src/middleware/rate-limit.js';
import { resetDatabase } from './helpers/database.js';
import { startTestServer } from './helpers/server.js';

let harness;
let client;

// Priced fixtures chosen against the seeded catalogue: the free-shipping
// threshold is 9999, so a 1200-rupee lipstick is below it and a 11400-rupee
// saree is above it. Kundan chokers have stock 7, so anything that needs a
// higher quantity raises the stock first.
const belowThreshold = 'madder-lipstick';
const aboveThreshold = 'organza-embroidered-saree';
const target = 'kundan-bridal-choker';

const CUSTOMER = { email: 'meera@example.com', password: 'Shoba@2026' };

// The cart endpoints answer { cart, shippingOptions } and the cart object is the
// priced payload, so these helpers take the cart itself rather than a response.
const cartOf = (res) => res.data.cart;
const quantityIn = (cart, productId) => cart.items.find((i) => i.productId === productId)?.quantity ?? 0;
const lineIn = (cart, productId) => cart.items.find((i) => i.productId === productId);

const withStock = async (productId, stock, run) => {
  const { rows } = await query('SELECT stock FROM products WHERE id = $1', [productId]);
  await query('UPDATE products SET stock = $2 WHERE id = $1', [productId, stock]);

  try {
    return await run();
  } finally {
    await query('UPDATE products SET stock = $2 WHERE id = $1', [productId, rows[0].stock]);
  }
};

before(async () => {
  await resetDatabase();
  harness = await startTestServer();
  client = harness.client;

  const res = await client.get('/api/products?limit=100');
  const byslug = Object.fromEntries(res.data.items.map((p) => [p.slug, p]));
  product = byslug[target];
  cheap = byslug[belowThreshold];
  rich = byslug[aboveThreshold];

  assert.ok(product && cheap && rich, 'the seeded catalogue is complete');
});

let product;
let cheap;
let rich;

after(async () => {
  await harness?.close();
  await closePool();
});

beforeEach(async () => {
  resetRateLimiters();
  client.clearCookies();
  await client.signIn(CUSTOMER.email, CUSTOMER.password);
  assert.equal((await client.delete('/api/cart')).status, 200);
});

test('an empty cart prices to zero', async () => {
  const cart = cartOf(await client.get('/api/cart'));

  assert.equal(cart.items.length, 0);
  assert.equal(cart.subtotal, 0);
  assert.equal(cart.total, 0);
  assert.equal(cart.amountToFreeShipping, cart.freeShippingThreshold);
});

test('cart responses also advertise the shipping options', async () => {
  const res = await client.get('/api/cart');

  assert.ok(Array.isArray(res.data.shippingOptions));
  assert.deepEqual(res.data.shippingOptions.map((o) => o.id).sort(), ['express', 'standard']);
});

test('adding a line stores server-side pricing, not client-supplied prices', async () => {
  const res = await client.post('/api/cart/items', { productId: product.id, quantity: 2 });
  const cart = cartOf(res);
  const line = lineIn(cart, product.id);

  assert.equal(line.quantity, 2);
  assert.equal(line.price, product.price, 'the line carries the catalogue price');
  assert.equal(line.lineTotal, product.price * 2);
  assert.equal(cart.subtotal, product.price * 2);
});

test('totals come from the database, not from the request body', async () => {
  const res = await client.post('/api/cart/items', {
    productId: product.id,
    quantity: 1,
    price: 1,
    unitPrice: 1,
    total: 1,
    subtotal: 1
  });

  const cart = cartOf(res);
  assert.equal(cart.subtotal, product.price);
  assert.notEqual(cart.total, 1);
});

test('the same product in two variants is two separate lines', async () => {
  await client.post('/api/cart/items', { productId: product.id, quantity: 1, selectedColor: 'Ruby' });
  const res = await client.post('/api/cart/items', { productId: product.id, quantity: 2, selectedColor: 'Emerald' });
  const cart = cartOf(res);

  const lines = cart.items.filter((i) => i.productId === product.id);
  assert.equal(lines.length, 2);
  assert.equal(lines.find((l) => l.selectedColor === 'Ruby').quantity, 1);
  assert.equal(lines.find((l) => l.selectedColor === 'Emerald').quantity, 2);
  assert.equal(cart.subtotal, product.price * 3);
});

test('adding the identical variant twice increments the line', async () => {
  await client.post('/api/cart/items', { productId: product.id, quantity: 1, selectedColor: 'Ruby' });
  const cart = cartOf(await client.post('/api/cart/items', { productId: product.id, quantity: 2, selectedColor: 'Ruby' }));

  assert.equal(cart.items.filter((i) => i.productId === product.id).length, 1);
  assert.equal(quantityIn(cart, product.id), 3);
});

test('a quantity above the per-line maximum is rejected', async () => {
  // Stock is raised first: the stock check runs before the per-line cap, and
  // this product ships with fewer than 11 units.
  await withStock(product.id, 50, async () => {
    const res = await client.post('/api/cart/items', { productId: product.id, quantity: 11 });

    assert.equal(res.status, 400);
    assert.equal(res.json.error.code, 'QUANTITY_LIMIT_EXCEEDED');
  });
});

test('a quantity above available stock is rejected', async () => {
  await withStock(product.id, 2, async () => {
    const res = await client.post('/api/cart/items', { productId: product.id, quantity: 3 });

    assert.equal(res.status, 409);
    assert.equal(res.json.error.code, 'INSUFFICIENT_STOCK');
  });
});

test('adding a zero-stock product is reported as sold out', async () => {
  await withStock(cheap.id, 0, async () => {
    const res = await client.post('/api/cart/items', { productId: cheap.id, quantity: 1 });

    assert.equal(res.status, 409);
    assert.match(res.json.error.message, /out of stock/i);
  });
});

test('an archived product cannot be added', async () => {
  await query('UPDATE products SET is_active = FALSE WHERE id = $1', [product.id]);

  try {
    const res = await client.post('/api/cart/items', { productId: product.id, quantity: 1 });

    assert.equal(res.status, 404);
    assert.equal(res.json.error.code, 'PRODUCT_NOT_FOUND');
  } finally {
    await query('UPDATE products SET is_active = TRUE WHERE id = $1', [product.id]);
  }
});

test('a well-formed but unknown product id is a 404', async () => {
  const res = await client.post('/api/cart/items', {
    productId: '00000000-0000-4000-8000-000000000000',
    quantity: 1
  });

  assert.equal(res.status, 404);
  assert.equal(res.json.error.code, 'PRODUCT_NOT_FOUND');
});

test('a malformed product id is a validation error', async () => {
  const res = await client.post('/api/cart/items', { productId: 'not-a-uuid', quantity: 1 });

  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, 'VALIDATION_ERROR');
});

test('updating a line replaces its quantity', async () => {
  await client.post('/api/cart/items', { productId: product.id, quantity: 2 });
  const cart = cartOf(await client.patch('/api/cart/items', { productId: product.id, quantity: 4 }));

  assert.equal(quantityIn(cart, product.id), 4);
  assert.equal(cart.subtotal, product.price * 4);
});

test('updating a line to zero removes it', async () => {
  await client.post('/api/cart/items', { productId: product.id, quantity: 2 });
  const cart = cartOf(await client.patch('/api/cart/items', { productId: product.id, quantity: 0 }));

  assert.equal(quantityIn(cart, product.id), 0);
  assert.equal(cart.subtotal, 0);
});

test('updating a line that is not in the cart is a 404', async () => {
  const res = await client.patch('/api/cart/items', { productId: product.id, quantity: 2 });

  assert.equal(res.status, 404);
  assert.equal(res.json.error.code, 'CART_ITEM_NOT_FOUND');
});

test('removing a specific variant leaves the other variants alone', async () => {
  await client.post('/api/cart/items', { productId: product.id, quantity: 1, selectedColor: 'Ruby' });
  await client.post('/api/cart/items', { productId: product.id, quantity: 1, selectedColor: 'Emerald' });

  const cart = cartOf(await client.delete(`/api/cart/items/${product.id}?color=Emerald`));
  const lines = cart.items.filter((i) => i.productId === product.id);

  assert.equal(lines.length, 1);
  assert.equal(lines[0].selectedColor, 'Ruby');
});

test('removing an absent line is a 404', async () => {
  const res = await client.delete(`/api/cart/items/${product.id}`);

  assert.equal(res.status, 404);
  assert.equal(res.json.error.code, 'CART_ITEM_NOT_FOUND');
});

test('clearing empties the cart', async () => {
  await client.post('/api/cart/items', { productId: product.id, quantity: 1 });
  await client.post('/api/cart/items', { productId: cheap.id, quantity: 1 });

  const cart = cartOf(await client.delete('/api/cart'));

  assert.equal(cart.items.length, 0);
  assert.equal(cart.subtotal, 0);
});

test('standard shipping is charged below the threshold and free at or above it', async () => {
  const small = cartOf(await client.post('/api/cart/items', { productId: cheap.id, quantity: 1 }));

  assert.ok(small.subtotal < small.freeShippingThreshold, 'the cheap fixture is below the threshold');
  assert.ok(small.shippingCost > 0, 'standard shipping is charged below the threshold');
  assert.equal(small.amountToFreeShipping, small.freeShippingThreshold - small.subtotal);

  const large = cartOf(await client.post('/api/cart/items', { productId: rich.id, quantity: 1 }));

  assert.ok(large.subtotal >= large.freeShippingThreshold, 'the expensive fixture clears the threshold');
  assert.equal(large.shippingCost, 0);
  assert.equal(large.amountToFreeShipping, 0);
});

test('express shipping is charged even above the threshold', async () => {
  await client.post('/api/cart/items', { productId: rich.id, quantity: 1 });
  const cart = cartOf(await client.get('/api/cart?shippingId=express'));

  assert.equal(cart.shippingId, 'express');
  assert.ok(cart.shippingCost > 0);
  assert.equal(cart.total, cart.subtotal + cart.shippingCost + cart.handlingFee);
});

test('cash on delivery adds a handling fee and the electronic methods do not', async () => {
  await client.post('/api/cart/items', { productId: product.id, quantity: 1 });

  const cod = cartOf(await client.get('/api/cart?paymentMethod=cod'));
  const upi = cartOf(await client.get('/api/cart?paymentMethod=upi'));
  const card = cartOf(await client.get('/api/cart?paymentMethod=card'));

  assert.ok(cod.handlingFee > 0);
  assert.equal(upi.handlingFee, 0);
  assert.equal(card.handlingFee, 0);
  assert.equal(cod.codAvailable, true);
  assert.equal(cod.total, cod.subtotal + cod.shippingCost + cod.handlingFee);
});

test('an empty cart is never charged a handling fee', async () => {
  const cart = cartOf(await client.get('/api/cart?paymentMethod=cod'));

  assert.equal(cart.handlingFee, 0);
  assert.equal(cart.total, 0);
});

test('a guest cart is merged into the account on sign-in', async () => {
  const before = cartOf(await client.post('/api/cart/items', { productId: product.id, quantity: 1 }));
  const guestCart = before.items.map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
    selectedColor: i.selectedColor,
    selectedSize: i.selectedSize
  }));

  client.clearCookies();
  const session = await client.signIn(CUSTOMER.email, CUSTOMER.password, { cart: guestCart });

  assert.ok(session.cart, 'the merged cart is returned with the session');
  assert.equal(quantityIn(session.cart, product.id), 2, 'guest and account quantities are summed');
  assert.equal(session.cart.total, session.cart.subtotal + session.cart.shippingCost + session.cart.handlingFee);
});

test('a merged guest cart is clamped to available stock', async () => {
  await withStock(product.id, 3, async () => {
    client.clearCookies();
    const session = await client.signIn(CUSTOMER.email, CUSTOMER.password, {
      cart: [{ productId: product.id, quantity: 99, selectedColor: null, selectedSize: null }]
    });

    assert.equal(quantityIn(session.cart, product.id), 3, 'clamped to stock rather than the requested 99');
  });
});

test('a merged guest cart is clamped to the per-line maximum', async () => {
  await withStock(product.id, 50, async () => {
    client.clearCookies();
    const session = await client.signIn(CUSTOMER.email, CUSTOMER.password, {
      cart: [{ productId: product.id, quantity: 40, selectedColor: null, selectedSize: null }]
    });

    assert.equal(quantityIn(session.cart, product.id), 10);
  });
});

test('a guest cart referencing an archived product is dropped', async () => {
  await query('UPDATE products SET is_active = FALSE WHERE id = $1', [cheap.id]);

  try {
    client.clearCookies();
    const session = await client.signIn(CUSTOMER.email, CUSTOMER.password, {
      cart: [{ productId: cheap.id, quantity: 1, selectedColor: null, selectedSize: null }]
    });

    assert.equal(quantityIn(session.cart, cheap.id), 0);
  } finally {
    await query('UPDATE products SET is_active = TRUE WHERE id = $1', [cheap.id]);
  }
});

test('signing in without guest state reports a null cart rather than failing', async () => {
  client.clearCookies();
  const session = await client.signIn(CUSTOMER.email, CUSTOMER.password);

  assert.equal(session.cart, null);
  assert.equal(session.wishlist, null);
});

test('cart routes require a session', async () => {
  client.clearCookies();
  // A CSRF cookie is fetched first so authentication, not token verification, is
  // the thing being rejected. Without it the request fails at the CSRF layer
  // with a 403, which would hide the real answer.
  await client.get('/api/auth/csrf');

  const responses = [
    await client.get('/api/cart'),
    await client.post('/api/cart/items', { productId: product.id, quantity: 1 }),
    await client.patch('/api/cart/items', { productId: product.id, quantity: 1 }),
    await client.delete(`/api/cart/items/${product.id}`),
    await client.delete('/api/cart')
  ];

  for (const res of responses) {
    assert.equal(res.status, 401);
    assert.equal(res.json.error.code, 'AUTHENTICATION_REQUIRED');
  }
});
