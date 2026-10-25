import { query } from '../../src/db/pool.js';
import { env } from '../../src/config/env.js';
import { migrate } from '../../scripts/migrate.js';
import { seed } from '../../scripts/seed.js';

/**
 * Rebuilds the isolated test schema from scratch and repopulates it.
 *
 * The suites share one schema and npm test pins --test-concurrency=1, so this
 * runs at the start of a file with nothing else touching the database. Dropping
 * the schema is what makes the run reproducible: the seed only upserts, so any
 * product a previous run created or archived, and any stock a previous run sold,
 * would otherwise still be here and would break the count-based assertions in
 * every suite that ran afterwards.
 */
export const resetDatabase = async () => {
  await query(`DROP SCHEMA IF EXISTS ${env.databaseSchema} CASCADE`);
  await migrate();
  await seed();
};

export const truncateOrders = async () => query('TRUNCATE orders, order_items, inventory_movements CASCADE');

/**
 * Removes the products a suite created. Products have no hard-delete endpoint on
 * purpose, so the cleanup happens in SQL here.
 */
export const removeTestData = async ({ productIds = [] } = {}) => {
  if (productIds.length === 0) {
    return;
  }

  await query('DELETE FROM product_images WHERE product_id = ANY($1::uuid[])', [productIds]);
  await query('DELETE FROM products WHERE id = ANY($1::uuid[])', [productIds]);
};
