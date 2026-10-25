import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import * as userRepository from '../repositories/user-repository.js';
import * as refreshTokenRepository from '../repositories/refresh-token-repository.js';
import * as cartService from './cart-service.js';
import * as wishlistService from './wishlist-service.js';
import * as sessionService from './session-service.js';
import { AppError } from '../middleware/async-handler.js';

const PUBLIC_FIELDS = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  phone: user.phone ?? null,
  city: user.city ?? null,
  initials: user.initials ?? null
});

export const toPublicUser = PUBLIC_FIELDS;

// A constant-time comparison against a dummy hash keeps the response time for
// an unknown email indistinguishable from a wrong password, so the endpoint
// cannot be used to enumerate registered accounts.
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.7Qqk1M1M0MxbCvXqZLHv4aHxLxK6ta';

export const register = async ({ name, email, password, phone = null, city = null }) => {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await userRepository.findByEmail(normalizedEmail);

  if (existing) {
    throw new AppError(409, 'An account with this email already exists', 'EMAIL_TAKEN');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  return userRepository.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    phone,
    city
  });
};

export const authenticate = async ({ email, password }) => {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await userRepository.findByEmailWithPassword(normalizedEmail);

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw new AppError(401, 'Email or password is incorrect', 'INVALID_CREDENTIALS');
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    throw new AppError(401, 'Email or password is incorrect', 'INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    throw new AppError(403, 'This account has been deactivated', 'ACCOUNT_DISABLED');
  }

  return PUBLIC_FIELDS(user);
};

export const getProfile = async (userId) => {
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  return PUBLIC_FIELDS(user);
};

export const updateProfile = async (userId, fields) =>
  PUBLIC_FIELDS(await userRepository.updateProfile(userId, fields));

/**
 * Establishes the cookie session for a user.
 *
 * Signing in as an admin deliberately replaces any existing customer session
 * rather than running alongside it: the storefront supports one active role per
 * browser, so there is no way for a signed-in admin to be treated as a customer.
 */
export const startSession = async (user, { req, res, mergeGuestState = null }) => {
  const { token, expiresAt } = await sessionService.startSession(user.id, req.get('user-agent'));

  sessionService.setSessionCookies(res, {
    accessToken: sessionService.signAccessToken(user),
    refreshToken: token,
    refreshExpiresAt: expiresAt
  });

  // A guest may have built up a cart or wishlist before signing in; fold that
  // state into the account so nothing is lost.
  if (mergeGuestState) {
    const [cart, wishlist] = await Promise.all([
      cartService.mergeGuestCart({ userId: user.id, guestCart: mergeGuestState.cart }),
      wishlistService.mergeGuestWishlist({
        userId: user.id,
        guestProductIds: mergeGuestState.wishlist ?? []
      })
    ]);

    return { user, cart, wishlist };
  }

  return { user, cart: null, wishlist: null };
};

export const refresh = async ({ req, res }) => {
  const { refreshToken } = sessionService.readSessionCookies(req);
  const outcome = await sessionService.rotateSession({
    presentedToken: refreshToken,
    userAgent: req.get('user-agent')
  });

  // 'reused' and 'expired' both mean the family is no longer trustworthy.
  if (outcome.outcome !== 'rotated') {
    sessionService.clearSessionCookies(res);
    throw new AppError(401, 'Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
  }

  const user = await userRepository.findById(outcome.userId);

  if (!user || !user.isActive) {
    sessionService.clearSessionCookies(res);
    await refreshTokenRepository.revokeAllForUser(outcome.userId);
    throw new AppError(401, 'Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
  }

  sessionService.setSessionCookies(res, {
    accessToken: sessionService.signAccessToken(PUBLIC_FIELDS(user)),
    refreshToken: outcome.token,
    refreshExpiresAt: outcome.refreshExpiresAt
  });

  return PUBLIC_FIELDS(user);
};

export const endSession = async ({ req, res }) => {
  const { refreshToken } = sessionService.readSessionCookies(req);
  await sessionService.endSession(refreshToken);
  sessionService.clearSessionCookies(res);
};

export const signOutEverywhere = async ({ userId, req, res }) => {
  await refreshTokenRepository.revokeAllForUser(userId);
  sessionService.clearSessionCookies(res);
};

export const changePassword = async ({ userId, currentPassword, newPassword }) => {
  const user = await userRepository.findByEmailWithPassword(
    (await userRepository.findById(userId)).email
  );

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError(401, 'Current password is incorrect', 'INVALID_CREDENTIALS');
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1', [userId, passwordHash]);

  // Changing a password invalidates every existing session, including this one.
  await refreshTokenRepository.revokeAllForUser(userId);
};

export const cartTotals = async (userId) => cartService.getCart(userId);

export const wishlistTotals = async (userId) => wishlistService.getWishlist(userId);

export const thresholds = {
  freeShipping: env.freeShippingThreshold
};
