import './helpers/env.js';
import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { closePool, query } from '../src/db/pool.js';
import { resetRateLimiters } from '../src/middleware/rate-limit.js';
import { resetDatabase, truncateOrders } from './helpers/database.js';
import { startTestServer } from './helpers/server.js';

let harness;
let client;
let product;

const CUSTOMER = { email: 'meera@example.com', password: 'Shoba@2026' };
const OTHER_CUSTOMER = { email: 'jon.bell@example.com', password: 'Shoba@2026' };
const ADMIN = { email: 'admin@shobacreations.com', password: 'TestAdmin@2026' };

const orderOf = (res) => res.data.order;
const orderByNumber = async (orderNumber) => {
  const res = await client.get(`/api/orders/${orderNumber}`);
  return res.status === 200 ? orderOf(res) : null;
};
const stockOf = async (productId) => {
  const { rows } = await query('SELECT stock FROM products WHERE id = $1', [productId]);
  return rows[0].stock;
};

const DELIVERY = {
  shippingName: 'Meera Chen',
  shippingEmail: 'meera@example.com',
  shippingPhone: '+91 98765 43210',
  shippingAddress: '12 MG Road',
  shippingCity: 'Bengaluru',
  shippingState: 'Karnataka',
  shippingPincode: '560001',
  shippingMethod: 'standard',
  paymentMethod: 'cod'
};

const movementsFor = async (orderNumber) => {
  const { rows } = await query(
    `SELECT im.delta, im.previous_stock, im.resulting_stock, im.reason, p.slug
     FROM inventory_movements im
     JOIN orders o ON o.id = im.order_id
     JOIN products p ON p.id = im.product_id
     WHERE o.order_number = $1
     ORDER BY im.created_at, p.slug`,
    [orderNumber]
  );

  return rows.map((r) => ({
    slug: r.slug,
    delta: r.delta,
    previousStock: r.previous_stock,
    resultingStock: r.resulting_stock,
    reason: r.reason
  }));
};

const addToCart = async (quantity = 1) => {
  const res = await client.post('/api/cart/items', { productId: product.id, quantity });
  assert.equal(res.status, 200, `could not stage the cart: ${res.text.slice(0, 200)}`);
  return res;
};

// The seed deliberately preserves products.stock on conflict, so the value in
// the test schema depends on whatever ran before. This suite therefore sets its
// own working stock instead of trusting what it finds, and restores the
// pre-existing value on the way out.
const WORKING_STOCK = 50;

let seededStock;

before(async () => {
  await resetDatabase();
  harness = await startTestServer();
  client = harness.client;

  const res = await client.get('/api/products?limit=100');
  product = res.data.items.find((p) => p.slug === 'kundan-bridal-choker');
  assert.ok(product, 'the checkout fixture exists');

  const { rows } = await query('SELECT stock FROM products WHERE id = $1', [product.id]);
  seededStock = rows[0].stock;
  await query('UPDATE products SET stock = $2 WHERE id = $1', [product.id, WORKING_STOCK]);
});

after(async () => {
  await query('UPDATE products SET stock = $2 WHERE id = $1', [product.id, seededStock]);
  await harness?.close();
  await closePool();
});

beforeEach(async () => {
  resetRateLimiters();
  client.clearCookies();
  await client.signIn(CUSTOMER.email, CUSTOMER.password);
  assert.equal((await client.delete('/api/cart')).status, 200);

  // products.stock is a denormalised counter, so truncating the order tables
  // does not put the units back. It has to be restored explicitly or the suite
  // silently starves itself.
  await query('UPDATE products SET stock = $2, price = $3, is_active = TRUE WHERE id = $1', [
    product.id,
    WORKING_STOCK,
    product.price
  ]);

  await truncateOrders();
});

test('checking out an empty cart is rejected', async () => {
  const res = await client.post('/api/orders', DELIVERY);

  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, 'CART_EMPTY');
});

test('checkout creates an order priced from the database', async () => {
  await addToCart(2);
  const before = await stockOf(product.id);

  const res = await client.post('/api/orders', DELIVERY);
  const order = orderOf(res);

  assert.equal(res.status, 201);
  assert.match(order.orderNumber, /^SC-\d{5}$/);
  assert.equal(order.status, 'processing');
  assert.equal(order.subtotal, product.price * 2);
  assert.equal(order.itemCount, 2);
  assert.equal(order.total, order.subtotal + order.shippingCost + order.handlingFee);
  assert.equal(order.shippingAddress, DELIVERY.shippingAddress);
  assert.equal(order.shippingCity, DELIVERY.shippingCity);
  assert.equal(order.shippingPincode, DELIVERY.shippingPincode);
  assert.equal(await stockOf(product.id), before - 2, 'stock is decremented');
});

test('checkout snapshots the line item so later price changes cannot rewrite history', async () => {
  await addToCart(1);
  const placed = orderOf(await client.post('/api/orders', DELIVERY));
  const [item] = placed.items;

  assert.ok(item, 'the order carries its line items');
  assert.equal(item.unitPrice, product.price);
  assert.equal(item.productName, product.name);
  assert.equal(item.productSlug, product.slug);
  assert.equal(item.lineTotal, product.price);

  await query('UPDATE products SET price = 1 WHERE id = $1', [product.id]);

  try {
    const reloaded = await orderByNumber(placed.orderNumber);
    assert.equal(reloaded.items[0].unitPrice, product.price, 'the snapshot is unchanged');
    assert.equal(reloaded.subtotal, product.price);
  } finally {
    await query('UPDATE products SET price = $2 WHERE id = $1', [product.id, product.price]);
  }
});

test('checkout empties the cart', async () => {
  await addToCart(1);
  await client.post('/api/orders', DELIVERY);

  const cart = (await client.get('/api/cart')).data.cart;
  assert.equal(cart.items.length, 0);
});

test('cash on delivery is recorded as pending and prepaid methods as paid', async () => {
  await addToCart(1);
  const cod = orderOf(await client.post('/api/orders', DELIVERY));
  assert.equal(cod.paymentMethod, 'cod');
  assert.equal(cod.paymentStatus, 'pending');
  assert.ok(cod.handlingFee > 0);

  await addToCart(1);
  const upi = orderOf(await client.post('/api/orders', { ...DELIVERY, paymentMethod: 'upi' }));
  assert.equal(upi.paymentStatus, 'paid');
  assert.equal(upi.handlingFee, 0);

  await addToCart(1);
  const card = orderOf(await client.post('/api/orders', { ...DELIVERY, paymentMethod: 'card' }));
  assert.equal(card.paymentStatus, 'paid');
});

test('a rejected payment method is a validation error', async () => {
  await addToCart(1);
  const res = await client.post('/api/orders', { ...DELIVERY, paymentMethod: 'prepaid' });

  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, 'VALIDATION_ERROR');
});

test('express shipping is charged on the order', async () => {
  await addToCart(1);
  const order = orderOf(await client.post('/api/orders', { ...DELIVERY, shippingMethod: 'express' }));

  assert.equal(order.shippingMethod, 'express');
  assert.ok(order.shippingCost > 0);
});

test('a note is stored on the order', async () => {
  await addToCart(1);
  const order = orderOf(await client.post('/api/orders', { ...DELIVERY, note: 'Please gift wrap' }));

  assert.equal(order.note, 'Please gift wrap');
});

test('stock that vanished between staging and checkout rolls the whole order back', async () => {
  await addToCart(2);
  await query('UPDATE products SET stock = 1 WHERE id = $1', [product.id]);

  try {
    const res = await client.post('/api/orders', DELIVERY);

    assert.equal(res.status, 409);
    assert.equal(res.json.error.code, 'INSUFFICIENT_STOCK');

    // The transaction must not have created a partial order.
    const { rows } = await query('SELECT count(*)::int AS count FROM orders');
    assert.equal(rows[0].count, 0, 'no order row survives the rollback');

    const cart = (await client.get('/api/cart')).data.cart;
    assert.equal(cart.items.length, 1, 'the cart is left intact for the shopper to retry');
  } finally {
    await query('UPDATE products SET stock = $2 WHERE id = $1', [product.id, product.stock]);
  }
});

test('an archived product in the cart blocks checkout', async () => {
  await addToCart(1);
  await query('UPDATE products SET is_active = FALSE WHERE id = $1', [product.id]);

  try {
    const res = await client.post('/api/orders', DELIVERY);

    assert.equal(res.status, 409);
    assert.equal(res.json.error.code, 'PRODUCT_UNAVAILABLE');
  } finally {
    await query('UPDATE products SET is_active = TRUE WHERE id = $1', [product.id]);
  }
});

test('a sale writes an inventory movement with the stock it left behind', async () => {
  await addToCart(2);
  const before = await stockOf(product.id);
  const order = orderOf(await client.post('/api/orders', DELIVERY));

  const [movement] = await movementsFor(order.orderNumber);
  assert.equal(movement.slug, product.slug);
  assert.equal(movement.reason, 'sale');
  assert.equal(movement.delta, -2);
  assert.equal(movement.previousStock, before);
  assert.equal(movement.resultingStock, before - 2);
});

test('a customer sees only their own orders', async () => {
  await addToCart(1);
  const mine = orderOf(await client.post('/api/orders', DELIVERY));

  const res = await client.get('/api/orders');
  assert.equal(res.status, 200);
  assert.equal(res.data.orders.length, 1);
  assert.equal(res.data.orders[0].orderNumber, mine.orderNumber);
  assert.equal(res.data.pagination.total, 1);

  client.clearCookies();
  await client.signIn(OTHER_CUSTOMER.email, OTHER_CUSTOMER.password);
  const theirs = await client.get('/api/orders');

  assert.equal(theirs.data.orders.length, 0, "another customer's orders are not visible");
});

test("a customer cannot open another customer's order", async () => {
  await addToCart(1);
  const mine = orderOf(await client.post('/api/orders', DELIVERY));

  client.clearCookies();
  await client.signIn(OTHER_CUSTOMER.email, OTHER_CUSTOMER.password);
  const res = await client.get(`/api/orders/${mine.orderNumber}`);

  assert.equal(res.status, 404);
  assert.equal(res.json.error.code, 'ORDER_NOT_FOUND');
});

test("a customer cannot cancel another customer's order", async () => {
  await addToCart(1);
  const mine = orderOf(await client.post('/api/orders', DELIVERY));

  client.clearCookies();
  await client.signIn(OTHER_CUSTOMER.email, OTHER_CUSTOMER.password);
  const res = await client.post(`/api/orders/${mine.orderNumber}/cancel`);

  assert.equal(res.status, 404);
  assert.equal(res.json.error.code, 'ORDER_NOT_FOUND');
});

test('a customer can cancel their own order and the stock comes back', async () => {
  await addToCart(2);
  const before = await stockOf(product.id);
  const placed = orderOf(await client.post('/api/orders', DELIVERY));
  assert.equal(await stockOf(product.id), before - 2);

  const res = await client.post(`/api/orders/${placed.orderNumber}/cancel`);

  assert.equal(res.status, 200);
  assert.equal(orderOf(res).status, 'cancelled');
  assert.equal(await stockOf(product.id), before, 'the units are returned to stock');

  const movements = await movementsFor(placed.orderNumber);
  const restored = movements.find((m) => m.reason === 'cancellation');
  assert.equal(movements.filter((m) => m.reason === 'sale').length, 1, 'the sale is still audited');
  assert.equal(restored.delta, 2);
  assert.equal(restored.previousStock, before - 2);
  assert.equal(restored.resultingStock, before);
});

test('cancelling twice is idempotent and never returns the stock twice', async () => {
  await addToCart(1);
  const before = await stockOf(product.id);
  const placed = orderOf(await client.post('/api/orders', DELIVERY));

  assert.equal((await client.post(`/api/orders/${placed.orderNumber}/cancel`)).status, 200);
  assert.equal(await stockOf(product.id), before);

  // A repeated cancel is accepted but must be a no-op: the units come back once.
  const second = await client.post(`/api/orders/${placed.orderNumber}/cancel`);
  assert.equal(second.status, 200);
  assert.equal(orderOf(second).status, 'cancelled');
  assert.equal(await stockOf(product.id), before, 'stock is only returned once');

  const restorations = (await movementsFor(placed.orderNumber)).filter((m) => m.reason === 'cancellation');
  assert.equal(restorations.length, 1, 'only one cancellation is audited');
});

test('an unknown order number is a 404', async () => {
  const res = await client.get('/api/orders/SC-00000');

  assert.equal(res.status, 404);
  assert.equal(res.json.error.code, 'ORDER_NOT_FOUND');
});

test('order numbers are unique across checkouts', async () => {
  const numbers = new Set();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await addToCart(1);
    const order = orderOf(await client.post('/api/orders', DELIVERY));
    assert.equal(numbers.has(order.orderNumber), false, `${order.orderNumber} was issued twice`);
    numbers.add(order.orderNumber);
  }
});

test('an admin can move an order through its lifecycle', async () => {
  await addToCart(1);
  const placed = orderOf(await client.post('/api/orders', DELIVERY));

  client.clearCookies();
  await client.signIn(ADMIN.email, ADMIN.password);

  for (const status of ['packed', 'shipped', 'delivered']) {
    const res = await client.patch(`/api/admin/orders/${placed.orderNumber}/status`, { status });

    assert.equal(res.status, 200, `could not move to ${status}: ${res.text.slice(0, 200)}`);
    assert.equal(orderOf(res).status, status);
  }
});

test('an admin cannot skip a step in the lifecycle', async () => {
  await addToCart(1);
  const placed = orderOf(await client.post('/api/orders', DELIVERY));

  client.clearCookies();
  await client.signIn(ADMIN.email, ADMIN.password);

  const res = await client.patch(`/api/admin/orders/${placed.orderNumber}/status`, { status: 'delivered' });

  assert.equal(res.status, 409);
  assert.equal(res.json.error.code, 'INVALID_STATUS_TRANSITION');
});

test('a delivered order can no longer be cancelled', async () => {
  await addToCart(1);
  const placed = orderOf(await client.post('/api/orders', DELIVERY));

  client.clearCookies();
  await client.signIn(ADMIN.email, ADMIN.password);
  await client.patch(`/api/admin/orders/${placed.orderNumber}/status`, { status: 'packed' });
  await client.patch(`/api/admin/orders/${placed.orderNumber}/status`, { status: 'shipped' });
  await client.patch(`/api/admin/orders/${placed.orderNumber}/status`, { status: 'delivered' });

  client.clearCookies();
  await client.signIn(CUSTOMER.email, CUSTOMER.password);
  const res = await client.post(`/api/orders/${placed.orderNumber}/cancel`);

  assert.equal(res.status, 409);
  assert.equal(res.json.error.code, 'INVALID_STATUS_TRANSITION');
});

test('reinstating a cancelled order takes the stock back', async () => {
  await addToCart(1);
  const before = await stockOf(product.id);
  const placed = orderOf(await client.post('/api/orders', DELIVERY));
  await client.post(`/api/orders/${placed.orderNumber}/cancel`);
  assert.equal(await stockOf(product.id), before);

  client.clearCookies();
  await client.signIn(ADMIN.email, ADMIN.password);
  const res = await client.patch(`/api/admin/orders/${placed.orderNumber}/status`, { status: 'processing' });

  assert.equal(res.status, 200);
  assert.equal(orderOf(res).status, 'processing');
  assert.equal(await stockOf(product.id), before - 1, 'reinstatement re-reserves the units');

  const movements = await movementsFor(placed.orderNumber);
  const reinstated = movements.find((m) => m.reason === 'reinstatement');
  assert.equal(reinstated.delta, -1);
  assert.equal(reinstated.previousStock, before);
  assert.equal(reinstated.resultingStock, before - 1);
});

test('a customer cannot place an order', async () => {
  const res = await client.post('/api/admin/orders', DELIVERY);

  assert.ok([401, 403, 404].includes(res.status), `expected a rejection, got ${res.status}`);
});

test('order routes require a session', async () => {
  client.clearCookies();
  await client.get('/api/auth/csrf');

  for (const res of [await client.get('/api/orders'), await client.post('/api/orders', DELIVERY)]) {
    assert.equal(res.status, 401);
  }
});
