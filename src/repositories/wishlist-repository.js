import { query } from '../db/pool.js';
import { productColumns } from './product-repository.js';

// Wishlist entries are projected with the same column list the catalogue uses, so
// a saved product is indistinguishable from a catalogue product on the client and
// one card component can render both. The only difference is the join path:
// products are reached through the wishlists table rather than listed directly.
const wishlistProductSelect = `
${productColumns}
  FROM products p
  JOIN wishlists w ON w.product_id = p.id
  LEFT JOIN categories c ON c.id = p.category_id
`;

export const findProductIds = async (userId) => {
  const { rows } = await query(
    'SELECT product_id FROM wishlists WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );

  return rows.map((row) => row.product_id);
};

export const list = async (userId) => {
  const { rows } = await query(
    `${wishlistProductSelect} WHERE w.user_id = $1 ORDER BY w.created_at DESC`,
    [userId]
  );

  return rows;
};

// Adding an out-of-stock or deactivated product to a wishlist is still allowed;
// the item is returned with its stock state so the UI can explain why it cannot
// be bought. ON CONFLICT keeps repeated adds idempotent.
export const add = async (userId, productId) => {
  const { rows } = await query(
    `INSERT INTO wishlists (user_id, product_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, product_id) DO NOTHING
     RETURNING product_id AS "productId"`,
    [userId, productId]
  );

  return rows[0] ?? null;
};

export const remove = async (userId, productId) => {
  const { rowCount } = await query(
    'DELETE FROM wishlists WHERE user_id = $1 AND product_id = $2',
    [userId, productId]
  );

  return rowCount === 1;
};

export const has = async (userId, productId) => {
  const { rows } = await query(
    'SELECT 1 FROM wishlists WHERE user_id = $1 AND product_id = $2',
    [userId, productId]
  );

  return rows.length > 0;
};

export const clear = async (userId) => {
  const { rowCount } = await query('DELETE FROM wishlists WHERE user_id = $1', [userId]);
  return rowCount;
};

/**
 * Folds a guest's local wishlist into the account. Product ids are resolved by
 * slug, because the client only ever has slugs from the catalogue payload.
 */
export const merge = async (userId, slugs) => {
  if (!Array.isArray(slugs) || slugs.length === 0) {
    return 0;
  }

  const { rows } = await query(
    `INSERT INTO wishlists (user_id, product_id)
     SELECT $1, p.id
     FROM products p
     WHERE p.slug = ANY($2) AND p.is_active = TRUE
     ON CONFLICT (user_id, product_id) DO NOTHING
     RETURNING product_id`,
    [userId, slugs]
  );

  return rows.length;
};
