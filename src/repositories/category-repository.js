import { query } from '../db/pool.js';

const categorySelect = `
  SELECT
    id,
    name,
    slug,
    description,
    created_at AS "createdAt",
    updated_at AS "updatedAt"
  FROM categories
`;

export const list = async () => {
  const { rows } = await query(`${categorySelect} ORDER BY name ASC`);
  return rows;
};

export const findById = async (id) => {
  const { rows } = await query(`${categorySelect} WHERE id = $1`, [id]);
  return rows[0] ?? null;
};

export const findBySlug = async (slug) => {
  const { rows } = await query(`${categorySelect} WHERE slug = $1`, [slug]);
  return rows[0] ?? null;
};

export const create = async ({ name, slug, description = null }) => {
  const { rows } = await query(
    `INSERT INTO categories (name, slug, description)
     VALUES ($1, $2, $3)
     RETURNING id, name, slug, description, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [name, slug, description]
  );

  return rows[0];
};

export const update = async (id, fields) => {
  const values = [];
  const updates = [];

  for (const [column, value] of Object.entries({ name: fields.name, slug: fields.slug, description: fields.description })) {
    if (value !== undefined) {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    }
  }

  if (updates.length === 0) {
    return findById(id);
  }

  values.push(id);
  const { rows } = await query(
    `UPDATE categories
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length}
     RETURNING id, name, slug, description, created_at AS "createdAt", updated_at AS "updatedAt"`,
    values
  );

  return rows[0] ?? null;
};

export const remove = async (id) => {
  const { rows } = await query(
    `DELETE FROM categories
     WHERE id = $1
     RETURNING id, name, slug, description, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [id]
  );

  return rows[0] ?? null;
};
