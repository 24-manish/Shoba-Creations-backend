import bcrypt from 'bcryptjs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../src/config/env.js';
import { pool, query } from '../src/db/pool.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const seedsPath = path.resolve(currentDirectory, '..', 'db', 'seeds');

const initialsFor = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

/**
 * Applies every SQL seed file in order, then upserts the admin account from
 * environment variables.
 *
 * Exported so tests can seed their isolated schema with the same fixtures the
 * development database uses.
 */
export const seed = async ({ log = () => {} } = {}) => {
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  await query(`CREATE SCHEMA IF NOT EXISTS ${env.databaseSchema}`);
  await query(`SET search_path TO ${env.databaseSchema}, public`);

  const seedFiles = (await readdir(seedsPath))
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();

  for (const fileName of seedFiles) {
    const sql = await readFile(path.join(seedsPath, fileName), 'utf8');
    // Each file is sent as one simple-query message, so PostgreSQL runs the whole
    // file inside a single implicit transaction and a late failure rolls the
    // entire file back.
    await query(sql);
    log(`Applied ${fileName}`);
  }

  if (!env.adminEmail || !env.adminPassword) {
    log('ADMIN_EMAIL and ADMIN_PASSWORD were not both set; admin user was not created');
    return { adminCreated: false };
  }

  if (env.adminPassword.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters');
  }

  const email = env.adminEmail.toLowerCase();
  const name = env.adminName;
  const passwordHash = await bcrypt.hash(env.adminPassword, 12);

  await query(
    `INSERT INTO users (name, email, password_hash, role, initials, is_active)
     VALUES ($1, $2, $3, 'admin', $4, TRUE)
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name,
       password_hash = EXCLUDED.password_hash,
       role = 'admin',
       initials = EXCLUDED.initials,
       is_active = TRUE,
       updated_at = NOW()`,
    [name, email, passwordHash, initialsFor(name)]
  );
  log(`Upserted admin user ${email}`);

  return { adminCreated: true, adminEmail: email };
};

export const seedSummary = async () => {
  const [{ count: products }] = (await query('SELECT COUNT(*)::int AS count FROM products')).rows;
  const [{ count: categories }] = (await query('SELECT COUNT(*)::int AS count FROM categories')).rows;
  const [{ count: orders }] = (await query('SELECT COUNT(*)::int AS count FROM orders')).rows;

  return { categories, products, orders };
};

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  try {
    await seed({ log: (message) => console.log(message) });
    const summary = await seedSummary();
    console.log(`Seeded ${summary.categories} categories, ${summary.products} products, ${summary.orders} orders`);
  } finally {
    await pool.end();
  }
}
