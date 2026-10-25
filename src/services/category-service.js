import { query } from '../db/pool.js';
import { AppError } from '../middleware/async-handler.js';
import * as categoryRepository from '../repositories/category-repository.js';
import { uniqueSlug } from './slug.js';

export const list = () => categoryRepository.list();

// Categories are few and read on nearly every storefront page, so the product
// count is included to avoid a second round trip for the nav and filters.
export const listWithCounts = async () => {
  const { rows } = await query(
    `SELECT c.id, c.name, c.slug, c.description, c.tagline,
            c.hero_image_url AS "heroImageUrl", c.sort_order AS "sortOrder",
            c.is_active AS "isActive",
            COUNT(p.id)::int AS "productCount"
     FROM categories c
     LEFT JOIN products p ON p.category_id = c.id AND p.is_active = TRUE
     GROUP BY c.id
     ORDER BY c.sort_order ASC, c.name ASC`
  );

  return rows;
};

export const create = async ({ name, description = null }) => {
  const slug = await uniqueSlug(name, categoryRepository.findBySlug);
  return categoryRepository.create({ name, slug, description });
};

export const update = async (id, fields) => {
  const existing = await categoryRepository.findById(id);

  if (!existing) {
    throw new AppError(404, 'Category was not found', 'CATEGORY_NOT_FOUND');
  }

  if (Object.keys(fields).length === 0) {
    throw new AppError(400, 'At least one category field is required', 'EMPTY_UPDATE');
  }

  const updates = { ...fields };
  if (fields.name !== undefined) {
    updates.slug = await uniqueSlug(fields.name, categoryRepository.findBySlug, id);
  }

  return categoryRepository.update(id, updates);
};

// Deleting a category would orphan its products, so it is refused while any
// product still references it.
export const remove = async (id) => {
  const { rows } = await query('SELECT COUNT(*)::int AS count FROM products WHERE category_id = $1', [id]);

  if (rows[0].count > 0) {
    throw new AppError(
      409,
      `This category still has ${rows[0].count} product(s). Move or remove them first.`,
      'CATEGORY_IN_USE'
    );
  }

  const category = await categoryRepository.remove(id);

  if (!category) {
    throw new AppError(404, 'Category was not found', 'CATEGORY_NOT_FOUND');
  }

  return category;
};
