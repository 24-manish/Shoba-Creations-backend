import { query } from '../db/pool.js';

/**
 * Reads and writes for the storefront's editorial content: the journal cards,
 * the customer quotes, and the decorative brand images.
 *
 * The public queries filter on publication state here in the repository rather
 * than in the service, so an unpublished row can never leak through a forgotten
 * check at the controller.
 *
 * Each column list is declared once and reused by both the SELECT and the
 * RETURNING clauses, because `RETURNING *` would hand back raw snake_case
 * column names and quietly break the camelCase contract every other repository
 * keeps.
 */

const storyColumns = `
  id,
  slug,
  title,
  excerpt,
  body,
  image_url AS "imageUrl",
  image_alt AS "imageAlt",
  read_time AS "readTime",
  author_name AS "authorName",
  sort_order AS "sortOrder",
  is_published AS "isPublished",
  published_at AS "publishedAt",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const testimonialColumns = `
  id,
  user_id AS "userId",
  name,
  city,
  quote,
  rating,
  image_url AS "imageUrl",
  image_alt AS "imageAlt",
  sort_order AS "sortOrder",
  is_published AS "isPublished",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const siteImageColumns = `
  id,
  key,
  url,
  alt,
  width,
  height,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

// ---------------------------------------------------------------------------
// Editorial stories
// ---------------------------------------------------------------------------

export const listPublishedStories = async ({ limit = 20 } = {}) => {
  const { rows } = await query(
    `SELECT ${storyColumns}
     FROM editorial_stories
     WHERE is_published = TRUE
     ORDER BY published_at DESC, sort_order ASC, id ASC
     LIMIT $1`,
    [limit]
  );

  return rows;
};

export const findPublishedStoryBySlug = async (slug) => {
  const { rows } = await query(
    `SELECT ${storyColumns}
     FROM editorial_stories
     WHERE slug = $1 AND is_published = TRUE`,
    [slug]
  );

  return rows[0] ?? null;
};

export const listAllStories = async () => {
  const { rows } = await query(
    `SELECT ${storyColumns}
     FROM editorial_stories
     ORDER BY sort_order ASC, published_at DESC NULLS LAST, id ASC`
  );

  return rows;
};

export const findStoryById = async (id) => {
  const { rows } = await query(`SELECT ${storyColumns} FROM editorial_stories WHERE id = $1`, [id]);
  return rows[0] ?? null;
};

export const createStory = async (payload) => {
  const { rows } = await query(
    `INSERT INTO editorial_stories (
       slug, title, excerpt, body, image_url, image_alt, read_time,
       author_name, sort_order, is_published, published_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${storyColumns}`,
    [
      payload.slug,
      payload.title,
      payload.excerpt,
      payload.body ?? null,
      payload.imageUrl,
      payload.imageAlt ?? '',
      payload.readTime ?? null,
      payload.authorName ?? null,
      payload.sortOrder ?? 0,
      payload.isPublished ?? false,
      // The table rejects a published story with no date, so the default has to be
      // resolved here rather than left to a column default that does not exist.
      payload.isPublished ? (payload.publishedAt ?? new Date()) : null,
    ]
  );

  return rows[0];
};

const storyUpdatableColumns = {
  slug: 'slug',
  title: 'title',
  excerpt: 'excerpt',
  body: 'body',
  imageUrl: 'image_url',
  imageAlt: 'image_alt',
  readTime: 'read_time',
  authorName: 'author_name',
  sortOrder: 'sort_order',
  isPublished: 'is_published',
  publishedAt: 'published_at',
};

export const updateStory = async (id, fields) => {
  const values = [];
  const updates = [];

  for (const [field, column] of Object.entries(storyUpdatableColumns)) {
    if (fields[field] !== undefined) {
      values.push(fields[field]);
      updates.push(`${column} = $${values.length}`);
    }
  }

  if (updates.length === 0) {
    return findStoryById(id);
  }

  values.push(id);
  const { rows } = await query(
    `UPDATE editorial_stories
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length}
     RETURNING ${storyColumns}`,
    values
  );

  return rows[0] ?? null;
};

export const deleteStory = async (id) => {
  const { rows } = await query('DELETE FROM editorial_stories WHERE id = $1 RETURNING id', [id]);
  return rows[0] ?? null;
};

// ---------------------------------------------------------------------------
// Testimonials
// ---------------------------------------------------------------------------

export const listPublishedTestimonials = async ({ limit = 12 } = {}) => {
  const { rows } = await query(
    `SELECT ${testimonialColumns}
     FROM testimonials
     WHERE is_published = TRUE
     ORDER BY sort_order ASC, created_at DESC
     LIMIT $1`,
    [limit]
  );

  return rows;
};

export const listAllTestimonials = async () => {
  const { rows } = await query(
    `SELECT ${testimonialColumns}
     FROM testimonials
     ORDER BY sort_order ASC, created_at DESC`
  );

  return rows;
};

export const findTestimonialById = async (id) => {
  const { rows } = await query(`SELECT ${testimonialColumns} FROM testimonials WHERE id = $1`, [id]);
  return rows[0] ?? null;
};

export const createTestimonial = async (payload) => {
  const { rows } = await query(
    `INSERT INTO testimonials (
       user_id, name, city, quote, rating, image_url, image_alt, sort_order, is_published
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${testimonialColumns}`,
    [
      payload.userId ?? null,
      payload.name,
      payload.city ?? null,
      payload.quote,
      payload.rating ?? 5,
      payload.imageUrl ?? null,
      payload.imageAlt ?? '',
      payload.sortOrder ?? 0,
      payload.isPublished ?? false,
    ]
  );

  return rows[0];
};

const testimonialUpdatableColumns = {
  name: 'name',
  city: 'city',
  quote: 'quote',
  rating: 'rating',
  imageUrl: 'image_url',
  imageAlt: 'image_alt',
  sortOrder: 'sort_order',
  isPublished: 'is_published',
};

export const updateTestimonial = async (id, fields) => {
  const values = [];
  const updates = [];

  for (const [field, column] of Object.entries(testimonialUpdatableColumns)) {
    if (fields[field] !== undefined) {
      values.push(fields[field]);
      updates.push(`${column} = $${values.length}`);
    }
  }

  if (updates.length === 0) {
    return findTestimonialById(id);
  }

  values.push(id);
  const { rows } = await query(
    `UPDATE testimonials
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length}
     RETURNING ${testimonialColumns}`,
    values
  );

  return rows[0] ?? null;
};

export const deleteTestimonial = async (id) => {
  const { rows } = await query('DELETE FROM testimonials WHERE id = $1 RETURNING id', [id]);
  return rows[0] ?? null;
};

// ---------------------------------------------------------------------------
// Site images
// ---------------------------------------------------------------------------

/**
 * The storefront needs a small fixed set of brand images, so they are returned as
 * a key/value map rather than a list: the caller can look up `hero` without
 * caring what order the rows came back in.
 */
export const listActiveSiteImages = async () => {
  const { rows } = await query(
    `SELECT ${siteImageColumns} FROM site_images WHERE is_active = TRUE ORDER BY key ASC`
  );

  return Object.fromEntries(rows.map((row) => [row.key, row]));
};

export const upsertSiteImage = async ({ key, url, alt = '', width = null, height = null }) => {
  const { rows } = await query(
    `INSERT INTO site_images (key, url, alt, width, height)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (key) DO UPDATE SET
       url = EXCLUDED.url,
       alt = EXCLUDED.alt,
       width = EXCLUDED.width,
       height = EXCLUDED.height,
       updated_at = NOW()
     RETURNING ${siteImageColumns}`,
    [key, url, alt, width, height]
  );

  return rows[0];
};
