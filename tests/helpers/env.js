/**
 * Test environment bootstrap.
 *
 * This module must be the FIRST import in every test file. ES module evaluation
 * happens in import-declaration order, so the dotenv import and the assignments
 * below run before `src/config/env.js` is first evaluated and therefore before
 * `src/db/pool.js` builds its connection pool. Importing it later, or
 * indirectly, is too late.
 *
 * dotenv is loaded here rather than via `node --test --env-file` so that a bare
 * `npm test` works without depending on Node's CLI flag handling. Existing
 * environment variables win, so CI can still override the connection string.
 */
import 'dotenv/config';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const TEST_SCHEMA = process.env.TEST_DATABASE_SCHEMA ?? 'sc_test';

// The seeds are written to be re-runnable, so a wrong schema name would
// silently re-seed the development database instead of failing. Refuse to run
// unless the target is unmistakably a test schema.
if (!/_test$/.test(TEST_SCHEMA)) {
  throw new Error(
    `Refusing to run tests against schema "${TEST_SCHEMA}": TEST_DATABASE_SCHEMA must end with "_test". ` +
      'Tests truncate tables, so pointing them at public would destroy development data.'
  );
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run tests.');
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_SCHEMA = TEST_SCHEMA;
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-only-secret-not-used-in-production';
process.env.ACCESS_TOKEN_TTL = '15m';
process.env.REFRESH_TOKEN_TTL_DAYS = '7';
process.env.CORS_ORIGIN = 'http://localhost:5173';

// Uploads go to a throwaway directory so a test that saves an image cannot leave
// files in the repository's real uploads/ folder.
process.env.UPLOAD_DIR = process.env.TEST_UPLOAD_DIR ?? mkdtempSync(path.join(tmpdir(), 'sc-uploads-'));

process.env.ADMIN_NAME = 'Meera Chen';
process.env.ADMIN_EMAIL = 'admin@shobacreations.com';
process.env.ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'TestAdmin@2026';

export const TEST_ENV = {
  schema: TEST_SCHEMA,
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
  customerEmail: 'meera@example.com',
  customerPassword: 'Shoba@2026',
  // Identical to the documented demo account above; named separately so the
  // intent at each call site is obvious.
  seededCustomerEmail: 'meera@example.com',
  seededCustomerPassword: 'Shoba@2026'
};
