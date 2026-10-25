import { pool } from '../db/pool.js';

const run = (db, text, params) => db.query(text, params);

export const ensureCart = async (userId, db = pool) => {
  const { rows } = await run(
    db,
    `INSERT INTO carts (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [userId]
  );

  return rows[0].id;
};

export const getProductForUpdate = async (productId, db = pool) => {
  const { rows } = await run(
    db,
    `SELECT id, name, slug, price::float8 AS price, stock, is_active AS "isActive"
     FROM products
     WHERE id = $1
     FOR UPDATE`,
    [productId]
  );

  return rows[0] ?? null;
};

// Identity of a cart line is the product plus the chosen colour and size. Empty
// strings stand in for "not specified" so that NULLs never break the unique
// index used to merge identical lines.
const variantKey = (color, size) => [color ?? '', size ?? ''];

export const getItem = async (cartId, productId, color, size, db = pool) => {
  const [normalizedColor, normalizedSize] = variantKey(color, size);
  const { rows } = await run(
    db,
    `SELECT id, product_id AS "productId", quantity, selected_color AS "selectedColor", selected_size AS "selectedSize"
     FROM cart_items
     WHERE cart_id = $1 AND product_id = $2
       AND COALESCE(selected_color, '') = $3
       AND COALESCE(selected_size, '') = $4
     FOR UPDATE`,
    [cartId, productId, normalizedColor, normalizedSize]
  );

  return rows[0] ?? null;
};

export const getItems = async (cartId, db = pool) => {
  const { rows } = await run(
    db,
    `SELECT
       ci.id,
       ci.product_id AS "productId",
       ci.quantity,
       ci.selected_color AS "selectedColor",
       ci.selected_size AS "selectedSize",
       p.name,
       p.slug,
       p.description,
       p.price::float8 AS price,
       p.compare_at_price::float8 AS "compareAtPrice",
       p.stock,
       p.tone,
       p.is_active AS "isActive",
       c.name AS category,
       (
         SELECT pi.url
         FROM product_images pi
         WHERE pi.product_id = p.id
         ORDER BY pi.position, pi.created_at
         LIMIT 1
       ) AS "imageUrl"
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE ci.cart_id = $1
     ORDER BY ci.created_at ASC`,
    [cartId]
  );

  return rows.map((item) => ({
    ...item,
    selectedColor: item.selectedColor || null,
    selectedSize: item.selectedSize || null,
    lineTotal: Number((item.price * item.quantity).toFixed(2))
  }));
};

export const getCart = async (userId, db = pool) => {
  const cartId = await ensureCart(userId, db);
  const items = await getItems(cartId, db);
  const subtotal = Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));

  return { id: cartId, items, itemCount: items.reduce((sum, item) => sum + item.quantity, 0), subtotal };
};

export const addOrIncrement = async (cartId, productId, quantity, color, size, db = pool) => {
  const [normalizedColor, normalizedSize] = variantKey(color, size);
  const { rows } = await run(
    db,
    `INSERT INTO cart_items (cart_id, product_id, quantity, selected_color, selected_size)
     VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''))
     ON CONFLICT (cart_id, product_id, COALESCE(selected_color, ''), COALESCE(selected_size, ''))
       DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity,
                     updated_at = NOW()
     RETURNING id, product_id AS "productId", quantity`,
    [cartId, productId, quantity, normalizedColor, normalizedSize]
  );

  return rows[0];
};

export const updateQuantity = async (cartId, productId, quantity, color, size, db = pool) => {
  const [normalizedColor, normalizedSize] = variantKey(color, size);
  const { rows } = await run(
    db,
    `UPDATE cart_items
     SET quantity = $5, updated_at = NOW()
     WHERE cart_id = $1 AND product_id = $2
       AND COALESCE(selected_color, '') = $3
       AND COALESCE(selected_size, '') = $4
     RETURNING id, product_id AS "productId", quantity`,
    [cartId, productId, normalizedColor, normalizedSize, quantity]
  );

  return rows[0] ?? null;
};

export const remove = async (cartId, productId, color, size, db = pool) => {
  const [normalizedColor, normalizedSize] = variantKey(color, size);
  const { rows } = await run(
    db,
    `DELETE FROM cart_items
     WHERE cart_id = $1 AND product_id = $2
       AND COALESCE(selected_color, '') = $3
       AND COALESCE(selected_size, '') = $4
     RETURNING id, product_id AS "productId", quantity`,
    [cartId, productId, normalizedColor, normalizedSize]
  );

  return rows[0] ?? null;
};

export const clear = async (cartId, db = pool) => {
  await run(db, 'DELETE FROM cart_items WHERE cart_id = $1', [cartId]);
};

export const setItems = async (cartId, lines, db = pool) => {
  await clear(cartId, db);

  for (const line of lines) {
    const [normalizedColor, normalizedSize] = variantKey(line.selectedColor, line.selectedSize);
    await run(
      db,
      `INSERT INTO cart_items (cart_id, product_id, quantity, selected_color, selected_size)
       VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''))
       ON CONFLICT (cart_id, product_id, COALESCE(selected_color, ''), COALESCE(selected_size, ''))
         DO UPDATE SET quantity = EXCLUDED.quantity`,
      [cartId, line.productId, line.quantity, normalizedColor, normalizedSize]
    );
  }
};
