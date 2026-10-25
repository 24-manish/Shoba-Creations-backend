import { randomBytes, createHash } from 'node:crypto';
import { pool, query } from '../db/pool.js';

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export const hashRefreshToken = (token) => hashToken(token);

export const generateRefreshToken = () => {
  const token = randomBytes(48).toString('base64url');
  return { token, tokenHash: hashToken(token) };
};

export const create = async ({ userId, familyId, tokenHash, expiresAt, userAgent = null }) => {
  const { rows } = await query(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id AS "userId", family_id AS "familyId", expires_at AS "expiresAt"`,
    [userId, familyId, tokenHash, expiresAt, userAgent]
  );

  return rows[0];
};

export const findByTokenHash = async (tokenHash) => {
  const { rows } = await query(
    `SELECT id, user_id AS "userId", family_id AS "familyId", expires_at AS "expiresAt",
            revoked_at AS "revokedAt", replaced_by_id AS "replacedById"
     FROM refresh_tokens
     WHERE token_hash = $1`,
    [tokenHash]
  );

  return rows[0] ?? null;
};

// Rotating a token marks the old row revoked and points it at its replacement,
// so a replayed token can be traced back to the family it belongs to.
export const rotate = async (id, replacedById) => {
  const { rows } = await query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW(), replaced_by_id = $2
     WHERE id = $1 AND revoked_at IS NULL
     RETURNING id`,
    [id, replacedById]
  );

  return rows[0] ?? null;
};

export const revokeById = async (id) => {
  const { rowCount } = await query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL',
    [id]
  );

  return rowCount === 1;
};

// Reuse detection: a token that was already rotated being presented again means
// the value leaked, so the whole family is invalidated.
export const revokeFamily = async (familyId, db = pool) => {
  const { rowCount } = await db.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL',
    [familyId]
  );

  return rowCount;
};

export const revokeAllForUser = async (userId) => {
  const { rowCount } = await query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );

  return rowCount;
};

export const deleteExpired = async () => {
  const { rowCount } = await query(
    'DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL \'30 days\'',
    []
  );

  return rowCount;
};
