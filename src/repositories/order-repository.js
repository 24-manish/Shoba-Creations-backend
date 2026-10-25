import { query } from '../db/pool.js';

const run = (db, text, params) => db.query(text, params);

// Order numbers come from a dedicated sequence so two concurrent checkouts can
// never be handed the same identifier, and the sequence is not reset by deleting
// rows.
export const nextOrderNumber = async (db) => {
  const { rows } = await run(db, `SELECT nextval('order_number_seq')::int AS value`);
  return `SC-${rows[0].value}`;
};

const orderSelect = `
  SELECT
    o.id,
    o.order_number AS "orderNumber",
    o.user_id AS "userId",
    u.name AS "customerName",
    u.email AS "customerEmail",
    o.channel,
    o.status,
    o.shipping_name AS "shippingName",
    o.shipping_email AS "shippingEmail",
    o.shipping_phone AS "shippingPhone",
    o.shipping_address AS "shippingAddress",
    o.shipping_city AS "shippingCity",
    o.shipping_state AS "shippingState",
    o.shipping_pincode AS "shippingPincode",
    o.shipping_method AS "shippingMethod",
    o.payment_method AS "paymentMethod",
    o.payment_status AS "paymentStatus",
    o.note,    o.item_count AS "itemCount",
    o.subtotal::float8 AS subtotal,
    o.shipping_cost::float8 AS "shippingCost",
    o.handling_fee::float8 AS "handlingFee",
    o.total::float8 AS total,
    o.created_at AS "createdAt",
    o.updated_at AS "updatedAt"
`;

export const list = async ({ status, channel, search, page = 1, limit = 20, userId } = {}) => {
  const conditions = [];
  const values = [];

  const push = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (userId !== undefined) {
    conditions.push(`o.user_id = ${push(userId)}`);
  }

  if (status) {
    conditions.push(`o.status = ${push(status)}`);
  }

  if (channel) {
    conditions.push(`o.channel = ${push(channel)}`);
  }

  if (search) {
    const like = push(`%${search}%`);
    conditions.push(
      `(o.order_number ILIKE ${like} OR o.shipping_name ILIKE ${like} OR o.shipping_email ILIKE ${like})`
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Listing never runs inside a transaction, so it goes straight to the pool
  // helper rather than through run(), which expects a client object.
  const countResult = await query(
    `SELECT COUNT(*)::int AS count
     FROM orders o
     JOIN users u ON u.id = o.user_id
     ${where}`,
    values
  );
  const total = Number(countResult.rows[0].count);

  const listValues = [...values, limit, (page - 1) * limit];
  const { rows } = await query(
    `${orderSelect}
     FROM orders o
     JOIN users u ON u.id = o.user_id
     ${where}
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    listValues
  );

  return {
    items: rows,
    pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) }
  };
};

const itemsFor = async (orderIds, db = { query }) => {
  if (orderIds.length === 0) {
    return new Map();
  }

  const { rows } = await db.query(
    `SELECT
       oi.order_id AS "orderId",
       oi.id,
       oi.product_id AS "productId",
       oi.product_name AS "productName",
       oi.product_slug AS "productSlug",
       oi.selected_color AS "selectedColor",
       oi.selected_size AS "selectedSize",
       oi.unit_price::float8 AS "unitPrice",
       oi.quantity,
       oi.line_total::float8 AS "lineTotal",
       oi.image_url AS "imageUrl"
     FROM order_items oi
     WHERE oi.order_id = ANY($1)
     ORDER BY oi.id ASC`,
    [orderIds]
  );

  const grouped = new Map();

  for (const row of rows) {
    const list = grouped.get(row.orderId) ?? [];
    list.push({
      id: row.id,
      productId: row.productId,
      productName: row.productName,
      productSlug: row.productSlug,
      selectedColor: row.selectedColor,
      selectedSize: row.selectedSize,
      unitPrice: row.unitPrice,
      quantity: row.quantity,
      lineTotal: row.lineTotal,
      imageUrl: row.imageUrl
    });
    grouped.set(row.orderId, list);
  }

  return grouped;
};

export const findById = async (id, db = { query }) => {
  const { rows } = await db.query(`${orderSelect} FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1`, [id]);
  const order = rows[0] ?? null;

  if (!order) {
    return null;
  }

  const grouped = await itemsFor([order.id], db);
  return { ...order, items: grouped.get(order.id) ?? [] };
};

export const findByNumber = async (orderNumber, db = { query }) => {
  const { rows } = await db.query(
    `${orderSelect} FROM orders o JOIN users u ON u.id = o.user_id WHERE o.order_number = $1`,
    [orderNumber]
  );
  const order = rows[0] ?? null;

  if (!order) {
    return null;
  }

  const grouped = await itemsFor([order.id], db);
  return { ...order, items: grouped.get(order.id) ?? [] };
};

export const listForUser = async (userId, { page = 1, limit = 20 } = {}) => {
  const { items, pagination } = await list({ userId, page, limit });
  const grouped = await itemsFor(items.map((item) => item.id));

  return {
    items: items.map((order) => ({ ...order, items: grouped.get(order.id) ?? [] })),
    pagination
  };
};

// Every field is copied onto the order item so a historical order still renders
// correctly after the product is renamed, repriced, or removed.
export const insert = async (
  {
    userId,
    channel = 'online_store',
    status = 'processing',
    shipping,
    shippingMethod,
    paymentMethod = 'cod',
    paymentStatus = paymentMethod === 'prepaid' ? 'paid' : 'pending',
    note = null,
    items,
    totals
  },
  db = { query }
) => {
  const orderNumber = await nextOrderNumber(db);
  const { rows } = await db.query(
    `INSERT INTO orders (
       order_number, user_id, channel, status,
       shipping_name, shipping_email, shipping_phone, shipping_address,
       shipping_city, shipping_state, shipping_pincode,
       shipping_method, payment_method, payment_status, note,
       item_count, subtotal, shipping_cost, handling_fee, total
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING id`,
    [
      orderNumber,
      userId,
      channel,
      status,
      shipping.name,
      shipping.email,
      shipping.phone ?? null,
      shipping.address,
      shipping.city ?? null,
      shipping.state ?? null,
      shipping.pincode ?? null,
      shippingMethod,
      paymentMethod,
      paymentStatus,
      note,
      items.reduce((sum, item) => sum + item.quantity, 0),
      totals.subtotal,
      totals.shippingCost,
      totals.handlingFee,
      totals.total
    ]
  );

  const orderId = rows[0].id;

  for (const item of items) {
    await db.query(
      `INSERT INTO order_items (
         order_id, product_id, product_name, product_slug,
         selected_color, selected_size, unit_price, quantity, line_total, image_url
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        orderId,
        item.productId,
        item.productName,
        item.productSlug,
        item.selectedColor ?? null,
        item.selectedSize ?? null,
        item.unitPrice,
        item.quantity,
        item.lineTotal,
        item.imageUrl ?? null
      ]
    );
  }

  return findById(orderId, db);
};

export const setStatus = async (id, status, db = { query }) => {
  const { rows } = await db.query(
    'UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING id',
    [id, status]
  );

  return rows.length > 0 ? findById(id, db) : null;
};

export const setPaymentStatus = async (id, paymentStatus, db = { query }) => {
  const { rows } = await db.query(
    'UPDATE orders SET payment_status = $2, updated_at = NOW() WHERE id = $1 RETURNING id',
    [id, paymentStatus]
  );

  return rows.length > 0 ? findById(id, db) : null;
};

export const remove = async (id, db = { query }) => {
  const { rows } = await db.query('DELETE FROM orders WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
};

export const lockProductForUpdate = async (productId, db) => {
  const { rows } = await db.query(
    `SELECT id, name, slug, price::float8 AS price, stock, is_active AS "isActive"
     FROM products WHERE id = $1 FOR UPDATE`,
    [productId]
  );

  return rows[0] ?? null;
};

export const findProductImage = async (productId, db) => {
  const { rows } = await db.query(
    `SELECT url FROM product_images WHERE product_id = $1 ORDER BY position, created_at LIMIT 1`,
    [productId]
  );

  return rows[0]?.url ?? null;
};

export const decrementStock = async (productId, quantity, db) => {
  const { rows } = await db.query(
    `UPDATE products SET stock = stock - $2, updated_at = NOW()
     WHERE id = $1 AND stock >= $2
     RETURNING id, stock`,
    [productId, quantity]
  );

  return rows[0] ?? null;
};

export const restoreStock = async (productId, quantity, db) => {
  const { rows } = await db.query(
    `UPDATE products SET stock = stock + $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, stock`,
    [productId, quantity]
  );

  return rows[0] ?? null;
};

// Stock movements are recorded with the before and after values, so the audit
// trail explains itself without having to be reconstructed from a sequence of
// deltas. The caller supplies both because it already holds the locked row.
export const recordInventoryMovement = async (
  { productId, orderId = null, actorId = null, delta, previousStock, resultingStock, reason, note = null },
  db = { query }
) => {
  const { rows } = await db.query(
    `INSERT INTO inventory_movements (
       product_id, order_id, actor_id, delta, previous_stock, resulting_stock, reason, note
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, product_id AS "productId", order_id AS "orderId", actor_id AS "actorId",
               delta, previous_stock AS "previousStock", resulting_stock AS "resultingStock",
               reason, note, created_at AS "createdAt"`,
    [productId, orderId, actorId, delta, previousStock, resultingStock, reason, note]
  );

  return rows[0];
};

export const listInventoryMovements = async ({ productId, orderId, limit = 50 } = {}) => {
  const values = [];
  const conditions = [];

  if (productId !== undefined && productId !== null) {
    values.push(productId);
    conditions.push(`m.product_id = $${values.length}`);
  }

  if (orderId !== undefined && orderId !== null) {
    values.push(orderId);
    conditions.push(`m.order_id = $${values.length}`);
  }

  values.push(limit);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT m.id, m.product_id AS "productId", p.name AS "productName", p.sku,
            m.order_id AS "orderId", o.order_number AS "orderNumber",
            m.actor_id AS "actorId", m.delta,
            m.previous_stock AS "previousStock", m.resulting_stock AS "resultingStock",
            m.reason, m.note, m.created_at AS "createdAt"
     FROM inventory_movements m
     JOIN products p ON p.id = m.product_id
     LEFT JOIN orders o ON o.id = m.order_id
     ${where}
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $${values.length}`,
    values
  );

  return rows;
};
