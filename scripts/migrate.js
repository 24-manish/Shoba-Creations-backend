import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query } from '../src/db/pool.js';
import { assertServerConfig, env } from '../src/config/env.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsPath = path.resolve(currentDirectory, '..', 'db', 'migrations');

/**
 * Applies every migration that has not run yet in the configured schema.
 *
 * Exported so the test suites can build an isolated schema using exactly the
 * same logic the CLI does, rather than a second copy that could drift.
 */
export const migrate = async ({ log = () => {} } = {}) => {
  assertServerConfig();

  // The configured schema may not exist yet, and pooled connections resolve
  // unqualified names against it, so it has to be created before any DDL runs.
  await query(`CREATE SCHEMA IF NOT EXISTS ${env.databaseSchema}`);
  await query(`SET search_path TO ${env.databaseSchema}, public`);

  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationFiles = (await readdir(migrationsPath))
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();

  const applied = [];

  for (const fileName of migrationFiles) {
    const existing = await query('SELECT name FROM schema_migrations WHERE name = $1', [fileName]);

    if (existing.rowCount > 0) {
      log(`Skipping ${fileName}`);
      continue;
    }

    const sql = await readFile(path.join(migrationsPath, fileName), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      // SET LOCAL keeps the transaction's search_path independent of whatever the
      // pooled session last used.
      await client.query(`SET LOCAL search_path TO ${env.databaseSchema}, public`);
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [fileName]);
      await client.query('COMMIT');
      log(`Applied ${fileName}`);
      applied.push(fileName);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return applied;
};

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  try {
    await migrate({ log: (message) => console.log(message) });
    console.log(`Migrations complete for schema "${env.databaseSchema}"`);
  } finally {
    await pool.end();
  }
}
