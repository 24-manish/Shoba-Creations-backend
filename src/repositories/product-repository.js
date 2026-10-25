import { query } from '../db/pool.js';

// The column list is kept separate from the FROM clause so other repositories
// can reuse exactly the same projection against a different set of joins. The
// wishlist, for example, joins through the wishlists table but must return the
// same product shape as the catalogue so one card component works everywhere.
//
// Gallery entries carry id and position as well as src/alt. The storefront
// ignores them, but the admin editor needs both to reorder and delete a row, and
// returning them here is what lets upload, reorder and delete all answer with
// the same product shape instead of three different ones.
export const productColumns = `
  SELECT
    p.id,
    p.name,
    p.slug,
    p.sku,
    p.subcategory,
    p.description,
    p.price::float8 AS price,
    p.compare_at_price::float8 AS "compareAtPrice",
    p.discount_label AS "discountLabel",
    p.rating::float8 AS rating,
    p.review_count AS "reviewCount",
    p.stock,
    p.reorder_point AS "reorderPoint",
    p.colors,
    p.color_options AS "colorOptions",
    p.sizes,
    p.fabric,
    p.occasion,
    p.collection,
    p.region,
    p.artisan,
    p.details,
    p.care,
    p.tone,
    p.badge,
    p.is_new AS "isNew",
    p.is_featured AS "isFeatured",
    p.is_active AS "isActive",
    p.created_at AS "createdAt",
    p.updated_at AS "updatedAt",
    c.id AS "categoryId",
    c.name AS category,
    c.slug AS "categorySlug",
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', pi.id,
            'src', pi.url,
            'alt', COALESCE(pi.alt, p.name),
            'position', pi.position
          )
          ORDER BY pi.position, pi.created_at
        )
        FROM product_images pi
        WHERE pi.product_id = p.id
      ),
      '[]'::json
    ) AS images
`;

const productFrom = `
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
`;

const productSelect = `
${productColumns}
${productFrom}
`;

const buildFilters = ({
  category,
  search,
  minPrice,
  maxPrice,
  inStock,
  isFeatured,
  isNew,
  includeInactive = false
}) => {
  const conditions = [];
  const values = [];

  const push = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (!includeInactive) {
    conditions.push('p.is_active = TRUE');
  }

  if (category) {
    // The storefront routes by display name ("Gift Collections") while the
    // admin tooling uses slugs, so both are accepted.
    const placeholder = push(category);
    conditions.push(`(c.slug = ${placeholder} OR LOWER(c.name) = LOWER(${placeholder}) OR c.id::text = ${placeholder})`);
  }

  if (search) {
    const tsQuery = push(search);
    const likeQuery = push(`%${search}%`);
    conditions.push(
      `(p.search_vector @@ plainto_tsquery('simple', ${tsQuery}) OR p.name ILIKE ${likeQuery} OR p.sku ILIKE ${likeQuery})`
    );
  }

  if (minPrice !== undefined && minPrice !== null) {
    conditions.push(`p.price >= ${push(minPrice)}`);
  }

  if (maxPrice !== undefined && maxPrice !== null) {
    conditions.push(`p.price <= ${push(maxPrice)}`);
  }

  if (inStock) {
    conditions.push('p.stock > 0');
  }

  if (isFeatured) {
    conditions.push('p.is_featured = TRUE');
  }

  if (isNew) {
    conditions.push('p.is_new = TRUE');
  }

  return { conditions, values };
};

const SORTS = {
  featured: 'p.is_featured DESC, p.is_new DESC, p.created_at DESC',
  newest: 'p.is_new DESC, p.created_at DESC',
  price_asc: 'p.price ASC, p.name ASC',
  price_desc: 'p.price DESC, p.name ASC',
  name: 'p.name ASC'
};

export const list = async (filters = {}) => {
  const { page = 1, limit = 20, sort = 'featured' } = filters;
  const { conditions, values } = buildFilters(filters);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = SORTS[sort] ?? SORTS.featured;

  const countResult = await query(
    `SELECT COUNT(*)::int AS count ${productFrom} ${where}`,
    values
  );
  const total = Number(countResult.rows[0].count);

  if (page > 1 && total > 0 && (page - 1) * limit >= total) {
    return { items: [], pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  const offset = (page - 1) * limit;
  const listValues = [...values, limit, offset];
  const result = await query(
    `${productSelect} ${where}
     ORDER BY ${orderBy}
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    listValues
  );

  return {
    items: result.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit)
    }
  };
};

export const findById = async (id, { includeInactive = false } = {}) => {
  const where = includeInactive
    ? 'WHERE p.id = $1'
    : 'WHERE p.is_active = TRUE AND p.id = $1';
  const { rows } = await query(`${productSelect} ${where}`, [id]);

  return rows[0] ?? null;
};

export const findBySlug = async (slug, { includeInactive = false } = {}) => {
  const where = includeInactive
    ? 'WHERE p.slug = $1'
    : 'WHERE p.is_active = TRUE AND p.slug = $1';
  const { rows } = await query(`${productSelect} ${where}`, [slug]);

  return rows[0] ?? null;
};

export const findBySku = async (sku) => {
  const { rows } = await query(`${productSelect} WHERE p.sku = $1`, [sku]);

  return rows[0] ?? null;
};

export const listBySlugs = async (slugs) => {
  if (slugs.length === 0) {
    return [];
  }

  const { rows } = await query(
    `${productSelect} WHERE p.is_active = TRUE AND p.slug = ANY($1)`,
    [slugs]
  );

  return rows;
};

// Powers the "you may also like" rail: same category first, then the same
// subcategory, excluding the product being viewed.
export const findRelated = async (product, limit = 4) => {
  const { rows } = await query(
    `${productSelect}
     WHERE p.is_active = TRUE
       AND p.id <> $1
       AND (c.id = $2 OR p.subcategory = $3)
     ORDER BY
       (c.id = $2) DESC,
       (p.subcategory = $3) DESC,
       p.is_featured DESC,
       p.rating DESC
     LIMIT $4`,
    [product.id, product.categoryId ?? null, product.subcategory, limit]
  );

  return rows;
};

const INSERT_COLUMNS = `
  category_id, name, slug, sku, subcategory, description, price, compare_at_price,
  discount_label, rating, review_count, stock, reorder_point, colors, color_options,
  sizes, fabric, occasion, collection, region, artisan, details, care, tone, badge,
  is_new, is_featured, is_active
`;

const toColumnValues = (product) => [
  product.categoryId ?? null,
  product.name,
  product.slug,
  product.sku,
  product.subcategory ?? '',
  product.description ?? null,
  product.price,
  product.compareAtPrice ?? null,
  product.discountLabel ?? null,
  product.rating ?? 0,
  product.reviewCount ?? 0,
  product.stock ?? 0,
  product.reorderPoint ?? 5,
  product.colors ?? [],
  JSON.stringify(product.colorOptions ?? []),
  product.sizes ?? [],
  product.fabric ?? '',
  product.occasion ?? '',
  product.collection ?? '',
  product.region ?? '',
  product.artisan ?? '',
  product.details ?? [],
  product.care ?? [],
  product.tone ?? 'burgundy',
  product.badge ?? null,
  product.isNew ?? false,
  product.isFeatured ?? false,
  product.isActive ?? true
];

export const create = async (product) => {
  const values = toColumnValues(product);
  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
  const { rows } = await query(
    `INSERT INTO products (${INSERT_COLUMNS}) VALUES (${placeholders}) RETURNING id`,
    values
  );

  return findById(rows[0].id, { includeInactive: true });
};

const UPDATABLE = {
  categoryId: 'category_id',
  name: 'name',
  slug: 'slug',
  sku: 'sku',
  subcategory: 'subcategory',
  description: 'description',
  price: 'price',
  compareAtPrice: 'compare_at_price',
  discountLabel: 'discount_label',
  rating: 'rating',
  reviewCount: 'review_count',
  stock: 'stock',
  reorderPoint: 'reorder_point',
  colors: 'colors',
  colorOptions: 'color_options',
  sizes: 'sizes',
  fabric: 'fabric',
  occasion: 'occasion',
  collection: 'collection',
  region: 'region',
  artisan: 'artisan',
  details: 'details',
  care: 'care',
  tone: 'tone',
  badge: 'badge',
  isNew: 'is_new',
  isFeatured: 'is_featured',
  isActive: 'is_active'
};

export const update = async (id, fields) => {
  const values = [];
  const assignments = [];

  for (const [field, column] of Object.entries(UPDATABLE)) {
    if (fields[field] !== undefined) {
      values.push(field === 'colorOptions' ? JSON.stringify(fields[field]) : fields[field]);
      assignments.push(`${column} = $${values.length}`);
    }
  }

  if (assignments.length === 0) {
    return findById(id, { includeInactive: true });
  }

  values.push(id);
  await query(
    `UPDATE products SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`,
    values
  );

  return findById(id, { includeInactive: true });
};

// Stock changes are guarded so a concurrent checkout cannot drive stock negative.
export const setStock = async (id, stock, db = { query }) => {
  const { rows } = await db.query(
    `UPDATE products SET stock = $2, updated_at = NOW()
     WHERE id = $1 AND stock <> $2
     RETURNING id, stock`,
    [id, stock]
  );

  return rows[0] ?? null;
};

export const deactivate = async (id) => {
  await query('UPDATE products SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [id]);
  return findById(id, { includeInactive: true });
};

export const reactivate = async (id) => {
  await query('UPDATE products SET is_active = TRUE, updated_at = NOW() WHERE id = $1', [id]);
  return findById(id, { includeInactive: true });
};

export const deactivateMany = async (ids) => {
  if (ids.length === 0) {
    return [];
  }

  const { rows } = await query(
    'UPDATE products SET is_active = FALSE, updated_at = NOW() WHERE id = ANY($1::uuid[]) RETURNING id',
    [ids]
  );

  return rows.map((row) => row.id);
};

export const reactivateMany = async (ids) => {
  if (ids.length === 0) {
    return [];
  }

  const { rows } = await query(
    'UPDATE products SET is_active = TRUE, updated_at = NOW() WHERE id = ANY($1::uuid[]) RETURNING id',
    [ids]
  );

  return rows.map((row) => row.id);
};

// Order items keep a snapshot (name, price, sku) of the product, so a hard
// delete is safe against order history. The guard lives in the service; the
// repository just reports which products are referenced so the caller can
// refuse a destructive action they would otherwise lose lineage for.
export const findReferencedByOrders = async (ids) => {
  if (ids.length === 0) {
    return [];
  }

  const { rows } = await query(
    `SELECT DISTINCT oi.product_id AS id
     FROM order_items oi
     WHERE oi.product_id = ANY($1::uuid[])`,
    [ids]
  );

  return rows.map((row) => row.id);
};

export const purge = async (ids) => {
  const { rows } = await query(
    'DELETE FROM products WHERE id = ANY($1::uuid[]) RETURNING id, name',
    [ids]
  );

  return rows;
};

// Only files the API itself wrote are removed from disk on purge, so an
// externally hosted URL referenced by the catalogue is left alone.
export const findImageUrls = async (ids) => {
  if (ids.length === 0) {
    return [];
  }

  const { rows } = await query(
    `SELECT product_id AS "productId", url
     FROM product_images
     WHERE product_id = ANY($1::uuid[]) AND url LIKE '/uploads/%'`,
    [ids]
  );

  return rows;
};
