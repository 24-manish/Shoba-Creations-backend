import { query } from '../db/pool.js';

const userSelect = `
  SELECT
    id,
    email,
    name,
    role,
    phone,
    city,
    initials,
    is_active AS "isActive",
    created_at AS "createdAt",
    updated_at AS "updatedAt"
  FROM users
`;

const initialsFor = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

// Sign-in needs the hash, which is intentionally absent from userSelect so it
// cannot leak through a normal profile or admin-listing response.
export const findByEmailWithPassword = async (email) => {
  const { rows } = await query(
    'SELECT id, email, name, role, phone, city, initials, is_active AS "isActive", password_hash AS "passwordHash" FROM users WHERE email = $1',
    [email]
  );

  return rows[0] ?? null;
};

export const findByEmail = async (email) => {
  const { rows } = await query(`${userSelect} WHERE email = $1`, [email]);
  return rows[0] ?? null;
};

export const findById = async (id) => {
  const { rows } = await query(`${userSelect} WHERE id = $1`, [id]);
  return rows[0] ?? null;
};

export const create = async ({ name, email, passwordHash, role = 'customer', phone = null, city = null }) => {
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role, phone, city, initials)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, email, name, role, phone, city, initials,
               is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"`,
    [name, email, passwordHash, role, phone, city, initialsFor(name)]
  );

  return rows[0];
};

export const updateProfile = async (id, fields) => {
  const values = [];
  const assignments = [];

  if (fields.name !== undefined) {
    values.push(fields.name);
    assignments.push(`name = $${values.length}`);
    values.push(initialsFor(fields.name));
    assignments.push(`initials = $${values.length}`);
  }

  if (fields.phone !== undefined) {
    values.push(fields.phone);
    assignments.push(`phone = $${values.length}`);
  }

  if (fields.city !== undefined) {
    values.push(fields.city);
    assignments.push(`city = $${values.length}`);
  }

  if (assignments.length === 0) {
    return findById(id);
  }

  values.push(id);
  await query(
    `UPDATE users SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`,
    values
  );

  return findById(id);
};

export const list = async ({ role } = {}) => {
  const values = [];
  let where = '';

  if (role) {
    values.push(role);
    where = 'WHERE role = $1';
  }

  const { rows } = await query(
    `${userSelect} ${where} ORDER BY created_at DESC`,
    values
  );

  return rows;
};
