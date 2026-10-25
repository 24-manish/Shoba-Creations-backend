import { randomUUID, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import {
  accessCookieName,
  csrfCookieName,
  env,
  refreshCookieName
} from '../config/env.js';
import * as refreshTokenRepository from '../repositories/refresh-token-repository.js';

const baseCookieOptions = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: env.isProduction ? 'none' : 'lax',
  path: '/'
};

const DURATION_UNITS = { s: 1, m: 60, h: 3600, d: 86400 };

const parseDuration = (value) => {
  const match = /^(\d+)([smhd])$/.exec(String(value).trim());

  if (!match) {
    return 900;
  }

  return Number(match[1]) * DURATION_UNITS[match[2]];
};

export const accessTokenSeconds = () => parseDuration(env.accessTokenTtl);
export const refreshTokenSeconds = () => env.refreshTokenTtlDays * 86400;

export const signAccessToken = (user) =>
  jwt.sign({ sub: user.id, email: user.email, role: user.role }, env.jwtSecret, {
    expiresIn: env.accessTokenTtl
  });

export const verifyAccessToken = (token) => {
  const payload = jwt.verify(token, env.jwtSecret);

  if (typeof payload === 'string' || !payload.sub) {
    throw new Error('Invalid token payload');
  }

  return payload;
};

// The CSRF cookie is deliberately readable by JavaScript: the client echoes it
// back in the X-CSRF-Token header, which a cross-origin attacker cannot read.
// sameSite=lax already blocks the cookie on cross-site requests, so this is
// defence in depth rather than the primary control.
export const issueCsrfToken = (res) => {
  const token = randomBytes(24).toString('base64url');

  res.cookie(csrfCookieName, token, {
    ...baseCookieOptions,
    httpOnly: false,
    maxAge: refreshTokenSeconds() * 1000
  });

  return token;
};

export const setSessionCookies = (res, { accessToken, refreshToken, refreshExpiresAt }) => {
  res.cookie(accessCookieName, accessToken, {
    ...baseCookieOptions,
    maxAge: accessTokenSeconds() * 1000
  });

  res.cookie(refreshCookieName, refreshToken, {
    ...baseCookieOptions,
    maxAge: Math.max(0, refreshExpiresAt.getTime() - Date.now())
  });

  issueCsrfToken(res);
};

export const clearSessionCookies = (res) => {
  const options = { ...baseCookieOptions, maxAge: 0 };

  res.clearCookie(accessCookieName, options);
  res.clearCookie(refreshCookieName, options);
  res.clearCookie(csrfCookieName, { ...options, httpOnly: false });
};

export const readSessionCookies = (req) => ({
  accessToken: req.cookies?.[accessCookieName] ?? null,
  refreshToken: req.cookies?.[refreshCookieName] ?? null
});

const issueRefreshToken = async (userId, familyId, userAgent) => {
  const { token, tokenHash } = refreshTokenRepository.generateRefreshToken();
  const expiresAt = new Date(Date.now() + refreshTokenSeconds() * 1000);

  const record = await refreshTokenRepository.create({
    userId,
    familyId,
    tokenHash,
    expiresAt,
    userAgent: userAgent ?? null
  });

  return { token, expiresAt, record };
};

export const startSession = (userId, userAgent) =>
  issueRefreshToken(userId, randomUUID(), userAgent);

// Rotates within the same token family. A token that was already rotated being
// presented again means the value was captured, so the entire family is revoked
// and the user is forced to sign in again.
export const rotateSession = async ({ presentedToken, userAgent }) => {
  if (!presentedToken) {
    return { outcome: 'missing' };
  }

  const existing = await refreshTokenRepository.findByTokenHash(
    refreshTokenRepository.hashRefreshToken(presentedToken)
  );

  if (!existing) {
    return { outcome: 'invalid' };
  }

  if (existing.revokedAt) {
    await refreshTokenRepository.revokeFamily(existing.familyId);
    return { outcome: 'reused' };
  }

  if (new Date(existing.expiresAt).getTime() <= Date.now()) {
    await refreshTokenRepository.revokeFamily(existing.familyId);
    return { outcome: 'expired' };
  }

  const next = await issueRefreshToken(existing.userId, existing.familyId, userAgent);
  const rotated = await refreshTokenRepository.rotate(existing.id, next.record.id);

  if (!rotated) {
    await refreshTokenRepository.revokeFamily(existing.familyId);
    return { outcome: 'reused' };
  }

  return {
    outcome: 'rotated',
    userId: existing.userId,
    token: next.token,
    refreshExpiresAt: next.expiresAt
  };
};

export const endSession = async (presentedToken) => {
  if (!presentedToken) {
    return 0;
  }

  const existing = await refreshTokenRepository.findByTokenHash(
    refreshTokenRepository.hashRefreshToken(presentedToken)
  );

  if (!existing) {
    return 0;
  }

  return refreshTokenRepository.revokeFamily(existing.familyId);
};
