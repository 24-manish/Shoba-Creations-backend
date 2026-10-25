import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

// The application user may lack CREATEDB, so test isolation is done with a
// dedicated schema rather than a separate database. Every pooled connection
// resolves unqualified names inside that schema.
const poolConfig = {
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
};

if (env.databaseUrl) {
  poolConfig.connectionString = env.databaseUrl;
}

if (env.databaseSsl) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

if (env.databaseSchema !== 'public') {
  poolConfig.options = `-c search_path=${env.databaseSchema},public`;
}

export const pool = new Pool(poolConfig);

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error', error);
});

export const query = (text, params) => pool.query(text, params);

export const withTransaction = async (callback) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const closePool = () => pool.end();
