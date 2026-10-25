import { app } from './app.js';
import { assertServerConfig, env } from './config/env.js';
import { closePool } from './db/pool.js';
import * as refreshTokenRepository from './repositories/refresh-token-repository.js';

assertServerConfig();

// Expired refresh tokens are removed at boot and then hourly, which bounds the
// size of the table without needing a scheduled external job.
const pruneExpired = async () => {
  try {
    const removed = await refreshTokenRepository.deleteExpired();
    if (removed > 0) {
      console.log(`Pruned ${removed} expired refresh token(s)`);
    }
  } catch (error) {
    console.error('Failed to prune expired refresh tokens', error.message);
  }
};

await pruneExpired();
const pruneTimer = setInterval(pruneExpired, 60 * 60 * 1000);
pruneTimer.unref();

const server = app.listen(env.port, () => {
  console.log(`Shoba Creations API listening on port ${env.port} (schema: ${env.databaseSchema})`);
});

const shutdown = (signal) => {
  console.log(`${signal} received, shutting down`);
  clearInterval(pruneTimer);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
