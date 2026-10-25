import { randomUUID } from 'node:crypto';
import { query } from '../db/pool.js';
import { AppError } from '../middleware/async-handler.js';
import { buildStoredFile } from '../middleware/upload.js';
import { uploadToStorage, deleteFromStorage } from '../lib/s3.js';
import { env } from '../config/env.js';
import * as productRepository from '../repositories/product-repository.js';
import { uniqueSlug } from './slug.js';

export const listPublic = (filters) =>
  productRepository.list({ ...filters, includeInactive: false });

export const listAdmin = (filters) =>
  productRepository.list({ ...filters, includeInactive: filters.includeInactive ?? false });

export const getPublicById = async (id) => {
  const product = await productRepository.findById(id);

  if (!product) {
    throw new AppError(404, 'Product was not found', 'PRODUCT_NOT_FOUND');
  }

  return product;
};

export const getAdminById = async (id) => {
  const product = await productRepository.findById(id, { includeInactive: true });

  if (!product) {
    throw new AppError(404, 'Product was not found', 'PRODUCT_NOT_FOUND');
  }

  return product;
};

export const getPublicBySlug = async (slug) => {
  const product = await productRepository.findBySlug(slug);

  if (!product) {
    throw new AppError(404, 'Product was not found', 'PRODUCT_NOT_FOUND');
  }

  return { product, related: await productRepository.findRelated(product) };
};

const resolveCategoryId = async (input, db = { query }) => {
  if (input.categoryId !== undefined) {
    return input.categoryId;
  }

  if (!input.categoryName) {
    return undefined;
  }

  // The admin form works with category names, so resolve or create by name.
  const { rows } = await db.query(
    `INSERT INTO categories (name, slug)
     VALUES ($1, lower(regexp_replace($1, '[^a-zA-Z0-9]+', '-', 'g')))
     ON CONFLICT (slug) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [input.categoryName.trim()]
  );

  return rows[0].id;
};

// One brand, one unhackable naming scheme: SC- followed by eight random
// characters. Retried against the unique column so a stray collision (which is
// essentially impossible) never becomes a 500.
const generateSku = async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const sku = `SC-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    if (!(await productRepository.findBySku(sku))) {
      return sku;
    }
  }

  throw new AppError(500, 'Could not allocate a unique SKU', 'SKU_GENERATION_FAILED');
};

export const create = async (input) => {
  const slug = await uniqueSlug(input.name, (candidate) => productRepository.findBySlug(candidate));
  const categoryId = await resolveCategoryId(input);

  return productRepository.create({
    ...input,
    categoryId: categoryId ?? null,
    slug,
    sku: await generateSku(),
    isActive: input.isActive ?? true
  });
};

export const update = async (id, input) => {
  await getAdminById(id);

  const fields = { ...input };

  if (input.name !== undefined) {
    fields.slug = await uniqueSlug(
      input.name,
      (candidate) => productRepository.findBySlug(candidate),
      id
    );
  }

  if (input.categoryName !== undefined) {
    fields.categoryId = await resolveCategoryId(input);
  }

  return productRepository.update(id, fields);
};

export const deactivate = async (id) => {
  const product = await productRepository.deactivate(id);

  if (!product) {
    throw new AppError(404, 'Product was not found', 'PRODUCT_NOT_FOUND');
  }

  return product;
};

export const reactivate = async (id) => {
  const product = await productRepository.reactivate(id);

  if (!product) {
    throw new AppError(404, 'Product was not found', 'PRODUCT_NOT_FOUND');
  }

  return product;
};

export const archiveMany = async (ids) => {
  if (ids.length === 0) {
    throw new AppError(400, 'No products were selected', 'EMPTY_SELECTION');
  }

  return productRepository.deactivateMany(ids);
};

export const restoreMany = async (ids) => {
  if (ids.length === 0) {
    throw new AppError(400, 'No products were selected', 'EMPTY_SELECTION');
  }

  return productRepository.reactivateMany(ids);
};

const extractStorageKey = (url) => {
  // Extract the key from S3 URL: https://endpoint/bucket/key
  if (!url) return null;
  const parts = url.split('/');
  const bucketIndex = parts.findIndex(p => p === env.s3Bucket);
  if (bucketIndex === -1 || bucketIndex === parts.length - 1) return null;
  return parts.slice(bucketIndex + 1).join('/');
};

const removeStoredFiles = async (urls) => {
  for (const { url } of urls) {
    const key = extractStorageKey(url);
    if (key) {
      await deleteFromStorage(key).catch(() => {});
    }
  }
};

/**
 * Permanently removes a product from the database and storage. Order items keep a
 * snapshot, so purging cannot corrupt order history; the force flag is still
 * required once a product has been referenced so a bulk purge cannot silently
 * destroy the lineage a customer history page relies on.
 */
export const purgeProduct = async (id, { force = false } = {}) => {
  await getAdminById(id);

  if (!force) {
    const referenced = await productRepository.findReferencedByOrders([id]);
    if (referenced.length > 0) {
      throw new AppError(409, 'This product is part of order history. Restore it or pass force to delete permanently.', 'PRODUCT_IN_ORDER_HISTORY');
    }
  }

  const urlRows = await productRepository.findImageUrls([id]);
  const rows = await productRepository.purge([id]);

  if (rows.length === 0) {
    throw new AppError(404, 'Product was not found', 'PRODUCT_NOT_FOUND');
  }

  await removeStoredFiles(urlRows);
  return rows[0];
};

/**
 * Purging several products at once is refused wholesale if any of them carries
 * order history unless forced, because a partial success would leave the UI in
 * an uncertain state about which rows survived.
 */
export const purgeMany = async (ids, { force = false } = {}) => {
  if (ids.length === 0) {
    throw new AppError(400, 'No products were selected', 'EMPTY_SELECTION');
  }

  const referenced = force ? [] : await productRepository.findReferencedByOrders(ids);

  if (referenced.length > 0) {
    throw new AppError(
      409,
      'Some of these products are part of order history. Restore them or pass force to delete permanently.',
      'PRODUCT_IN_ORDER_HISTORY',
      referenced.map((id) => ({ path: ['productIds'], message: 'Referenced by order history' }))
    );
  }

  const urlRows = await productRepository.findImageUrls(ids);
  const rows = await productRepository.purge(ids);
  await removeStoredFiles(urlRows);

  return rows;
};

const nextPosition = async (productId, db) => {
  const { rows } = await db.query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM product_images WHERE product_id = $1',
    [productId]
  );

  return rows[0].next;
};

/**
 * Persists uploaded images to Supabase Storage (S3-compatible). A single product is capped at twelve
 * galleries; the first upload always becomes position 0 so the card art is the
 * primary image.
 */
export const addImages = async (productId, files) => {
  const product = await getAdminById(productId);

  const { rows } = await query(
    'SELECT COUNT(*)::int AS count FROM product_images WHERE product_id = $1',
    [productId]
  );

  if (rows[0].count + files.length > 12) {
    throw new AppError(400, 'A product can have at most 12 images', 'IMAGE_LIMIT_REACHED');
  }

  for (const file of files) {
    // multer's memoryStorage does not populate file.filename, and using the
    // client-supplied originalname as a path would be unsafe anyway. buildStoredFile
    // verifies the bytes match the declared type and returns a random key.
    const { key, extension } = buildStoredFile(file);

    const url = await uploadToStorage(key, file.buffer, file.mimetype);

    await query(
      `INSERT INTO product_images (product_id, url, alt, position)
       VALUES ($1, $2, $3, $4)`,
      [productId, url, product.name, await nextPosition(productId, { query })]
    );
  }

  // Upload, reorder and delete all answer with the updated product so the admin
  // editor can replace its state from any of the three without re-fetching.
  return getAdminById(productId);
};

export const deleteImage = async (productId, imageId) => {
  const { rows } = await query(
    'DELETE FROM product_images WHERE id = $1 AND product_id = $2 RETURNING url',
    [imageId, productId]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'Image was not found', 'IMAGE_NOT_FOUND');
  }

  // Only files the API itself wrote are removed from storage, so an externally
  // hosted URL referenced by the catalogue is left alone.
  const url = rows[0].url;
  const key = extractStorageKey(url);
  if (key) {
    await deleteFromStorage(key).catch(() => {});
  }

  return getAdminById(productId);
};

export const reorderImages = async (productId, imageIds) => {
  await getAdminById(productId);

  // The submitted list has to be exactly the images this product owns, so a
  // reorder cannot drop a row or smuggle in an image from another product.
  const { rows } = await query('SELECT id FROM product_images WHERE product_id = $1', [productId]);
  const existingIds = new Set(rows.map((row) => row.id));

  if (imageIds.length !== existingIds.size || imageIds.some((id) => !existingIds.has(id))) {
    throw new AppError(400, 'The image list must contain every image for this product exactly once', 'INVALID_IMAGE_ORDER');
  }

  await Promise.all(
    imageIds.map((imageId, index) =>
      query(
        'UPDATE product_images SET position = $3 WHERE id = $1 AND product_id = $2',
        [imageId, productId, index]
      )
    )
  );

  return getAdminById(productId);
};

export const lowStock = async ({ limit = 50 } = {}) => {
  const { rows } = await query(
    `SELECT id, name, slug, sku, stock, reorder_point AS "reorderPoint"
     FROM products
     WHERE is_active = TRUE AND stock <= reorder_point
     ORDER BY stock ASC, name ASC
     LIMIT $1`,
    [limit]
  );

  return rows;
};